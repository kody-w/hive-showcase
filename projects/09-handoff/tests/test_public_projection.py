import contextlib
import copy
import io
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from unittest import mock

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "tools"))

import capture
import public_projection as public
from verify_evidence import load, midpoint_module, verify_capture


class PublicProjectionTests(unittest.TestCase):
    def test_all_payload_files_have_no_private_metadata(self):
        for path in public.public_files():
            with self.subTest(path=path.relative_to(PROJECT)):
                self.assertEqual(public.privacy_findings(path.read_text()), [])

    def test_identifier_detection_in_embedded_json(self):
        identifier = "-".join("0" * size for size in (8, 4, 4, 4, 12))
        self.assertIn("private-identifier", public.privacy_findings(json.dumps({"trace": identifier})))

    def test_absolute_paths_detected_after_json_decoding(self):
        path = str(Path("/").joinpath("Users", "example", "checkout", "sample.py"))
        encoded = json.dumps({"trace": path}).replace("/", "\\u002f")
        self.assertIn("machine-path", public.privacy_findings(encoded))

    def test_operational_fields_are_not_public_summary_fields(self):
        self.assertIn("private-operational-field", public.privacy_findings(
            json.dumps({"nested": {"agent_id": "withheld"}})
        ))

    def test_traceback_rebasing_discloses_the_transformation(self):
        root = Path("/").joinpath("Users", "example", "checkout")
        text, changes = public.portable_text(
            f'File "{root}/projects/09-handoff/tests/test_ledger.py", line 36\nFAIL\n', root
        )
        self.assertEqual(text, 'File "projects/09-handoff/tests/test_ledger.py", line 36\nFAIL\n')
        self.assertEqual(changes, ["repository-root-prefix-rebased"])

    def test_unknown_private_path_aborts_capture(self):
        private = str(Path("/").joinpath("home", "example", "unrelated.py"))
        with self.assertRaises(ValueError):
            public.portable_text(private, Path("/").joinpath("selected", "checkout"))

    def test_original_midpoint_still_fails_the_unchanged_duplicate_target(self):
        baseline = midpoint_module()
        case = next(item for item in load("ACCEPTANCE.json")["cases"] if item["id"] == "duplicate")
        actual = baseline.summarize(baseline.parse_jsonl((PROJECT / case["fixture"]).read_text()))
        self.assertEqual(actual["event_count"], 4)
        self.assertEqual(actual["items"][0]["event_count"], 3)
        self.assertEqual(case["expected"]["event_count"], 3)
        self.assertNotEqual(actual, case["expected"])
        verify_capture(load("evidence/before.json"), baseline)

    def test_numerical_observation_tampering_is_rejected(self):
        changed = copy.deepcopy(load("evidence/before.json"))
        changed["replays"][1]["actual"]["event_count"] = 3
        with self.assertRaises(ValueError):
            verify_capture(changed, midpoint_module())

    def test_acceptance_target_tampering_is_rejected(self):
        changed = copy.deepcopy(load("evidence/before.json"))
        changed["replays"][1]["expected"]["event_count"] = 4
        with self.assertRaises(ValueError):
            verify_capture(changed, midpoint_module())

    def test_a_success_flag_cannot_hide_the_original_failure(self):
        changed = copy.deepcopy(load("evidence/before.json"))
        changed["runs"][0]["exit_code"] = 0
        with self.assertRaises(ValueError):
            verify_capture(changed, midpoint_module())

    def test_integrity_detects_changed_bytes_and_added_files(self):
        entries = [{"path": "projects/09-handoff/example", "bytes": 1, "sha256": "1" * 64}]
        manifest = {
            "schema": "handoff-public-integrity/1",
            "excluded_self": public.INTEGRITY_PATH,
            "files": entries,
        }
        with mock.patch.object(public, "current_entries", return_value=entries):
            self.assertEqual(public.verify_integrity(manifest), 1)
        for observed in ([dict(entries[0], sha256="2" * 64)], entries + [dict(entries[0], path="extra")]):
            with mock.patch.object(public, "current_entries", return_value=observed):
                with self.assertRaises(ValueError):
                    public.verify_integrity(manifest)

    def test_paths_cannot_escape_the_project(self):
        for value in ("../outside", "/outside", "projects/10-arcade/index.html"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                public.scoped_path(value)

    def test_new_capture_retains_failed_command_codes_and_portable_roots(self):
        stream = io.StringIO()
        failed = SimpleNamespace(returncode=7, stdout="Observed failure\n", stderr="")
        with mock.patch.object(capture.subprocess, "run", return_value=failed):
            with contextlib.redirect_stdout(stream):
                status = capture.capture("-")
        result = json.loads(stream.getvalue())
        self.assertEqual(status, 1)
        self.assertTrue(all(run["exit_code"] == 7 for run in result["runs"]))
        self.assertEqual(result["record_kind"], "new-public-projection-checks")
        self.assertEqual(result["execution_root"], ".")
        self.assertEqual(public.privacy_findings(stream.getvalue()), [])

    def test_capture_cannot_overwrite_or_impersonate_historical_phases(self):
        for name in ("before", "continuation", "after", "evidence/before.json"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                capture.capture(name)


if __name__ == "__main__":
    unittest.main()
