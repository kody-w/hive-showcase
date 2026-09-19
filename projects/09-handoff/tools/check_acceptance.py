"""Strict checks against the sealed desired-behavior contract."""

import hashlib
import json
from pathlib import Path
import sys

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from receipt_ledger import parse_jsonl, read_selected_text, summarize


def evaluate():
    contract = json.loads((PROJECT / "ACCEPTANCE.json").read_text(encoding="utf-8"))
    results = []
    for case in contract["cases"]:
        text = read_selected_text(PROJECT / case["fixture"])
        actual = summarize(parse_jsonl(text))
        results.append(
            {
                "id": case["id"],
                "fixture": case["fixture"],
                "input_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "expected": case["expected"],
                "actual": actual,
                "passed": actual == case["expected"],
            }
        )
    return {
        "schema": "handoff-strict-acceptance/1",
        "seed_issue": contract["seed_issue"],
        "cases": results,
        "passed": sum(case["passed"] for case in results),
        "failed": sum(not case["passed"] for case in results),
    }


if __name__ == "__main__":
    result = evaluate()
    print(json.dumps(result, indent=2, sort_keys=True))
    raise SystemExit(1 if result["failed"] else 0)
