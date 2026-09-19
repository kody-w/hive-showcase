"""Small shared path, byte-integrity, and public-metadata checks."""

import hashlib
import json
from pathlib import Path, PurePosixPath
import re

ROOT = Path(__file__).resolve().parents[3]
RELATIVE_PROJECT = Path("projects/09-handoff")
PROJECT = ROOT / RELATIVE_PROJECT
INTEGRITY_PATH = "projects/09-handoff/evidence/public-integrity.json"
PRIVATE_KEYS = frozenset((
    "agent_id", "continuation_agent_id", "session_id", "prompt",
    "workspace", "working_directory", "registry_agent_id",
))
PRIVATE_PATTERNS = {
    "private-identifier": re.compile(
        r"\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b", re.I
    ),
    "machine-path": re.compile(
        r"(?:/(?:Users|home|tmp|private|var/(?:tmp|folders))/"
        r"|[A-Za-z]:[\\/](?:Users|Temp)[\\/])", re.I
    ),
    "session-store-path": re.compile(r"\.copilot[/\\]session-state|hive-worktrees[/\\]", re.I),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def scoped_path(relative):
    logical = PurePosixPath(relative)
    if logical.is_absolute() or ".." in logical.parts:
        raise ValueError("Expected a repository-relative project path")
    path = ROOT / logical
    if not path.resolve().is_relative_to(PROJECT) or path.is_symlink():
        raise ValueError("Path is outside the public project or is a symlink")
    return path


def privacy_findings(text):
    strings = [text]
    findings = set()

    def inspect(value):
        if isinstance(value, dict):
            if PRIVATE_KEYS.intersection(value):
                findings.add("private-operational-field")
            for child in value.values():
                inspect(child)
        elif isinstance(value, list):
            for child in value:
                inspect(child)
        elif isinstance(value, str):
            strings.append(value)

    try:
        inspect(json.loads(text))
    except ValueError:
        pass
    for name, pattern in PRIVATE_PATTERNS.items():
        if any(pattern.search(value) for value in strings):
            findings.add(name)
    return sorted(findings)


def portable_text(text, root=ROOT):
    prefix = str(root)
    changed = prefix in text
    text = text.replace(prefix + "/", "").replace(prefix, ".")
    if privacy_findings(text):
        raise ValueError("Refusing to capture remaining private metadata")
    return text, ["repository-root-prefix-rebased"] if changed else []


def public_files():
    paths = []
    for path in PROJECT.rglob("*"):
        if path.is_symlink():
            raise ValueError("Public payload must not contain symlinks")
        if path.is_file() and path.relative_to(ROOT).as_posix() != INTEGRITY_PATH:
            paths.append(path)
    return sorted(paths)


def current_entries():
    entries = []
    for path in public_files():
        relative = path.relative_to(ROOT).as_posix()
        if privacy_findings(path.read_text(encoding="utf-8")):
            raise ValueError("Private metadata in " + relative)
        entries.append({"path": relative, "bytes": path.stat().st_size, "sha256": digest(path)})
    return entries


def verify_integrity(manifest):
    if manifest.get("schema") != "handoff-public-integrity/1":
        raise ValueError("Unknown public integrity schema")
    if manifest.get("excluded_self") != INTEGRITY_PATH:
        raise ValueError("Unexpected integrity exclusions")
    if manifest.get("files") != current_entries():
        raise ValueError("Current public bytes or file inventory differ from the integrity manifest")
    return len(manifest["files"])
