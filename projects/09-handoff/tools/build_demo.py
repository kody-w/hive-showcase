"""Build or byte-check the deterministic offline replay and maintenance export."""

import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
PROJECT = Path("projects/09-handoff")


def load(relative):
    return json.loads((PROJECT / relative).read_text(encoding="utf-8"))


def outputs():
    before = load("evidence/before.json")
    after = load("evidence/after.json")
    history = load("evidence/historical-continuation.json")
    recovery = load("evidence/recovery.json")
    if len(before["replays"]) != len(after["replays"]):
        raise ValueError("Captured case counts differ.")
    export = subprocess.run(
        [
            sys.executable, "-B", str(PROJECT / "cli.py"),
            str(PROJECT / "fixtures/duplicate.jsonl"),
        ],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    maintenance = json.loads(export.stdout)
    paired = {}
    for original, repaired in zip(before["replays"], after["replays"]):
        if (
            original["id"] != repaired["id"]
            or original["input_sha256"] != repaired["input_sha256"]
            or original["records"] != repaired["records"]
            or original["expected"] != repaired["expected"]
            or repaired["actual"] != repaired["expected"]
        ):
            raise ValueError("Cannot pair captured cases or acceptance targets.")
        paired[original["id"]] = {
            "input_sha256": original["input_sha256"],
            "records": original["records"],
            "expected": original["expected"],
            "before": original["frames"],
            "after": repaired["frames"],
        }
    data = {
        "schema": "handoff-browser-replay/2",
        "mode": "recorded-python-execution-not-browser-python",
        "evidence_kind": "redacted-derived-historical-records",
        "classification": "SYNTHETIC",
        "historical_midpoint_commit": history["midpoint_commit"],
        "historical_fix_commit": history["fix_commit"],
        "historical_continuation": "One separate Astra continuation performed the original repair; private invocation metadata is withheld.",
        "public_reverification_limit": history["public_reverification"]["historical_execution"],
        "cases": paired,
        "maintenance": maintenance,
        "recovered": recovery["context_recovered"],
        "missing": recovery["context_missing"],
    }
    serialized = json.dumps(data, indent=2, sort_keys=True).replace("<", "\\u003c")
    return {
        PROJECT / "replay-data.js": "window.HANDOFF_REPLAY = Object.freeze(" + serialized + ");\n",
        PROJECT / "artifacts/pocket-arcade-maintenance.json": export.stdout,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify existing bytes; no writes")
    args = parser.parse_args()
    if Path.cwd() != ROOT:
        parser.error("run from the repository root")
    expected = outputs()
    mismatches = []
    for path, text in expected.items():
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                mismatches.append(path.as_posix())
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
    print(json.dumps({
        "mode": "read-only-check" if args.check else "build",
        "outputs": [path.as_posix() for path in expected],
        "mismatches": mismatches,
    }, indent=2))
    return 1 if mismatches else 0


if __name__ == "__main__":
    raise SystemExit(main())
