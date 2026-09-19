"""Review the exact committed static payload without executing its contents."""

import argparse
import io
import json
import re
import stat
import subprocess
import sys
import urllib.parse
import zipfile
from pathlib import Path

from verify_seeds import safe_path

ROOT = Path(__file__).resolve().parents[1]
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_ARCHIVE_FILES = 200
URL = re.compile(r"https?://[^\s\"'<>\\]+")
RULES = {
    "private-home-path": re.compile(r"/(?:Users|home)/[^\s\"'<>]+"),
    "private-temporary-path": re.compile(r"/(?:private/var|var/folders)/[^\s\"'<>]+"),
    "private-session-store": re.compile(r"\.copilot[/]session-state"),
    "private-execution-identifier": re.compile(
        r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
        re.IGNORECASE,
    ),
    "private-key": re.compile(r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----"),
    "credential-token": re.compile(
        r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|"
        r"sk-(?:proj|live)-[A-Za-z0-9_-]{20,})\b"
    ),
}
FORBIDDEN_PARTS = {".git", ".copilot", ".preview", "node_modules", "__pycache__"}
FORBIDDEN_NAMES = {".env", "id_rsa", "id_ed25519", ".DS_Store"}


def inspect_text(name, data):
    text = data.decode("utf-8", errors="ignore").replace("\\/", "/")
    findings = []
    for match in URL.finditer(text):
        try:
            parsed = urllib.parse.urlsplit(match.group())
        except ValueError:
            continue
        synthetic_rejection_fixture = (
            "tests" in Path(name).parts
            and parsed.hostname == "example.invalid"
            and parsed.username == "synthetic"
            and parsed.password == "synthetic"
        )
        if (parsed.username or parsed.password) and not synthetic_rejection_fixture:
            findings.append({"path": name, "rule": "credentialed-url"})
        keys = {key.lower() for key, _ in urllib.parse.parse_qsl(parsed.query)}
        if keys & {"access_token", "api_key", "apikey", "client_secret", "password"}:
            findings.append({"path": name, "rule": "credential-query"})
    # Check machine paths outside public URLs to avoid misclassifying articles.
    without_urls = URL.sub("<public-url>", text)
    for rule, pattern in RULES.items():
        inspected = without_urls if rule in ("private-home-path", "private-temporary-path") else text
        if pattern.search(inspected):
            findings.append({"path": name, "rule": rule})
    return findings


def inspect_blob(name, data):
    findings = []
    try:
        safe_path(name)
    except ValueError:
        return [{"path": name, "rule": "unsafe-path"}]
    parts = set(Path(name).parts)
    if parts & FORBIDDEN_PARTS or Path(name).name in FORBIDDEN_NAMES:
        findings.append({"path": name, "rule": "private-or-generated-file"})
    if len(data) > MAX_FILE_BYTES:
        return findings + [{"path": name, "rule": "oversized-file"}]
    if data.startswith(b"version https://git-lfs.github.com/spec/v1"):
        findings.append({"path": name, "rule": "unresolved-lfs-pointer"})
    if not name.endswith(".zip"):
        return findings + inspect_text(name, data)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ARCHIVE_FILES or sum(item.file_size for item in entries) > MAX_FILE_BYTES:
                return findings + [{"path": name, "rule": "unbounded-archive"}]
            seen = set()
            for item in entries:
                safe_path(item.filename)
                folded = item.filename.casefold()
                if folded in seen:
                    raise ValueError("Duplicate archive path")
                seen.add(folded)
                kind = stat.S_IFMT(item.external_attr >> 16)
                if item.is_dir() or kind not in (0, stat.S_IFREG) or item.flag_bits & 1:
                    raise ValueError("Non-regular or encrypted archive entry")
                if item.filename.endswith(".zip"):
                    raise ValueError("Nested archive is outside this payload policy")
                for finding in inspect_blob(item.filename, archive.read(item)):
                    findings.append({**finding, "path": name + "!" + finding["path"]})
    except (ValueError, zipfile.BadZipFile, RuntimeError):
        findings.append({"path": name, "rule": "invalid-archive"})
    return findings


def scan_revision(root, revision="HEAD"):
    tree = subprocess.check_output(
        ["git", "ls-tree", "-rz", "--full-tree", revision], cwd=root
    )
    findings = []
    files = 0
    total_bytes = 0
    for record in tree.split(b"\0"):
        if not record:
            continue
        metadata, raw_name = record.split(b"\t", 1)
        mode, kind, object_id = metadata.decode("ascii").split()
        name = raw_name.decode("utf-8")
        if mode not in ("100644", "100755") or kind != "blob":
            findings.append({"path": name, "rule": "non-regular-git-entry"})
            continue
        data = subprocess.check_output(["git", "cat-file", "blob", object_id], cwd=root)
        files += 1
        total_bytes += len(data)
        findings.extend(inspect_blob(name, data))
    revision_id = subprocess.check_output(
        ["git", "rev-parse", revision], cwd=root, text=True
    ).strip()
    return {
        "schema": "hive-public-payload-review/1",
        "revision": revision_id,
        "files": files,
        "bytes": total_bytes,
        "status": "passed" if not findings else "blocked",
        "findings": findings,
        "scope": "Committed file bytes and bounded ZIP members; private Git history is not an export.",
        "limitations": "Pattern and path review is not proof that arbitrary content is safe to publish.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--revision", default="HEAD")
    args = parser.parse_args()
    report = scan_revision(args.root.resolve(), args.revision)
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
