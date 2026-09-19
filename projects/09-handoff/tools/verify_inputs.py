"""Check preserved original public inputs, not redacted private transcripts."""

import json
from public_projection import PROJECT, digest


def check_inputs():
    index = json.loads((PROJECT / "evidence/input-hashes.json").read_text())
    if index["schema"] != "handoff-public-historical-inputs/1":
        raise ValueError("Unknown historical-input index")
    expected = {
        "HANDOFF.md", "ACCEPTANCE.json", "provenance.json",
        "fixtures/clean.jsonl", "fixtures/duplicate.jsonl", "fixtures/out-of-order.jsonl",
    }
    if {entry["path"] for entry in index["preserved_public_files"]} != expected:
        raise ValueError("The preserved historical input set changed")
    failures = []
    for entry in index["preserved_public_files"] + index["unchanged_repaired_files"]:
        path = PROJECT / entry["path"]
        if not path.is_file() or digest(path) != entry["sha256"]:
            failures.append(entry["path"])
    return {
        "preserved_historical_inputs": len(expected),
        "unchanged_original_source_and_tests": len(index["unchanged_repaired_files"]),
        "changed_or_missing": failures,
        "qualification": "Redacted execution records are not claimed to match private original bytes.",
    }


if __name__ == "__main__":
    result = check_inputs()
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result["changed_or_missing"] else 0)
