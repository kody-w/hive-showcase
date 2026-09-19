"""Build or check the current public-byte manifest, without private Git state."""

import argparse
import json
from pathlib import Path

from public_projection import (
    INTEGRITY_PATH, ROOT, current_entries, verify_integrity,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if Path.cwd() != ROOT:
        parser.error("run from the repository root")
    path = Path(INTEGRITY_PATH)
    if args.check:
        count = verify_integrity(json.loads(path.read_text()))
    else:
        entries = current_entries()
        record = {
            "schema": "handoff-public-integrity/1",
            "record_kind": "current-public-byte-manifest",
            "excluded_self": INTEGRITY_PATH,
            "files": entries,
            "qualification": "Binds current public bytes, not original private execution records. Historical hashes are separately labeled. This is not a signature or proof of executor identity.",
        }
        path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
        count = len(entries)
    print(json.dumps({"public_files": count, "mode": "check" if args.check else "seal"}))


if __name__ == "__main__":
    main()
