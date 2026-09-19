#!/usr/bin/env python3
"""Check public payload privacy and optional fresh-Git reproducibility offline."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


PROJECT = "projects/10-pocket-arcade"
PRIVATE_KEYS = {"agent_id", "session_id", "continuation_agent_id", "registry_agent_id",
                "prompt", "working_directory", "workspace", "invocation_id"}
PATTERNS = {
    "private-identifier": re.compile(r"\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b", re.I),
    "machine-path": re.compile(r"/(?:Users|home|tmp|private|var/(?:tmp|folders))/|[A-Za-z]:[\\/](?:Users|Temp)[\\/]", re.I),
    "private-execution-location": re.compile(r"\.copilot[/\\]session-state|hive-(?:pages-)?worktrees[/\\]", re.I),
}


def privacy_findings(text):
    strings, found = [text], set()

    def visit(value):
        if isinstance(value, dict):
            if PRIVATE_KEYS.intersection(value):
                found.add("private-operational-field")
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
        elif isinstance(value, str):
            strings.append(value)

    try:
        visit(json.loads(text))
    except ValueError:
        pass
    for value in list(strings):
        strings.append(re.sub(r"\\u([0-9a-fA-F]{4})", lambda match: chr(int(match[1], 16)), value).replace("\\/", "/"))
    for label, pattern in PATTERNS.items():
        if any(pattern.search(value) for value in strings):
            found.add(label)
    return sorted(found)


def portable_output(raw, root):
    text = raw.decode("utf-8")
    prefix = str(Path(root).resolve())
    changed = prefix in text
    text = text.replace(prefix + "/", "").replace(prefix, ".")
    if privacy_findings(text):
        raise ValueError("Refusing to persist remaining private metadata in a public command log.")
    return text.encode("utf-8"), ["repository-root-prefix-rebased"] if changed else []


def audit(root):
    root = Path(root).resolve(strict=True)
    project = root / PROJECT
    manifest = json.loads((project / "manifest.json").read_text())
    declared = set(manifest["artifacts"]) | {PROJECT + "/manifest.json"}
    count = 0
    for name in sorted(declared):
        if not name.startswith(PROJECT + "/") or ".." in name.split("/"):
            raise ValueError("Out-of-scope public artifact declaration.")
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise ValueError("Missing or symlinked public artifact: " + name)
        findings = privacy_findings(path.read_text(encoding="utf-8"))
        if findings:
            raise ValueError("Private metadata in " + name + ": " + ", ".join(findings))
        count += 1
    present = set()
    for path in project.rglob("*"):
        if path.is_symlink():
            raise ValueError("Symlink in the public project inventory.")
        if path.is_file():
            present.add(path.relative_to(root).as_posix())
    if present != declared:
        raise ValueError("Public artifact inventory differs from actual project files.")
    return {
        "schema": "pocket-arcade-public-check/1",
        "status": "passed",
        "publicFilesChecked": count,
        "checks": ["machine/private identifiers absent", "embedded JSON strings inspected",
                   "private operational fields absent", "exact owned artifact inventory"],
        "showcasePublicationAuthorized": True,
        "deploymentPerformedByThisCheck": False,
        "nativeHumanPhysicalMarketApproval": False,
    }


def fresh_git(root):
    root = Path(root).resolve(strict=True)
    workspace = root / PROJECT / "tests" / ".public-export-check"
    if workspace.exists() or workspace.is_symlink():
        raise ValueError("Refusing to reuse an existing public export-check directory.")
    workspace.mkdir()
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", GIT_CONFIG_NOSYSTEM="1",
               GIT_CONFIG_GLOBAL=os.devnull)
    for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
                "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_TEMPLATE_DIR"):
        env.pop(key, None)
    try:
        for identifier in ("01-game-studio", "05-planner", "07-manufacturing", "09-handoff", "10-pocket-arcade"):
            source = root / "projects" / identifier
            target = workspace / "projects" / identifier
            shutil.copytree(source, target, ignore=shutil.ignore_patterns(".public-export-check", "__pycache__"))
        for name in ("index.html", "package.json", "assets/shared.css", "evidence/seed-verification.json"):
            target = workspace / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / name, target)
        subprocess.run(["git", "-c", "init.defaultBranch=public-check", "init", "--quiet", "--template="],
                       cwd=workspace, env=env, check=True, capture_output=True)
        head = subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=workspace,
                              env=env, capture_output=True)
        if head.returncode == 0:
            raise ValueError("Fresh export unexpectedly contains commit history.")
        if any(path.is_file() for path in (workspace / ".git" / "objects").rglob("*")):
            raise ValueError("Fresh export unexpectedly contains Git object data.")
        manifest = json.loads((workspace / PROJECT / "manifest.json").read_text())
        runs = []
        for argv in manifest["checks"]:
            run = subprocess.run(argv, cwd=workspace, env=env, capture_output=True, timeout=180)
            stdout, stdout_changes = portable_output(run.stdout, workspace)
            stderr, stderr_changes = portable_output(run.stderr, workspace)
            runs.append({
                "argv": argv, "exitCode": run.returncode,
                "stdoutSha256": hashlib.sha256(stdout).hexdigest(),
                "stderrSha256": hashlib.sha256(stderr).hexdigest(),
                "pathRebasing": sorted(set(stdout_changes + stderr_changes)),
            })
            if run.returncode:
                raise ValueError("Fresh-Git public check failed: " + json.dumps(argv))
        return {
            "schema": "pocket-arcade-fresh-git-check/1",
            "status": "passed", "exportKind": "project-local disposable copy with empty new Git history",
            "privateGitObjectsRequired": False, "networkUsed": False, "servicesStarted": False,
            "browserUsed": False, "partnerWorkflowsRecaptured": False, "checks": runs,
        }
    finally:
        shutil.rmtree(workspace)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--fresh-git", action="store_true")
    args = parser.parse_args()
    try:
        result = audit(args.root)
        if args.fresh_git:
            result["freshGit"] = fresh_git(args.root)
        print(json.dumps(result, indent=2))
        return 0
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        message, _ = portable_output(str(error).encode("utf-8"), args.root)
        print(message.decode("utf-8"), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
