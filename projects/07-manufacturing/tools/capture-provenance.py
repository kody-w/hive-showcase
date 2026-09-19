"""Copy an explicit allowlist of verified inert data, never starter code."""

import argparse
import hashlib
import json
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parents[1]
STARTER = "templates/casework/work/starter/"
COPIED = {
    "LICENSE": "LICENSE",
    STARTER + "case/brief.json": "brief.json",
    STARTER + "design/parameters.json": "parameters.json",
    STARTER + "data/bom.csv": "bom.csv",
    STARTER + "data/cost-assumptions.csv": "cost-assumptions.csv",
    STARTER + "ops/pack-spec.json": "pack-spec.json",
    STARTER + "ops/change-request.json": "change-request.json",
    STARTER + "quality/dimensions.csv": "dimensions.csv",
    STARTER + "quality/inspection-samples.csv": "inspection-samples.csv",
}
ROLES = [
    "industrial-design", "engineering", "sourcing", "production-planning",
    "quality", "logistics", "finance",
]
REVIEWED = [
    "seed.json", "initialize.json", "README.md",
    "templates/casework/work/task-board.json", "templates/casework/work/intake.json",
    "templates/casework/work/ACCEPTANCE.md", STARTER + "ops/assembly.md",
] + [
    "templates/teams/{}/work/{}".format(role, filename)
    for role in ROLES for filename in ("TEAM.md", "tasks.json")
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed-dir", required=True, type=Path)
    args = parser.parse_args()
    evidence = ROOT / "evidence/seed-verification.json"
    parent = json.loads(evidence.read_text())
    seed = next(row for row in parent["seeds"] if row["slug"] == "micro-manufacturing-company")
    verified = {row["path"]: row for row in seed["verifiedFiles"]}
    records = []
    content_to_copy = []
    for source in list(COPIED) + REVIEWED:
        data = (args.seed_dir / source).read_bytes()
        expected = verified[source]
        if digest(data) != expected["sha256"] or len(data) != expected["bytes"]:
            raise ValueError("Seed byte verification failed: " + source)
        record = {"seedPath": source, "sha256": digest(data), "bytes": len(data)}
        if source in COPIED:
            relative = "data/seed/" + COPIED[source]
            record["localPath"] = "projects/07-manufacturing/" + relative
            record["use"] = "copied inert synthetic data / license; attributed under MIT"
            content_to_copy.append((PROJECT / relative, data))
        else:
            record["use"] = "read-only requirement / role-scope review; not executed or embedded"
        records.append(record)
    for destination, data in content_to_copy:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    provenance = {
        "schema": "stackline-source-provenance/1",
        "seedSlug": seed["slug"],
        "seedRef": seed["seedRef"],
        "archiveRef": seed["archiveRef"],
        "parentEvidence": "evidence/seed-verification.json",
        "parentEvidenceSHA256": digest(evidence.read_bytes()),
        "sourceHome": "https://kody-w.github.io/hive-hub/",
        "license": "MIT",
        "copyright": "Copyright (c) 2026 Hive Hub contributors",
        "records": records,
        "notExecutedImportedOrEmbedded": [
            STARTER + "tools/plan.py", STARTER + "tests/test_plan.py",
            STARTER + "design/desk-caddy.scad", STARTER + "design/desk-caddy.svg",
        ],
        "originalWork": [
            "Original shared-lattice solid-boundary generator, topology checks and STL serializer.",
            "Original dimensioned drawings, isometric preview, configurator and ZIP writer.",
            "Original compact and Pocket Arcade parameter extensions and handling model.",
            "Original independent Python mesh/ZIP/drawing/BOM checks and Node tests.",
        ],
        "authority": "User-approved original local demo only; no native initialization or external effects.",
    }
    (PROJECT / "data/source-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print("Verified and copied {} inert data/license files; recorded {} reviewed-only files.".format(len(COPIED), len(REVIEWED)))


if __name__ == "__main__":
    main()
