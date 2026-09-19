import dataclasses
import itertools
import json
from pathlib import Path
import subprocess
import sys
import unittest

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from receipt_ledger import (
    BYTE_LIMIT, LINE_LIMIT, RECORD_LIMIT, LedgerError, Receipt,
    maintenance_report, parse_jsonl, read_selected_text, summarize,
)

CONTRACT = json.loads((PROJECT / "ACCEPTANCE.json").read_text(encoding="utf-8"))
EXPECTED = CONTRACT["cases"][0]["expected"]


def fixture(name):
    return parse_jsonl((PROJECT / f"fixtures/{name}.jsonl").read_text(encoding="utf-8"))


def encoded(**changes):
    record = Receipt("receipt-one", "arcade-one", "open", 0).record()
    record.update(changes)
    return json.dumps(record)


class LedgerTests(unittest.TestCase):
    def test_clean_contract(self):
        self.assertEqual(summarize(fixture("clean")), EXPECTED)

    def test_identical_replay_is_not_additional_work(self):
        self.assertEqual(summarize(fixture("duplicate")), EXPECTED)

    def test_replays_of_each_event_are_idempotent_in_every_order(self):
        receipts = fixture("clean")
        for replay in receipts:
            for order in itertools.permutations(receipts + (replay, replay)):
                with self.subTest(
                    replay=replay.event_id,
                    order=tuple(receipt.event_id for receipt in order),
                ):
                    self.assertEqual(summarize(order), EXPECTED)

    def test_distinct_ids_with_identical_payloads_count_separately(self):
        original = Receipt("receipt-one", "arcade-one", "open", 4)
        second = dataclasses.replace(original, event_id="receipt-two")
        summary = summarize((original, second, original, second))
        self.assertEqual(summary["event_count"], 2)
        self.assertEqual(summary["items"], [
            {"item_id": "arcade-one", "state": "open", "event_count": 2, "last_minute": 4}
        ])

    def test_order_is_already_deterministic(self):
        self.assertEqual(summarize(fixture("out-of-order")), EXPECTED)
        for permutation in itertools.permutations(fixture("clean")):
            self.assertEqual(summarize(permutation), EXPECTED)

    def test_equal_minute_uses_event_id(self):
        opening = Receipt("receipt-a", "arcade-one", "open", 12)
        closing = Receipt("receipt-z", "arcade-one", "close", 12)
        for order in ((closing, opening), (opening, closing)):
            row = summarize(order)["items"][0]
            self.assertEqual(row["state"], "closed")
            self.assertEqual(row["last_minute"], 12)

    def test_conflicting_ids_rejected_for_every_payload_field(self):
        original = Receipt("receipt-one", "arcade-one", "open", 4)
        for changes in (
            {"item_id": "arcade-two"}, {"action": "close"}, {"at_minute": 5}
        ):
            with self.subTest(changes=changes), self.assertRaisesRegex(
                LedgerError, "conflicting"
            ):
                summarize((original, dataclasses.replace(original, **changes)))

    def test_conflict_late_in_input_is_not_hidden(self):
        text = encoded() + "\n" + encoded() + "\n" + encoded(at_minute=1)
        with self.assertRaisesRegex(LedgerError, "conflicting"):
            parse_jsonl(text)

    def test_input_and_returned_results_are_not_shared(self):
        receipts = list(fixture("clean"))
        before = list(receipts)
        result = summarize(receipts)
        result["items"][0]["event_count"] = -1
        self.assertEqual(receipts, before)
        self.assertEqual(summarize(receipts), EXPECTED)
        with self.assertRaises(dataclasses.FrozenInstanceError):
            receipts[0].at_minute = 999

    def test_empty_blank_and_close_only_inputs(self):
        empty = {"event_count": 0, "open_items": 0, "closed_items": 0, "items": []}
        self.assertEqual(summarize(parse_jsonl(" \n\r\n")), empty)
        self.assertEqual(
            summarize((Receipt("receipt-close", "arcade-one", "close", 0),))[
                "closed_items"
            ],
            1,
        )

    def test_strict_json_shape_and_duplicate_keys(self):
        invalid = (
            "{", "null", "[]", "{}",
            encoded().replace('"classification":', '"event_id":"shadow","classification":'),
            encoded(extra="unexpected"),
            encoded(classification="REAL"),
            encoded(action="delete"),
            encoded(at_minute=float("nan")),
            encoded(at_minute=float("inf")),
        )
        for text in invalid:
            with self.subTest(text=text), self.assertRaises(LedgerError):
                parse_jsonl(text)

    def test_validation_does_not_skip_repeated_record_payloads(self):
        for bad in (encoded(at_minute=True), encoded(classification="REAL")):
            with self.subTest(bad=bad), self.assertRaises(LedgerError):
                parse_jsonl(encoded() + "\n" + bad)

    def test_identifier_and_minute_bounds(self):
        for field in ("event_id", "item_id"):
            for value in ("", "UPPER", "has space", "../path", "-edge", "a--b", "a" * 41, 7):
                with self.subTest(field=field, value=value), self.assertRaises(LedgerError):
                    parse_jsonl(encoded(**{field: value}))
        for value in (-1, 1_000_001, True, False, 1.0, "1", None):
            with self.subTest(value=value), self.assertRaises(LedgerError):
                parse_jsonl(encoded(at_minute=value))
        for value in (0, 1_000_000):
            self.assertEqual(parse_jsonl(encoded(at_minute=value))[0].at_minute, value)

    def test_byte_line_and_record_limits(self):
        for text in (" " * (BYTE_LIMIT + 1), " " * (LINE_LIMIT + 1)):
            with self.assertRaises(LedgerError):
                parse_jsonl(text)
        line = encoded()
        self.assertEqual(len(parse_jsonl((line + "\n") * RECORD_LIMIT)), RECORD_LIMIT)
        with self.assertRaises(LedgerError):
            parse_jsonl((line + "\n") * (RECORD_LIMIT + 1))
        with self.assertRaises(LedgerError):
            parse_jsonl("é" * (LINE_LIMIT // 2 + 1))
        with self.assertRaises(LedgerError):
            parse_jsonl("\ud800")

    def test_direct_summary_requires_bounded_receipts(self):
        for invalid in ({}, iter(()), ({"unvalidated": True},)):
            with self.subTest(invalid=invalid), self.assertRaises(LedgerError):
                summarize(invalid)
        with self.assertRaises(LedgerError):
            summarize([Receipt("receipt-one", "arcade-one", "open", 0)] * (RECORD_LIMIT + 1))

    def test_selected_file_reader(self):
        self.assertEqual(parse_jsonl(read_selected_text(PROJECT / "fixtures/clean.jsonl")), fixture("clean"))
        with self.assertRaises(LedgerError):
            read_selected_text(PROJECT / "fixtures")

    def test_maintenance_artifact_has_no_release_authority(self):
        report = maintenance_report(fixture("clean"))
        self.assertEqual(report["schema"], "pocket-arcade-maintenance/1")
        self.assertIs(report["release_authority"], False)
        self.assertEqual(report["open_queue"], ["arcade-input"])
        self.assertEqual(report["summary"], EXPECTED)
        self.assertEqual(report["replayed_records"], 0)

    def test_maintenance_artifact_counts_raw_and_replayed_records(self):
        for receipts, input_count, replay_count in (
            (fixture("duplicate"), 4, 1),
            (fixture("clean") * 3, 9, 6),
        ):
            with self.subTest(input_records=input_count):
                self.assertEqual(len(receipts), input_count)
                report = maintenance_report(receipts)
                self.assertEqual(report["input_records"], input_count)
                self.assertEqual(report["replayed_records"], replay_count)
                self.assertEqual(report["summary"], EXPECTED)
                self.assertEqual(report["open_queue"], ["arcade-input"])
                self.assertIs(report["release_authority"], False)

    def test_cli_is_offline_and_reports_errors(self):
        command = [sys.executable, "-B", str(PROJECT / "cli.py")]
        good = subprocess.run(
            command + [str(PROJECT / "fixtures/clean.jsonl")],
            cwd=PROJECT.parents[1], capture_output=True, text=True,
        )
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertEqual(json.loads(good.stdout)["summary"], EXPECTED)
        bad = subprocess.run(
            command + [str(PROJECT / "fixtures")],
            cwd=PROJECT.parents[1], capture_output=True, text=True,
        )
        self.assertEqual(bad.returncode, 2)
        self.assertIn("ordinary", bad.stderr)


if __name__ == "__main__":
    unittest.main()
