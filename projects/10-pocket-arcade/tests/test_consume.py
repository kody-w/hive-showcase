"""Toy, explicitly synthetic interface fixtures; never real contribution records."""

import copy
import hashlib
import json
from pathlib import Path
import shutil
import sys
import unittest
import uuid

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))
import consume
import validate


def game_fixture():
    score = {
        "fixtureOnly": True, "schema": "little-signals-score/1", "game": "01-game-studio",
        "automated": True, "status": "won", "goal": 2, "delivered": 2,
        "tick": 4, "limit": 9, "points": 5,
    }
    negative = dict(score, status="lost", delivered=0, tick=9)
    result = {
        "fixtureOnly": True, "verified": True, "nativeOrganizationActivated": False,
        "tests": {"total": 1, "passed": 1, "failed": 0},
        "releaseScore": score, "negativeControlScore": negative,
    }
    return result, {"fixtureOnly": True, "replayVerified": True, "score": score}, {
        "fixtureOnly": True, "replayVerified": True, "score": negative,
    }


def tray_fixture():
    parameters = {"width": 20, "depth": 10, "height": 4, "clearance": 1, "bays": 3, "layout": "card-token"}
    result = {
        "fixtureOnly": True, "fabricationOrOrdersPerformed": False, "nativeHiveInitialized": False,
        "physicalTestsPerformed": [], "widthChange": {"disposition": "HOLD"},
    }
    design = {
        "fixtureOnly": True, "schema": "stackline-design/1", "units": "mm", "parameters": parameters,
        "assumptions": {"payload": {"cardWidth": 2, "cardDepth": 1, "cardStackHeight": 1, "tokenDiameter": 1}},
    }
    review = {
        "fixtureOnly": True, "schema": "stackline-digital-review/1", "units": "mm", "params": dict(parameters),
        "bays": [{"width": 3}, {"width": 2}, {"width": 2}],
        "meshes": {"tray": {"closedOrientedEdges": True}, "insert": {"closedOrientedEdges": True}},
    }
    mesh = {"fixtureOnly": True, "physicalTestsPerformed": [], "digitalOnly": True, "status": "pass"}
    return result, design, review, mesh


def maintenance_fixture():
    raw = b"TEST FIXTURE BYTES ONLY; not actual maintenance receipts.\n"
    history = {
        "fixtureOnly": True, "schema": "handoff-public-continuation/1",
        "record_kind": "derived-historical-summary", "continuation_count": 1,
        "historical_outcomes": {"before_strict_acceptance": {"exit_code": 1, "failed": 1}},
        "public_reverification": {
            "historical_execution": "The toy private invocation cannot be independently reverified from this fixture."
        },
    }
    result = {
        "fixtureOnly": True, "schema": "handoff-public-result/1",
        "record_kind": "public-projection-summary", "status": "public-projection-locally-checked",
        "historical_continuation": {"count": 1},
        "historical_validation": copy.deepcopy(history["historical_outcomes"]),
        "snapshot_validation": {"historical_git_objects_available": False, "checks_passed": 7},
        "publication_checks": {
            "kind": "new-public-projection-checks",
            "strict_acceptance": {"passed": 3, "failed": 0},
            "ledger_tests": {"passed": 19, "failed": 0},
            "replay_dom_tests": {"passed": 12, "failed": 0},
            "projection_privacy_tests": {"passed": 14, "failed": 0},
        },
    }
    artifact = {
        "fixtureOnly": True, "schema": "pocket-arcade-maintenance/1", "classification": "SYNTHETIC",
        "scope": "offline-fictional-maintenance", "release_authority": False,
        "input_sha256": hashlib.sha256(raw).hexdigest(), "input_records": 3, "replayed_records": 1,
        "open_queue": ["test-open"],
        "summary": {"event_count": 2, "open_items": 1, "closed_items": 1,
                    "items": [{"item_id": "test-closed", "state": "closed", "event_count": 1},
                              {"item_id": "test-open", "state": "open", "event_count": 1}]},
    }
    contract = {"fixtureOnly": True, "output_schema": "pocket-arcade-maintenance/1",
                "producer_argv_from_repository_root": ["TEST-FIXTURE-NEVER-EXECUTE"]}
    return result, artifact, contract, raw, history


def planner_fixture():
    tasks = [{"id": "toy-opening", "duration": 5}, {"id": "toy-round", "duration": 10}]
    preset = {
        "fixtureOnly": True, "schema": "agenda-planner/1", "classification": "synthetic",
        "day": {"start": 600, "end": 610, "stepMinutes": 5},
        "tasks": tasks, "repairs": {"latestEnd": 620},
    }
    result = {
        "fixtureOnly": True, "id": "05-planner", "status": "passed",
        "nativeInitialized": False, "externalEffectsPerformed": False, "published": False,
        "userStudyPerformed": False, "tractionClaimed": False,
        "tests": {"total": 3, "passed": 3, "failed": 0},
        "adversarialFixtures": {"total": 2, "matched": 2},
    }
    cases = {"fixtureOnly": True, "schema": "agenda-planner-fixture-results/1",
             "cases": [{"matches": True}, {"matches": True}]}
    bridge = {
        "fixtureOnly": True, "schema": "pocket-arcade-tournament-review/1",
        "ownerApproved": False, "nativeAuthority": False,
        "baseline": {"status": "infeasible", "schedule": None, "requiredMinutes": 15,
                     "availableMinutes": 10, "start": 600, "cutoff": 610},
        "repair": {"status": "minimum-proven", "minimumProven": True, "cheaperCandidatesComplete": True,
                   "tiesComplete": False, "optimum": {"changedFields": 1, "totalMinutes": 5}},
        "proposal": {"status": "feasible", "verification": {"valid": True, "issues": []},
                     "ownerApproved": False, "requiresOwnerReview": True, "tasksUnchanged": True,
                     "inputOnlyRoundTripVerified": True, "forgedImportedClaimRejected": True,
                     "cutoff": 615, "taskCount": 2,
                     "schedule": [{"taskId": "toy-opening", "start": 600, "end": 605, "duration": 5},
                                  {"taskId": "toy-round", "start": 605, "end": 615, "duration": 10}]},
    }
    exported = {
        "fixtureOnly": True, "schema": "agenda-planner-export/1",
        "agenda": {"tasks": copy.deepcopy(tasks), "day": {"start": 600, "end": 615}},
        "pocketArcadeReview": {"modelProposalOnly": True, "ownerApproved": False, "nativeAuthority": False,
                              "humanFunVerified": False, "marketValidated": False,
                              "physicalFabricationApproved": False, "publicationApproved": False},
    }
    return result, preset, cases, bridge, exported


class ConsumerFixtureTests(unittest.TestCase):
    def test_toy_game_shape_preserves_both_recorded_outcomes(self):
        data = consume.game_data(*game_fixture())
        self.assertEqual(data["score"]["delivered"], 2)
        self.assertEqual(data["negativeControl"]["status"], "lost")
        self.assertTrue(data["score"]["fixtureOnly"])

    def test_game_checks_do_not_coerce_a_boolean_test_count(self):
        result, trained, untaught = game_fixture()
        result["tests"]["passed"] = True
        with self.assertRaises(validate.InputError):
            consume.game_data(result, trained, untaught)

    def test_game_cannot_hide_a_failed_replay(self):
        result, trained, untaught = game_fixture()
        untaught["replayVerified"] = False
        with self.assertRaises(validate.InputError):
            consume.game_data(result, trained, untaught)

    def test_game_score_must_match_its_exact_result_field(self):
        result, trained, untaught = copy.deepcopy(game_fixture())
        result["releaseScore"] = dict(result["releaseScore"], points=999)
        with self.assertRaises(validate.InputError):
            consume.game_data(result, trained, untaught)

    def test_toy_geometry_remains_digital_and_unapproved(self):
        data = consume.tray_data(*tray_fixture())
        self.assertEqual(data["outerMM"], [20, 10, 4])
        self.assertFalse(data["physicalFitVerified"])
        self.assertFalse(data["fabricationApproved"])

    def test_geometry_parameters_cannot_disagree_with_review(self):
        result, design, review, mesh = tray_fixture()
        review["params"]["width"] = 30
        with self.assertRaises(validate.InputError):
            consume.tray_data(result, design, review, mesh)

    def test_geometry_gate_never_relabels_a_real_physical_claim(self):
        result, design, review, mesh = tray_fixture()
        result["fabricationOrOrdersPerformed"] = True
        with self.assertRaises(validate.InputError):
            consume.tray_data(result, design, review, mesh)

    def test_toy_maintenance_accounting_keeps_no_release_authority(self):
        data = consume.maintenance_data(*maintenance_fixture())
        self.assertEqual((data["inputRecords"], data["uniqueEvents"], data["replayedRecords"]), (3, 2, 1))
        self.assertEqual(data["openQueue"], ["test-open"])
        self.assertFalse(data["releaseAuthority"])
        self.assertFalse(data["historicalInvocationPubliclyReverified"])
        self.assertEqual(data["historicalRecordKind"], "derived-historical-summary")

    def test_maintenance_rejects_an_unrelated_input_hash(self):
        result, artifact, contract, raw, history = maintenance_fixture()
        with self.assertRaises(validate.InputError):
            consume.maintenance_data(result, artifact, contract, raw + b"changed", history)

    def test_maintenance_rejects_double_counting(self):
        result, artifact, contract, raw, history = maintenance_fixture()
        artifact["summary"]["event_count"] = 3
        with self.assertRaises(validate.InputError):
            consume.maintenance_data(result, artifact, contract, raw, history)

    def test_maintenance_must_not_rewrite_the_failed_midpoint_as_pass(self):
        result, artifact, contract, raw, history = maintenance_fixture()
        result["historical_validation"]["before_strict_acceptance"]["exit_code"] = 0
        with self.assertRaises(validate.InputError):
            consume.maintenance_data(result, artifact, contract, raw, history)

    def test_maintenance_rejects_old_private_result_schema(self):
        result, artifact, contract, raw, history = maintenance_fixture()
        result["schema"] = "local-hive-work-result/1"
        with self.assertRaises(validate.InputError):
            consume.maintenance_data(result, artifact, contract, raw, history)

    def test_maintenance_requires_the_derived_history_label(self):
        result, artifact, contract, raw, history = maintenance_fixture()
        history["record_kind"] = "new-execution"
        with self.assertRaises(validate.InputError):
            consume.maintenance_data(result, artifact, contract, raw, history)

    def test_maintenance_cannot_claim_private_identity_was_publicly_reverified(self):
        result, artifact, contract, raw, history = maintenance_fixture()
        history["public_reverification"]["historical_execution"] = "Private invocation independently verified."
        with self.assertRaises(validate.InputError):
            consume.maintenance_data(result, artifact, contract, raw, history)

    def test_maintenance_requires_all_current_privacy_targets(self):
        result, artifact, contract, raw, history = maintenance_fixture()
        result["publication_checks"]["projection_privacy_tests"]["passed"] = 13
        with self.assertRaises(validate.InputError):
            consume.maintenance_data(result, artifact, contract, raw, history)

    def test_maintenance_cannot_depend_on_private_git_objects(self):
        result, artifact, contract, raw, history = maintenance_fixture()
        result["snapshot_validation"]["historical_git_objects_available"] = True
        with self.assertRaises(validate.InputError):
            consume.maintenance_data(result, artifact, contract, raw, history)

    def test_toy_planner_preserves_refusal_and_unapproved_alternative(self):
        data = consume.planner_data(*planner_fixture())
        self.assertEqual((data["requiredMinutes"], data["availableMinutes"]), (15, 10))
        self.assertEqual(data["baselineStatus"], "infeasible")
        self.assertEqual(data["proposalStatus"], "feasible")
        self.assertFalse(data["ownerApproved"])
        self.assertFalse(data["tiesComplete"])

    def test_planner_rejects_a_partial_schedule_for_the_infeasible_baseline(self):
        result, preset, cases, bridge, exported = planner_fixture()
        bridge["baseline"]["schedule"] = []
        with self.assertRaises(validate.InputError):
            consume.planner_data(result, preset, cases, bridge, exported)

    def test_planner_model_cannot_grant_owner_approval(self):
        result, preset, cases, bridge, exported = planner_fixture()
        exported["pocketArcadeReview"]["ownerApproved"] = True
        with self.assertRaises(validate.InputError):
            consume.planner_data(result, preset, cases, bridge, exported)

    def test_selected_extension_cannot_silently_shorten_a_task(self):
        result, preset, cases, bridge, exported = planner_fixture()
        exported["agenda"]["tasks"][1]["duration"] = 9
        with self.assertRaises(validate.InputError):
            consume.planner_data(result, preset, cases, bridge, exported)

    def test_planner_rejects_unmatched_adversarial_evidence(self):
        result, preset, cases, bridge, exported = planner_fixture()
        cases["cases"][0]["matches"] = False
        with self.assertRaises(validate.InputError):
            consume.planner_data(result, preset, cases, bridge, exported)

    def test_planner_rejects_a_duplicate_task_in_the_witness(self):
        result, preset, cases, bridge, exported = planner_fixture()
        bridge["proposal"]["schedule"][1]["taskId"] = "toy-opening"
        with self.assertRaises(validate.InputError):
            consume.planner_data(result, preset, cases, bridge, exported)

    def test_planner_cannot_call_an_unverified_proposal_feasible(self):
        result, preset, cases, bridge, exported = planner_fixture()
        bridge["proposal"]["verification"]["valid"] = False
        with self.assertRaises(validate.InputError):
            consume.planner_data(result, preset, cases, bridge, exported)

    def test_planner_cost_fields_are_not_boolean_counters(self):
        result, preset, cases, bridge, exported = planner_fixture()
        bridge["repair"]["optimum"]["changedFields"] = True
        with self.assertRaises(validate.InputError):
            consume.planner_data(result, preset, cases, bridge, exported)

    def test_marked_test_root_cannot_emit_real_binding_outputs(self):
        root = PROJECT / "tests/fixture-workspaces" / ("consumer-fixture-" + uuid.uuid4().hex)
        root.mkdir(parents=True)
        (root / validate.FIXTURE_MARKER).write_text(json.dumps({
            "schema": "pocket-arcade-test-fixture/1", "fixtureOnly": True,
        }))
        try:
            with self.assertRaises(validate.InputError):
                consume.outputs(root)
        finally:
            shutil.rmtree(root)
            try:
                root.parent.rmdir()
            except OSError:
                pass


if __name__ == "__main__":
    unittest.main()
