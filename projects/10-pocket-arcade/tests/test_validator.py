"""Synthetic validator fixtures only: none of these bytes are partner deliverables."""

import copy
import hashlib
import json
import shutil
import subprocess
import sys
import unittest
import uuid
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_DIR))
import validate


class FixtureRepository:
    def __init__(self):
        self.root = PROJECT_DIR / "tests" / "fixture-workspaces" / ("fixture-" + uuid.uuid4().hex)
        self.root.mkdir(parents=True)
        self.contract = json.loads((PROJECT_DIR / "contract.json").read_text())
        self.record = self.empty_record()
        self.write_json(validate.FIXTURE_MARKER, {
            "schema": "pocket-arcade-test-fixture/1",
            "fixtureOnly": True,
            "warning": "SYNTHETIC UNIT-TEST DATA. No real work, execution, receipts or acceptance.",
        })
        self.write_json(validate.CONTRACT, self.contract)
        for spec, entry in zip(self.contract["contributors"], self.record["contributions"]):
            directory = spec["directory"]
            self.write(spec["entrypoint"], "<!doctype html><title>SYNTHETIC TEST FIXTURE ONLY</title>\n")
            roles = {}
            for role, definition in spec["roles"].items():
                path = directory + "/artifacts/fixture-" + role + definition["extensions"][0]
                if path.endswith(".json"):
                    self.write_json(path, {"fixtureOnly": True, "notADeliverable": True, "role": role})
                else:
                    self.write(path, "SYNTHETIC FIXTURE BYTES ONLY. Never execute as a contribution.\n")
                roles[role] = path
            command_file = directory + "/fixture-check.py"
            self.write(command_file, "# SYNTHETIC TEST FIXTURE. This command has NOT been executed.\n")
            self.write_json(spec["evidence"], {
                "schema": "pocket-arcade-test-evidence/1",
                "fixtureOnly": True,
                "warning": "Synthetic acceptance values for exercising the validator, not real delivery evidence.",
                "results": {gate["id"]: True for gate in spec["gates"]},
            })
            command = ["python3", command_file]
            manifest = {
                "id": spec["id"], "title": "SYNTHETIC TEST FIXTURE ONLY",
                "seedSlug": spec["seedSlug"], "entrypoint": spec["entrypoint"],
                "summary": "Synthetic file bytes for unit tests. Not actual partner work.",
                "checks": [command], "stage": "work-produced", "fixtureOnly": True,
                "artifacts": [spec["entrypoint"], spec["evidence"], command_file, *roles.values()],
                "limitations": ["TEST FIXTURE ONLY. No actual command run or contribution acceptance."],
            }
            self.write_json(spec["manifest"], manifest)
            output = validate.PROJECT + "/evidence/checks/" + spec["id"] + "-0.txt"
            self.write(output, "TEST FIXTURE ONLY: synthetic exit zero; no command was executed.\n")
            entry.update({
                "state": "received", "sourceCommit": None, "roles": roles,
                "files": [self.lock(name) for name in manifest["artifacts"]],
                "manifestSha256": self.lock(spec["manifest"])["sha256"],
                "gates": [{
                    "id": gate["id"], "state": "pass",
                    "proof": {
                        "path": spec["evidence"],
                        "sha256": self.lock(spec["evidence"])["sha256"],
                        "pointer": "/results/" + gate["id"],
                        "equals": True,
                    },
                } for gate in spec["gates"]],
                "checkRuns": [{"argv": command, "exitCode": 0, "output": self.lock(output)}],
            })
        self.save()

    def empty_record(self):
        return {
            "schema": "pocket-arcade-contributions/1",
            "fixtureOnly": True,
            "scope": "local-original-artifact-integration",
            "boundaries": copy.deepcopy(self.contract["boundaries"]),
            "contributions": [{
                "id": spec["id"], "interfaceId": spec["interfaceId"], "state": "awaiting",
                "sourceCommit": None, "manifestSha256": None, "files": [], "roles": {},
                "gates": [{"id": gate["id"], "state": "awaiting", "proof": None} for gate in spec["gates"]],
                "checkRuns": [],
            } for spec in self.contract["contributors"]],
        }

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def write_json(self, name, value):
        self.write(name, json.dumps(value, indent=2) + "\n")

    def lock(self, name):
        data = (self.root / name).read_bytes()
        return {"path": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}

    def save(self):
        self.write_json(validate.RECORD, self.record)

    def sync(self, index=0):
        spec = self.contract["contributors"][index]
        entry = self.record["contributions"][index]
        manifest = json.loads((self.root / spec["manifest"]).read_text())
        entry["manifestSha256"] = self.lock(spec["manifest"])["sha256"]
        entry["files"] = [self.lock(name) for name in sorted(
            set(manifest["artifacts"]) | {spec["entrypoint"], spec["evidence"]}
        )]
        for gate in entry["gates"]:
            if gate.get("proof") is not None:
                gate["proof"]["sha256"] = self.lock(gate["proof"]["path"])["sha256"]
        self.save()

    def run(self, fixture_mode=True):
        self.save()
        return validate.validate_repository(self.root, fixture_mode=fixture_mode)


class ValidatorTests(unittest.TestCase):
    def setUp(self):
        self.fixture = FixtureRepository()
        self.entry = self.fixture.record["contributions"][0]
        self.spec = self.fixture.contract["contributors"][0]

    def tearDown(self):
        shutil.rmtree(self.fixture.root)
        try:
            self.fixture.root.parent.rmdir()
        except OSError:
            pass

    def codes(self, report):
        return {error["code"] for error in report["errors"]} | {
            error["code"] for contribution in report["contributions"] for error in contribution["errors"]
        }

    def assert_rejected(self, code, report=None):
        report = report or self.fixture.run()
        self.assertFalse(report["validationPassed"])
        self.assertFalse(report["integrationPassed"])
        self.assertIn(code, self.codes(report))
        return report

    def mutate_manifest(self, mutation):
        manifest = json.loads((self.fixture.root / self.spec["manifest"]).read_text())
        mutation(manifest)
        self.fixture.write_json(self.spec["manifest"], manifest)
        self.entry["manifestSha256"] = self.fixture.lock(self.spec["manifest"])["sha256"]

    def test_valid_fixtures_only_report_fixture_acceptance(self):
        report = self.fixture.run()
        self.assertTrue(report["validationPassed"])
        self.assertFalse(report["integrationPassed"])
        self.assertEqual(report["integrationStatus"], "fixture-checks-passed")
        self.assertEqual(report["mode"], "test-fixtures")
        self.assertEqual(report["summary"]["acceptedLocalContributions"], 0)
        self.assertEqual(report["summary"]["acceptedFixtureContributions"], 4)
        self.assertTrue(all(c["status"] == "accepted-fixture" for c in report["contributions"]))
        self.assertGreater(report["summary"]["inputFileCount"], 20)
        self.assertTrue(all(value is False for value in report["boundaries"].values()))

    def test_fixture_marker_blocks_real_mode_even_if_record_claims_real(self):
        self.fixture.record["fixtureOnly"] = False
        self.assert_rejected("fixture-in-real-run", self.fixture.run(False))

    def test_fixture_mode_requires_marker(self):
        (self.fixture.root / validate.FIXTURE_MARKER).unlink()
        self.assert_rejected("fixture-marker-missing")

    def test_fixture_mode_must_match_record(self):
        self.fixture.record["fixtureOnly"] = False
        self.assert_rejected("fixture-mode-mismatch")

    def test_missing_manifest_blocks_downstream(self):
        (self.fixture.root / self.spec["manifest"]).unlink()
        report = self.assert_rejected("missing-file")
        self.assertEqual(report["contributions"][1]["status"], "blocked-by-dependency")
        self.assertEqual(report["summary"]["acceptedFixtureContributions"], 0)

    def test_missing_artifact_is_failure(self):
        (self.fixture.root / self.entry["roles"]["engine"]).unlink()
        self.assert_rejected("missing-file")

    def test_changed_artifact_hash_is_failure(self):
        self.fixture.write(self.entry["roles"]["engine"], "CHANGED SYNTHETIC FIXTURE\n")
        self.assert_rejected("hash-mismatch")

    def test_changed_manifest_hash_is_failure(self):
        self.fixture.write(self.spec["manifest"], "{}\n")
        self.assert_rejected("hash-mismatch")

    def test_byte_count_is_strict_not_boolean(self):
        self.entry["files"][0]["bytes"] = True
        self.assert_rejected("invalid-byte-count")

    def test_incorrect_byte_count_is_failure(self):
        self.entry["files"][0]["bytes"] += 1
        self.assert_rejected("byte-count-mismatch")

    def test_manifest_identity_is_not_interchangeable(self):
        self.mutate_manifest(lambda value: value.update(id="05-planner"))
        self.assert_rejected("incompatible-manifest")

    def test_manifest_required_fields_are_not_optional(self):
        self.mutate_manifest(lambda value: value.pop("title"))
        self.assert_rejected("malformed-manifest")

    def test_manifest_artifacts_are_not_nullable(self):
        self.mutate_manifest(lambda value: value.update(artifacts=None))
        self.assert_rejected("malformed-list")

    def test_manifest_artifacts_may_not_absorb_another_scope(self):
        self.mutate_manifest(lambda value: value["artifacts"].append("projects/05-planner/index.html"))
        self.assert_rejected("foreign-artifact")

    def test_duplicate_artifact_manifest_rows_are_rejected(self):
        self.mutate_manifest(lambda value: value["artifacts"].append(value["artifacts"][0]))
        self.assert_rejected("duplicate-value")

    def test_duplicate_locks_are_rejected(self):
        self.entry["files"].append(copy.deepcopy(self.entry["files"][0]))
        self.assert_rejected("duplicate-lock")

    def test_unlocked_artifacts_are_rejected(self):
        self.entry["files"].pop()
        self.assert_rejected("artifact-set-mismatch")

    def test_traversal_is_rejected_before_file_read(self):
        self.entry["files"][0]["path"] = "projects/01-game-studio/../../secret"
        self.assert_rejected("unsafe-path")

    def test_private_store_paths_are_not_artifacts(self):
        self.entry["files"][0]["path"] = "projects/01-game-studio/stores/keys.json"
        self.assert_rejected("private-path")

    def test_symlinked_artifact_is_rejected_even_with_matching_bytes(self):
        name = self.entry["roles"]["engine"]
        path = self.fixture.root / name
        sibling = path.with_name("synthetic-link-target.js")
        sibling.write_bytes(path.read_bytes())
        path.unlink()
        path.symlink_to(sibling.name)
        self.assert_rejected("symlink-forbidden")

    def test_symlinked_parent_is_rejected(self):
        folder = self.fixture.root / self.spec["directory"] / "artifacts"
        target = folder.with_name("synthetic-artifacts")
        folder.rename(target)
        folder.symlink_to(target.name, target_is_directory=True)
        self.assert_rejected("symlink-forbidden")

    def test_interface_version_is_exact(self):
        self.entry["interfaceId"] = "pocket-arcade/browser-game/0"
        self.assert_rejected("interface-mismatch")

    def test_unknown_record_fields_are_rejected(self):
        self.entry["nativeApproval"] = True
        self.assert_rejected("unexpected-field")

    def test_unknown_or_duplicate_contributor_is_rejected(self):
        self.fixture.record["contributions"][1]["id"] = self.entry["id"]
        self.assert_rejected("contribution-set")

    def test_missing_contributor_is_rejected(self):
        self.fixture.record["contributions"].pop()
        self.assert_rejected("contribution-set")

    def test_native_authority_is_never_accepted(self):
        self.fixture.record["boundaries"]["nativeMembership"] = True
        self.assert_rejected("authority-claim")

    def test_cyclic_contract_is_rejected(self):
        self.fixture.contract["contributors"][0]["dependsOn"] = ["09-handoff"]
        self.fixture.write_json(validate.CONTRACT, self.fixture.contract)
        self.assert_rejected("dependency-cycle")

    def test_unknown_dependency_is_rejected(self):
        self.fixture.contract["contributors"][0]["dependsOn"] = ["foreign-world"]
        self.fixture.write_json(validate.CONTRACT, self.fixture.contract)
        self.assert_rejected("unknown-dependency")

    def test_policy_cannot_add_false_as_success(self):
        self.fixture.contract["acceptancePolicy"]["passingProofValues"].append(False)
        self.fixture.write_json(validate.CONTRACT, self.fixture.contract)
        self.assert_rejected("weakened-policy")

    def test_contract_and_policy_descriptions_have_strict_types(self):
        original = copy.deepcopy(self.fixture.contract)
        for field, malformed in (("scope", []), ("missingPolicy", None)):
            with self.subTest(field=field):
                self.fixture.contract = copy.deepcopy(original)
                if field == "scope":
                    self.fixture.contract[field] = malformed
                    code = "malformed-contract"
                else:
                    self.fixture.contract["acceptancePolicy"][field] = malformed
                    code = "malformed-policy"
                self.fixture.write_json(validate.CONTRACT, self.fixture.contract)
                self.assert_rejected(code)

    def test_missing_gate_is_rejected(self):
        self.entry["gates"].pop()
        self.assert_rejected("gate-set-mismatch")

    def test_duplicate_gate_is_rejected(self):
        self.entry["gates"].append(copy.deepcopy(self.entry["gates"][0]))
        self.assert_rejected("duplicate-gate")

    def test_self_asserted_pass_without_proof_is_rejected(self):
        self.entry["gates"][0]["proof"] = None
        self.assert_rejected("malformed-object")

    def test_missing_acceptance_field_is_rejected(self):
        self.entry["gates"][0]["proof"]["pointer"] = "/no/such/status"
        self.assert_rejected("missing-acceptance-field")

    def test_false_acceptance_is_rejected_after_valid_hash_update(self):
        evidence = json.loads((self.fixture.root / self.spec["evidence"]).read_text())
        evidence["results"][self.entry["gates"][0]["id"]] = False
        self.fixture.write_json(self.spec["evidence"], evidence)
        self.fixture.sync()
        self.assert_rejected("acceptance-mismatch")

    def test_boolean_acceptance_is_not_coerced_from_one(self):
        evidence = json.loads((self.fixture.root / self.spec["evidence"]).read_text())
        evidence["results"][self.entry["gates"][0]["id"]] = 1
        self.fixture.write_json(self.spec["evidence"], evidence)
        self.fixture.sync()
        self.assert_rejected("acceptance-mismatch")

    def test_false_is_not_an_allowed_success_expectation(self):
        self.entry["gates"][0]["proof"]["equals"] = False
        self.assert_rejected("invalid-pass-value")

    def test_foreign_proof_cannot_satisfy_gate(self):
        self.entry["gates"][0]["proof"]["path"] = "projects/05-planner/evidence/result.json"
        self.assert_rejected("foreign-proof")

    def test_prime_review_can_bind_actual_acceptance_fields_in_fixture_mode(self):
        name = validate.PROJECT + "/evidence/acceptance/" + self.spec["id"] + ".json"
        self.fixture.write_json(name, {
            "fixtureOnly": True,
            "warning": "SYNTHETIC review only, not an actual observation.",
            "reviewed": {"pass/~field": [{"status": "passed"}]},
        })
        self.entry["gates"][0]["proof"] = {
            "path": name, "sha256": self.fixture.lock(name)["sha256"],
            "pointer": "/reviewed/pass~1~0field/0/status", "equals": "passed",
        }
        self.assertTrue(self.fixture.run()["validationPassed"])

    def test_failed_manifest_check_is_rejected(self):
        self.entry["checkRuns"][0]["exitCode"] = 1
        self.assert_rejected("check-failed")

    def test_check_exit_code_is_not_boolean(self):
        self.entry["checkRuns"][0]["exitCode"] = False
        self.assert_rejected("check-failed")

    def test_receipt_command_must_match_manifest(self):
        self.entry["checkRuns"][0]["argv"] = ["echo", "fabricated-pass"]
        self.assert_rejected("unlisted-check")

    def test_manifest_check_receipts_are_required(self):
        self.entry["checkRuns"] = []
        self.assert_rejected("check-run-set")

    def test_changed_check_log_is_rejected(self):
        self.fixture.write(self.entry["checkRuns"][0]["output"]["path"], "CHANGED SYNTHETIC CHECK LOG\n")
        self.assert_rejected("hash-mismatch")

    def test_awaiting_fixture_records_do_not_pass(self):
        self.fixture.record = self.fixture.empty_record()
        report = self.assert_rejected("contribution-pending")
        self.assertEqual(report["integrationStatus"], "awaiting-real-contributions")
        self.assertEqual(report["summary"]["acceptedLocalContributions"], 0)

    def test_awaiting_record_with_invented_hash_is_rejected(self):
        self.entry["state"] = "awaiting"
        self.assert_rejected("inconsistent-pending")

    def test_three_content_passes_do_not_hide_a_missing_planner(self):
        awaiting = self.fixture.empty_record()
        planner = next(entry for entry in awaiting["contributions"] if entry["id"] == "05-planner")
        self.fixture.record["contributions"][1] = planner
        folder = self.fixture.root / "projects/05-planner"
        shutil.rmtree(folder)
        report = self.assert_rejected("contribution-pending")
        self.assertEqual(report["integrationStatus"], "awaiting-real-contributions")
        self.assertEqual(report["summary"]["verifiedLocalContributions"], 0)
        self.assertEqual(report["summary"]["verifiedFixtureContributions"], 3)
        self.assertEqual(report["summary"]["dependencyBlockedContributions"], 2)
        self.assertEqual(report["summary"]["awaitingContributions"], ["05-planner"])
        self.assertEqual([entry["status"] for entry in report["contributions"]],
                         ["accepted-fixture", "missing", "blocked-by-dependency", "blocked-by-dependency"])
        self.assertFalse(report["validationPassed"])
        self.assertFalse(report["integrationPassed"])

    def test_prime_connected_artifact_hashes_are_verified(self):
        name = validate.PROJECT + "/artifacts/synthetic-consumer-data.json"
        self.fixture.write_json(name, {"fixtureOnly": True, "notARealDeliverable": True})
        self.fixture.record["integrationArtifacts"] = [self.fixture.lock(name)]
        self.assertTrue(self.fixture.run()["validationPassed"])
        self.fixture.write_json(name, {"fixtureOnly": True, "changed": True})
        self.assert_rejected("hash-mismatch")

    def test_prime_artifact_locks_cannot_absorb_foreign_files(self):
        self.fixture.record["integrationArtifacts"] = [self.fixture.lock(self.spec["entrypoint"])]
        self.assert_rejected("foreign-integration-artifact")

    def test_duplicate_json_keys_are_not_silently_overwritten(self):
        self.fixture.write(validate.CONTRACT, '{"schema":"bad","schema":"overwritten"}')
        self.assert_rejected("duplicate-json-key")

    def test_nonfinite_json_is_rejected(self):
        self.fixture.write(validate.CONTRACT, '{"schema":NaN}')
        self.assert_rejected("nonfinite-json")

    def test_overflowing_json_number_is_rejected(self):
        self.fixture.write(validate.CONTRACT, '{"schema":1e999}')
        self.assert_rejected("nonfinite-json")

    def test_fixture_manifest_flag_cannot_be_a_string(self):
        self.mutate_manifest(lambda value: value.update(fixtureOnly="true"))
        self.assert_rejected("malformed-manifest")

    def test_malformed_json_is_rejected(self):
        self.fixture.write(validate.CONTRACT, "{not json")
        self.assert_rejected("malformed-json")

    def test_invalid_record_root_is_rejected_without_crash(self):
        self.fixture.write(validate.RECORD, "[]")
        self.assert_rejected("malformed-object", validate.validate_repository(self.fixture.root, fixture_mode=True))

    def test_output_must_not_escape_prime_evidence(self):
        report = self.fixture.run()
        reader = validate.Reader(self.fixture.root)
        with self.assertRaises(validate.InputError) as raised:
            reader.write_report("projects/05-planner/evidence/forged.json", report)
        self.assertEqual(raised.exception.code, "unsafe-output")

    def test_output_must_not_overwrite_any_input(self):
        report = self.fixture.run()
        reader = validate.Reader(self.fixture.root)
        name = validate.PROJECT + "/evidence/existing-input.json"
        self.fixture.write_json(name, {"fixtureOnly": True})
        reader.read(name)
        with self.assertRaises(validate.InputError) as raised:
            reader.write_report(name, report)
        self.assertEqual(raised.exception.code, "input-overwrite")

    def test_cli_uses_explicit_root_and_persists_fixture_report(self):
        output = validate.PROJECT + "/evidence/fixture-validation.json"
        command = [sys.executable, "-B", str(PROJECT_DIR / "validate.py"),
                   "--root", str(self.fixture.root), "--fixture-mode", "--output", output]
        run = subprocess.run(command, cwd=PROJECT_DIR, capture_output=True, text=True, check=False)
        self.assertEqual(run.returncode, 0, run.stderr)
        report = json.loads(run.stdout)
        self.assertFalse(report["integrationPassed"])
        self.assertEqual(report, json.loads((self.fixture.root / output).read_text()))

    def test_cli_fails_real_mode_for_synthetic_fixtures(self):
        run = subprocess.run(
            [sys.executable, "-B", str(PROJECT_DIR / "validate.py"), "--root", str(self.fixture.root)],
            cwd=PROJECT_DIR, capture_output=True, text=True, check=False,
        )
        self.assertEqual(run.returncode, 1)
        self.assertIn("fixture-in-real-run", self.codes(json.loads(run.stdout)))

    def test_reader_detects_changes_between_reads(self):
        reader = validate.Reader(self.fixture.root)
        reader.read(self.spec["entrypoint"])
        self.fixture.write(self.spec["entrypoint"], "changed synthetic fixture\n")
        with self.assertRaises(validate.InputError) as raised:
            reader.read(self.spec["entrypoint"])
        self.assertEqual(raised.exception.code, "input-changed")


if __name__ == "__main__":
    unittest.main()
