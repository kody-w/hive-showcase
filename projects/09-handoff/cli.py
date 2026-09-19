"""Read one selected JSONL file and print an offline maintenance artifact."""

import argparse
import hashlib
import json
import sys

from receipt_ledger import LedgerError, maintenance_report, parse_jsonl, read_selected_text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="explicit ordinary file; synthetic JSONL only")
    args = parser.parse_args()
    try:
        text = read_selected_text(args.input)
        report = maintenance_report(parse_jsonl(text))
    except (LedgerError, OSError) as exc:
        print(f"receipt-kit: {exc}", file=sys.stderr)
        return 2
    report["input_sha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
