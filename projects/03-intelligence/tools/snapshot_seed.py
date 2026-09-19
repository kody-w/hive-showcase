#!/usr/bin/env python3
"""Snapshot only reviewed inert data, checking the parent's exact byte inventory."""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parents[1]
STARTER = "templates/casework/work/starter/"
FILES = [
    "LICENSE", "seed.json", "initialize.json",
    "templates/casework/work/intake.json",
    "templates/casework/work/task-board.json",
    "templates/casework/work/ACCEPTANCE.md",
    STARTER + "case/question.json",
    *[STARTER + "sources/" + name + ".csv" for name in (
        "announcements", "release-notes", "lab-notes", "support-notices", "benchmark-runs"
    )],
    STARTER + "analysis/claims.csv",
    STARTER + "analysis/contradictions.csv",
    STARTER + "analysis/hypotheses.json",
    STARTER + "ops/investigation-board.csv",
    *["templates/teams/" + name + "/work/TEAM.md" for name in (
        "collection", "analysis", "competing-hypotheses", "verification", "briefing"
    )],
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("seed_directory", type=Path)
    args = parser.parse_args()
    parent_bytes = (ROOT / "evidence/seed-verification.json").read_bytes()
    parent = json.loads(parent_bytes)
    reviewed = next(seed for seed in parent["seeds"] if seed["slug"] == "public-source-intelligence-bureau")
    expected = {item["path"]: item for item in reviewed["verifiedFiles"]}
    items, source_records = [], []
    for relative in FILES:
        data = (args.seed_directory / relative).read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        if sha != expected[relative]["sha256"] or len(data) != expected[relative]["bytes"]:
            raise ValueError("Seed hash mismatch: " + relative)
        destination = PROJECT / "inputs/seed" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        items.append({"path": "inputs/seed/" + relative, "originalPath": relative, "bytes": len(data), "sha256": sha})
        if "/sources/" in relative:
            for row_number, record in enumerate(csv.DictReader(io.StringIO(data.decode())), 2):
                assert record["classification"] == "SYNTHETIC"
                source_records.append({"id": record["record_id"], "path": "inputs/seed/" + relative, "row": row_number})
    output = {
        "schema": "inert-seed-input-provenance/1",
        "classification": "public-synthetic",
        "seedSlug": reviewed["slug"],
        "seedRef": reviewed["seedRef"],
        "archiveRef": reviewed["archiveRef"],
        "parentVerificationSha256": hashlib.sha256(parent_bytes).hexdigest(),
        "parentVerifiedAt": parent["verifiedAt"],
        "nativeInitialized": False,
        "downloadedCodeExecuted": False,
        "scope": "Only reviewed data and its MIT license are copied. The original fictional Juniper Queue investigation is a provenance baseline, not evidence for the new solo-founder question.",
        "files": items,
        "syntheticSourceRecords": source_records,
        "syntheticCounts": {"sourceFiles": 5, "records": len(source_records), "codedClaims": 9, "conflicts": 3},
        "newResearchSources": "research/evidence.json#/sources",
    }
    (PROJECT / "evidence/seed-inputs.json").write_text(json.dumps(output, indent=2) + "\n")
    print(f"Verified and snapshotted {len(items)} inert data files; {len(source_records)} synthetic source records. No seed code executed.")


if __name__ == "__main__":
    main()
