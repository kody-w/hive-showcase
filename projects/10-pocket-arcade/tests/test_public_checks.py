"""Synthetic privacy inputs only; no real private records or locations."""

import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import public_checks


class PublicCheckTests(unittest.TestCase):
    def test_synthetic_identifier_is_rejected(self):
        identifier = "-".join("0" * size for size in (8, 4, 4, 4, 12))
        self.assertIn("private-identifier", public_checks.privacy_findings(identifier))

    def test_json_escaped_machine_path_is_rejected(self):
        location = str(Path("/").joinpath("Users", "example", "private-record"))
        encoded = json.dumps({"text": location}).replace("/", "\\u002f")
        self.assertIn("machine-path", public_checks.privacy_findings(encoded))

    def test_nested_private_operational_fields_are_rejected(self):
        value = json.dumps({"nested": {"session_id": "withheld"}})
        self.assertIn("private-operational-field", public_checks.privacy_findings(value))

    def test_repository_relative_names_and_historical_digests_are_allowed(self):
        value = json.dumps({
            "path": "projects/09-handoff/evidence/historical-continuation.json",
            "historical_commit": "0" * 40,
            "qualification": "Historical metadata; not a required public Git object.",
        })
        self.assertEqual(public_checks.privacy_findings(value), [])

    def test_root_rebasing_is_explicit_and_preserves_failure_text(self):
        root = Path("/").joinpath("Users", "example", "checkout")
        raw = f'File "{root}/projects/10-pocket-arcade/example.py"\nFAIL: expected refusal\n'.encode()
        output, changes = public_checks.portable_output(raw, root)
        self.assertEqual(output, b'File "projects/10-pocket-arcade/example.py"\nFAIL: expected refusal\n')
        self.assertEqual(changes, ["repository-root-prefix-rebased"])

    def test_unknown_private_location_is_not_silently_scrubbed(self):
        unknown = str(Path("/").joinpath("home", "example", "unknown")).encode()
        with self.assertRaises(ValueError):
            public_checks.portable_output(unknown, Path("/").joinpath("selected", "project"))

    def test_identifier_in_output_aborts_capture(self):
        identifier = "-".join("0" * size for size in (8, 4, 4, 4, 12)).encode()
        with self.assertRaises(ValueError):
            public_checks.portable_output(identifier, Path("/").joinpath("selected", "project"))


if __name__ == "__main__":
    unittest.main()
