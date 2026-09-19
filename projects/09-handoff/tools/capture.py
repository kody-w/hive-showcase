"""Capture new publication checks, never a replacement historical execution."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import platform
import re
import subprocess

from public_projection import (
    PROJECT, RELATIVE_PROJECT, ROOT, digest, portable_text, public_files,
)


def capture(output):
    if Path.cwd() != ROOT:
        raise ValueError("Run capture.py from the repository root.")
    if output != "-" and not re.fullmatch(
        r"evidence/(?:package-checks|publication-[a-z0-9-]+)\.json", output
    ):
        raise ValueError("Select a new publication record under evidence/, or stdout with '-'.")
    destination = RELATIVE_PROJECT / output
    if output != "-" and destination.exists():
        raise ValueError("Refusing to overwrite an existing record.")
    manifest = json.loads((PROJECT / "manifest.json").read_text())
    runs = []
    for argv in manifest["checks"][:-1]:
        execution = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True)
        run = {"argv": argv, "exit_code": execution.returncode}
        changes = {}
        for channel in ("stdout", "stderr"):
            run[channel], changes[channel] = portable_text(getattr(execution, channel))
        run["path_redactions"] = changes
        runs.append(run)
    tested = [
        path for path in public_files()
        if path.suffix in (".py", ".js", ".cjs", ".html", ".css", ".jsonl")
        or path.name in ("ACCEPTANCE.json", "manifest.json", "provenance.json")
    ]
    record = {
        "schema": "handoff-publication-checks/1",
        "record_kind": "new-public-projection-checks",
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "execution_root": ".",
        "runtime": {"python": platform.python_version()},
        "path_policy": "Repository-root prefixes are rebased in process output; any remaining private metadata aborts capture. Per-channel redactions are disclosed.",
        "qualification": "New checks of this public projection, not another AI continuation or a re-execution of historical sessions. The final manifest audit runs after this record and result.json exist.",
        "runs": runs,
        "tested_files": [
            {"path": path.relative_to(ROOT).as_posix(), "sha256": digest(path)}
            for path in tested
        ],
    }
    text = json.dumps(record, indent=2, sort_keys=True) + "\n"
    if output == "-":
        print(text, end="")
    else:
        destination.write_text(text, encoding="utf-8")
        print(json.dumps({"record": destination.as_posix(), "exit_codes": [run["exit_code"] for run in runs]}))
    return 1 if any(run["exit_code"] for run in runs) else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="evidence/package-checks.json")
    try:
        raise SystemExit(capture(parser.parse_args().output))
    except ValueError as exc:
        parser.error(str(exc))
