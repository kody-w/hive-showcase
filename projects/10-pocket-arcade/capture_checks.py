#!/usr/bin/env python3
"""Explicitly rerun reviewed original component checks; write only prime evidence."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import validate
from public_checks import portable_output


HISTORICAL_SNAPSHOT = "502b74346fe913550f732a1a160d76162f392ce4"
SOURCE_COMMITS = {
    "01-game-studio": "493c333ac7085a10359c87ede5e0c74ab459a766",
    "05-planner": "230a27a827be66a6d4bedc6bb5e4d2e78acf72c3",
    "07-manufacturing": "50dc804fc517968e80c7fe5554d31914067c9985",
    "09-handoff": None,
}
REVIEWED_CHECKS = {
    "01-game-studio": [
        ["node", "--test", "--test-reporter=tap", "projects/01-game-studio/tests/engine.test.mjs",
         "projects/01-game-studio/tests/controller.test.mjs", "projects/01-game-studio/tests/app.test.mjs",
         "projects/01-game-studio/tests/evidence.test.mjs"],
        ["node", "projects/01-game-studio/tools/bundle-replays.mjs", "--check"],
    ],
    "05-planner": [
        ["node", "--test", "--test-reporter=tap", "projects/05-planner/tests/engine.test.mjs",
         "projects/05-planner/tests/oracle.test.mjs", "projects/05-planner/tests/editor.test.mjs",
         "projects/05-planner/tests/artifacts.test.mjs", "projects/05-planner/tests/ui.test.mjs"],
        ["node", "--check", "projects/05-planner/app.mjs"],
        ["node", "--check", "projects/05-planner/app.bundle.js"],
        ["node", "projects/05-planner/tools/build.mjs", "--check"],
    ],
    "07-manufacturing": [
        ["node", "--test", "--test-reporter=tap", "projects/07-manufacturing/tests/engine.test.mjs",
         "projects/07-manufacturing/tests/app.test.mjs"],
        ["python3", "projects/07-manufacturing/tests/verify_artifacts.py", "--check"],
        ["node", "projects/07-manufacturing/tools/generate.mjs", "--check"],
    ],
    "09-handoff": [
        ["python3", "-B", "projects/09-handoff/tools/verify_inputs.py"],
        ["python3", "-B", "projects/09-handoff/tools/check_acceptance.py"],
        ["python3", "-B", "-m", "unittest", "discover", "-s", "projects/09-handoff/tests",
         "-p", "test_ledger.py", "-v"],
        ["python3", "-B", "projects/09-handoff/tools/build_demo.py", "--check"],
        ["node", "--test", "projects/09-handoff/tests/replay.test.cjs"],
        ["python3", "-B", "-m", "unittest", "discover", "-s", "projects/09-handoff/tests",
         "-p", "test_public_projection.py", "-v"],
        ["python3", "-B", "projects/09-handoff/tools/verify_evidence.py"],
    ],
}


def write_owned(root, name, data):
    validate.repo_path(name)
    validate.require(name.startswith(validate.PROJECT + "/"), "foreign-output", "Only prime files may be written.")
    target = root
    for part in name.split("/")[:-1]:
        target = target / part
        validate.require(not target.is_symlink(), "unsafe-output", "Output parent is a symlink.", name)
        target.mkdir(exist_ok=True)
        validate.require(target.is_dir(), "unsafe-output", "Output parent is not a directory.", name)
    target = root / name
    validate.require(not target.is_symlink(), "unsafe-output", "Output file is a symlink.", name)
    target.write_bytes(data)
    return {"path": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def capture(root, project):
    reader = validate.Reader(root)
    specs = validate.validate_contract(reader.json(validate.CONTRACT))
    spec = specs[project]
    manifest = validate.validate_manifest(reader, spec, False)
    validate.require(manifest["checks"] == REVIEWED_CHECKS[project], "unreviewed-command",
                     "Manifest commands changed; review them explicitly before extending the allowlist.")
    names = sorted(set(manifest["artifacts"]) | {spec["entrypoint"], spec["evidence"]})
    for name in names:
        reader.read(name)
    source_files = [dict(reader.inputs[name]) for name in names]
    manifest_lock = dict(reader.inputs[spec["manifest"]])
    runs = []
    rebasing = []
    environment = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    for index, argv in enumerate(REVIEWED_CHECKS[project]):
        recorded_at = datetime.now(timezone.utc).isoformat()
        try:
            run = subprocess.run(argv, cwd=reader.root, env=environment, capture_output=True, timeout=120)
            code, stdout, stderr = run.returncode, run.stdout, run.stderr
        except subprocess.TimeoutExpired as error:
            code, stdout, stderr = 124, error.stdout or b"", (error.stderr or b"") + b"\nTimed out after 120 seconds.\n"
        stdout, stdout_changes = portable_output(stdout, reader.root)
        stderr, stderr_changes = portable_output(stderr, reader.root)
        rebasing.append({"checkIndex": index, "stdout": stdout_changes, "stderr": stderr_changes})
        transcript = (
            ("argv: " + json.dumps(argv) + "\nrecordedAt: " + recorded_at
             + "\nexitCode: " + str(code) + "\n--- stdout ---\n").encode("utf-8")
            + stdout + b"\n--- stderr ---\n" + stderr + b"\n--- end of captured streams ---\n"
        )
        output = write_owned(reader.root, validate.PROJECT + "/evidence/checks/" + project + "-" + str(index) + ".txt", transcript)
        runs.append({"argv": argv, "exitCode": code, "output": output, "recordedAt": recorded_at})
        print(project + " check " + str(index + 1) + ": exit " + str(code))
    for lock in source_files + [manifest_lock]:
        reader.read(lock["path"], lock["sha256"], lock["bytes"])
    receipt = {
        "schema": "pocket-arcade-component-checks/2",
        "recordKind": "new-public-projection-checks",
        "projectId": project,
        "fixtureOnly": False,
        "sourceBasis": "Current public file hashes; no private Git objects or invocation identity required.",
        "historicalSourceCommit": SOURCE_COMMITS[project],
        "executionRoot": ".",
        "pathRebasing": rebasing,
        "execution": "New explicit public-file checks, not a new historical continuation or a reverified private invocation.",
        "manifest": manifest_lock,
        "componentFiles": source_files,
        "declaredFilesUnchanged": True,
        "allPassed": all(run["exitCode"] == 0 for run in runs),
        "checkRuns": runs,
        "nativeOrOwnerApproval": False,
    }
    reader.write_report(validate.PROJECT + "/evidence/checks/" + project + "-runs.json", receipt)
    return receipt["allPassed"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--project", choices=list(REVIEWED_CHECKS), required=True)
    args = parser.parse_args()
    try:
        return 0 if capture(args.root, args.project) else 1
    except (validate.InputError, ValueError, OSError) as error:
        message, _ = portable_output(str(error).encode("utf-8"), args.root)
        print(message.decode("utf-8"), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
