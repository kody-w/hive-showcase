#!/usr/bin/env python3
"""Bind all four supplied original interfaces without granting real-world approval."""

import argparse
import hashlib
import json
import math
import sys

from capture_checks import HISTORICAL_SNAPSHOT, SOURCE_COMMITS, write_owned
from public_checks import portable_output
import validate


P = validate.PROJECT
ROLES = {
    "01-game-studio": {
        "engine": "projects/01-game-studio/engine.js",
        "replay": "projects/01-game-studio/evidence/runs/release-trained.json",
    },
    "05-planner": {
        "tournament-plan": "projects/05-planner/fixtures/pocket-arcade.json",
    },
    "07-manufacturing": {
        "tray-design": "projects/07-manufacturing/generated/pocket-arcade/tray.stl",
        "fabrication-review": "projects/07-manufacturing/generated/pocket-arcade/review.json",
    },
    "09-handoff": {
        "maintenance-tool": "projects/09-handoff/cli.py",
        "handoff": "projects/09-handoff/artifacts/maintenance-contract.json",
    },
}


def check(condition, message):
    validate.require(condition, "consumer-contract", message)


def integer(value, minimum=0):
    return type(value) is int and value >= minimum


def number(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def game_data(result, trained, untaught):
    check(result.get("verified") is True and result.get("nativeOrganizationActivated") is False,
          "Game evidence must be locally verified and non-native.")
    tests = result["tests"]
    check(integer(tests["total"], 1) and integer(tests["passed"], 1) and integer(tests["failed"])
          and tests["passed"] == tests["total"] and tests["failed"] == 0,
          "Game's recorded test set must actually pass.")
    check(trained["replayVerified"] is True and untaught["replayVerified"] is True,
          "Both success and negative-control replays must remain verified.")
    score, negative = trained["score"], untaught["score"]
    for item in (score, negative):
        check(item["schema"] == "little-signals-score/1" and item["game"] == "01-game-studio"
              and item["automated"] is True, "Only the actual automated recording interface is consumed.")
        check(integer(item["goal"], 1) and integer(item["delivered"])
              and integer(item["limit"], 1) and integer(item["tick"])
              and item["tick"] <= item["limit"], "Score bounds are invalid.")
    check(score == result["releaseScore"] and negative == result["negativeControlScore"],
          "Release evidence and actual replay wrapper scores must agree.")
    check(score["status"] == "won" and score["delivered"] == score["goal"],
          "The consumed trained recording must be an actual completed local run.")
    check(negative["status"] == "lost" and negative["delivered"] < negative["goal"],
          "The preserved negative control must not be reinterpreted as a win.")
    return {
        "id": "01-game-studio", "classification": "Actual deterministic automated recording; not a human match",
        "score": score, "negativeControl": negative, "testsPassed": tests["passed"],
        "entrypoint": "projects/01-game-studio/index.html",
        "replay": ROLES["01-game-studio"]["replay"],
        "negativeReplay": "projects/01-game-studio/evidence/runs/release-untaught.json",
        "instructions": "Teach Pip, Ada and Bop both return-home and recharge lessons. Aim for 12 pods before beat 150 in Stone garden. The game owns scoring and replay.",
    }


def tray_data(result, design, review, mesh):
    check(result.get("fabricationOrOrdersPerformed") is False and result.get("nativeHiveInitialized") is False,
          "Digital review must not claim fabrication or native activation.")
    check(result["physicalTestsPerformed"] == [] and mesh["physicalTestsPerformed"] == []
          and mesh["digitalOnly"] is True and mesh["status"] == "pass",
          "Independent digital checks and unperformed physical work must be explicit.")
    check(design["schema"] == "stackline-design/1" and review["schema"] == "stackline-digital-review/1"
          and design["units"] == review["units"] == "mm", "Tray interface or units differ.")
    params = design["parameters"]
    check(params == review["params"], "Tray parameters and review describe different objects.")
    check(all(number(params[key]) for key in ("width", "depth", "height", "clearance"))
          and integer(params["bays"], 1) and params["layout"] == "card-token",
          "Pocket Arcade needs the actual finite card/token geometry.")
    check(len(review["bays"]) == params["bays"] and len(review["meshes"]) == 2
          and all(item["closedOrientedEdges"] is True for item in review["meshes"].values()),
          "The actual two-part digital solids must pass their stated mesh checks.")
    check(result["widthChange"]["disposition"] == "HOLD", "The rejected width change must remain held.")
    payload = design["assumptions"]["payload"]
    check(all(number(payload[key]) for key in ("cardWidth", "cardDepth", "cardStackHeight", "tokenDiameter")),
          "Assumed payload dimensions are missing or invalid.")
    return {
        "id": "07-manufacturing", "classification": "Nominal digital geometry only; not fabricated",
        "outerMM": [params["width"], params["depth"], params["height"]],
        "bays": params["bays"], "clearanceMM": params["clearance"],
        "bayWidthsMM": [bay["width"] for bay in review["bays"]],
        "assumedCardMM": [payload["cardWidth"], payload["cardDepth"], payload["cardStackHeight"]],
        "assumedTokenDiameterMM": payload["tokenDiameter"],
        "physicalFitVerified": False, "fabricationApproved": False,
        "entrypoint": "projects/07-manufacturing/index.html",
        "bundle": "projects/07-manufacturing/generated/pocket-arcade/review-bundle.zip",
        "drawing": "projects/07-manufacturing/generated/pocket-arcade/drawing.svg",
        "review": ROLES["07-manufacturing"]["fabrication-review"],
        "instructions": "Choose the Pocket Arcade preset. Inspect the two STL solids, nominal-mm drawing and review bundle. Actual card/token fit, strength and manufacture remain unperformed.",
    }


def planner_data(result, preset, fixtures, bridge, exported):
    check(result["id"] == "05-planner" and result["status"] == "passed"
          and all(result[key] is False for key in
                  ("nativeInitialized", "externalEffectsPerformed", "published", "userStudyPerformed", "tractionClaimed")),
          "Planner checks must retain offline, non-native and unvalidated-market boundaries.")
    tests = result["tests"]
    check(integer(tests["total"], 1) and integer(tests["passed"], 1) and type(tests["failed"]) is int
          and tests["total"] == tests["passed"] and tests["failed"] == 0, "The original planner tests must pass.")
    cases = fixtures["cases"]
    check(fixtures["schema"] == "agenda-planner-fixture-results/1" and type(cases) is list and cases
          and all(case["matches"] is True for case in cases)
          and result["adversarialFixtures"]["total"] == result["adversarialFixtures"]["matched"] == len(cases),
          "Recorded adversarial cases must all match without relabeling unknown or unsupported results.")
    check(preset["schema"] == "agenda-planner/1" and preset["classification"] == "synthetic",
          "The supplied tournament preset is an explicit synthetic model.")
    day, tasks = preset["day"], preset["tasks"]
    check(integer(day["start"]) and integer(day["end"], 1) and day["start"] < day["end"] <= 1440
          and integer(day["stepMinutes"], 1) and type(tasks) is list and 0 < len(tasks) <= 8
          and all(integer(task["duration"], 1) for task in tasks), "Tournament bounds or required work are invalid.")
    check(bridge["schema"] == "pocket-arcade-tournament-review/1"
          and bridge["ownerApproved"] is False and bridge["nativeAuthority"] is False,
          "A model bridge cannot grant owner or native approval.")
    baseline, proposal, repair = bridge["baseline"], bridge["proposal"], bridge["repair"]
    required = sum(task["duration"] for task in tasks)
    check(baseline["status"] == "infeasible" and baseline["schedule"] is None
          and baseline["requiredMinutes"] == required
          and integer(baseline["availableMinutes"]) and required > baseline["availableMinutes"]
          and baseline["start"] == day["start"] and baseline["cutoff"] == day["end"],
          "The actual overloaded baseline must remain refused with no purported schedule.")
    check(repair["status"] == "minimum-proven" and repair["minimumProven"] is True
          and repair["cheaperCandidatesComplete"] is True and type(repair["tiesComplete"]) is bool
          and integer(repair["optimum"]["changedFields"], 1) and integer(repair["optimum"]["totalMinutes"], 1),
          "Repair minimality and incomplete tie enumeration must remain distinct.")
    check(proposal["status"] == "feasible" and proposal["verification"] == {"valid": True, "issues": []}
          and proposal["ownerApproved"] is False and proposal["requiresOwnerReview"] is True
          and proposal["tasksUnchanged"] is True and proposal["inputOnlyRoundTripVerified"] is True
          and proposal["forgedImportedClaimRejected"] is True,
          "The complete model proposal needs independent verification, honest import and pending approval.")
    agenda = exported["agenda"]
    context = exported["pocketArcadeReview"]
    check(exported["schema"] == "agenda-planner-export/1" and context["modelProposalOnly"] is True
          and all(context[key] is False for key in
                  ("ownerApproved", "nativeAuthority", "humanFunVerified", "marketValidated",
                   "physicalFabricationApproved", "publicationApproved")),
          "Original model-review flags must remain unchanged; reviewed showcase hosting is a separate authorization.")
    check(agenda["tasks"] == tasks and agenda["day"]["start"] == day["start"]
          and integer(proposal["cutoff"], 1) and proposal["cutoff"] == agenda["day"]["end"]
          and day["end"] < proposal["cutoff"] <= preset["repairs"]["latestEnd"]
          and repair["optimum"] == {"changedFields": 1, "totalMinutes": proposal["cutoff"] - day["end"]},
          "This selected proposal must extend only the cutoff, without dropping or shortening tasks.")
    schedule = proposal["schedule"]
    check(len(schedule) == proposal["taskCount"] == len(tasks)
          and {entry["taskId"] for entry in schedule} == {task["id"] for task in tasks}
          and sum(entry["duration"] for entry in schedule) == required,
          "The model witness must contain all original work exactly once.")
    return {
        "id": "05-planner", "classification": "Actual solver output over a synthetic tournament model",
        "baselineStatus": "infeasible", "requiredMinutes": required,
        "availableMinutes": baseline["availableMinutes"], "start": day["start"], "cutoff": day["end"],
        "proposalStatus": "feasible", "proposedCutoff": proposal["cutoff"], "taskCount": len(tasks),
        "minimumChange": repair["optimum"], "tiesComplete": repair["tiesComplete"],
        "schedule": schedule, "ownerApproved": False, "requiresOwnerReview": True,
        "entrypoint": "projects/05-planner/index.html",
        "preset": ROLES["05-planner"]["tournament-plan"],
        "analysis": P + "/artifacts/tournament-analysis.json",
        "proposal": P + "/artifacts/tournament-proposal.json",
        "instructions": "Load Pocket Arcade. Its 85 required minutes do not fit the initial 75-minute cutoff. Inspect the refusal, then review the unapproved +10-minute cutoff proposal or another explicitly permitted model edit; no task disappears.",
    }


def maintenance_data(result, artifact, contract, input_bytes, history):
    check(artifact["schema"] == contract["output_schema"] == "pocket-arcade-maintenance/1"
          and artifact["classification"] == "SYNTHETIC"
          and artifact["scope"] == "offline-fictional-maintenance"
          and artifact["release_authority"] is False, "Maintenance data cannot acquire real telemetry or release authority.")
    check(hashlib.sha256(input_bytes).hexdigest() == artifact["input_sha256"],
          "Maintenance input hash does not match the actual bounded fixture.")
    summary = artifact["summary"]
    check(integer(artifact["input_records"]) and integer(artifact["replayed_records"])
          and integer(summary["event_count"])
          and artifact["input_records"] == summary["event_count"] + artifact["replayed_records"],
          "Maintenance raw/unique/replayed accounting is inconsistent.")
    items = summary["items"]
    check(type(items) is list and all(item["state"] in ("open", "closed")
          and integer(item["event_count"], 1) for item in items)
          and len({item["item_id"] for item in items}) == len(items)
          and sum(item["event_count"] for item in items) == summary["event_count"],
          "Maintenance item counts or states are inconsistent.")
    expected_open = sorted(item["item_id"] for item in items if item["state"] == "open")
    check(artifact["open_queue"] == expected_open and summary["open_items"] == len(expected_open)
          and summary["closed_items"] == len(items) - len(expected_open),
          "Maintenance queue does not agree with the item summaries.")
    check(result["schema"] == "handoff-public-result/1"
          and result["record_kind"] == "public-projection-summary"
          and result["status"] == "public-projection-locally-checked",
          "Maintenance acceptance requires the current public projection, not private invocation records.")
    publication = result["publication_checks"]
    check(publication["kind"] == "new-public-projection-checks", "Current checks must not impersonate historical execution.")
    for field, minimum in (("strict_acceptance", 3), ("ledger_tests", 19),
                           ("replay_dom_tests", 12), ("projection_privacy_tests", 14)):
        check(integer(publication[field]["passed"], minimum) and type(publication[field]["failed"]) is int
              and publication[field]["failed"] == 0, "Current public maintenance checks must retain all acceptance targets.")
    check(history["schema"] == "handoff-public-continuation/1"
          and history["record_kind"] == "derived-historical-summary"
          and type(history["continuation_count"]) is int and history["continuation_count"] == 1
          and result["historical_continuation"]["count"] == history["continuation_count"],
          "A labeled public historical summary is required; no new handoff is inferred.")
    check(result["historical_validation"] == history["historical_outcomes"],
          "Public result and derived historical observations disagree.")
    before = history["historical_outcomes"]["before_strict_acceptance"]
    check(type(before["exit_code"]) is int and before["exit_code"] == 1
          and type(before["failed"]) is int and before["failed"] == 1,
          "The historical failing midpoint must remain a failure, not a retrospective pass.")
    qualification = history["public_reverification"]["historical_execution"]
    check(isinstance(qualification, str) and "cannot be independently reverified" in qualification,
          "The public projection must disclose that the private invocation cannot be independently reverified.")
    check(result["snapshot_validation"]["historical_git_objects_available"] is False
          and integer(result["snapshot_validation"]["checks_passed"], 7),
          "Public reproducibility must not require private Git objects.")
    return {
        "id": "09-handoff", "classification": "Actual utility output over explicitly synthetic receipts",
        "inputRecords": artifact["input_records"], "uniqueEvents": summary["event_count"],
        "replayedRecords": artifact["replayed_records"], "openQueue": artifact["open_queue"],
        "items": items, "inputSha256": artifact["input_sha256"], "releaseAuthority": False,
        "historyRecord": "projects/09-handoff/evidence/historical-continuation.json",
        "historicalRecordKind": "derived-historical-summary",
        "historicalInvocationPubliclyReverified": False,
        "historicalQualification": qualification,
        "entrypoint": "projects/09-handoff/index.html",
        "artifact": "projects/09-handoff/artifacts/pocket-arcade-maintenance.json",
        "contract": ROLES["09-handoff"]["handoff"],
        "producerArgv": contract["producer_argv_from_repository_root"],
        "instructions": "Inspect the public maintenance queue and run its reproducible CLI. The historical 4-to-3 repair is preserved as a labeled public projection; the removed private invocation cannot be independently reverified. Synthetic items grant no operational release authority.",
    }


def encode(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")


def lock(name, data):
    return {"path": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def outputs(root):
    reader = validate.Reader(root)
    check(not (reader.root / validate.FIXTURE_MARKER).exists(), "A marked unit-test root cannot produce real contribution records.")
    specs = validate.validate_contract(reader.json(validate.CONTRACT))
    receipts, results = {}, {}
    for identifier in ROLES:
        spec = specs[identifier]
        name = P + "/evidence/checks/" + identifier + "-runs.json"
        receipt = reader.json(name)
        check(receipt["schema"] in ("pocket-arcade-component-checks/1", "pocket-arcade-component-checks/2")
              and receipt["projectId"] == identifier and receipt["fixtureOnly"] is False
              and receipt["allPassed"] is True and receipt["declaredFilesUnchanged"] is True,
              "Actual reviewed command receipts are required before binding a contribution.")
        if receipt["schema"] == "pocket-arcade-component-checks/1":
            check(identifier != "09-handoff" and receipt["approvedSnapshot"] == HISTORICAL_SNAPSHOT
                  and receipt["recordedOriginalSourceCommit"] == SOURCE_COMMITS[identifier],
                  "Only unchanged original check records may retain historical revision metadata.")
        else:
            check(receipt["recordKind"] == "new-public-projection-checks"
                  and receipt["executionRoot"] == "." and type(receipt["pathRebasing"]) is list
                  and receipt["historicalSourceCommit"] == SOURCE_COMMITS[identifier],
                  "A portable current-public-byte check record is required.")
        manifest = validate.validate_manifest(reader, spec, False, receipt["manifest"]["sha256"])
        check([run["argv"] for run in receipt["checkRuns"]] == manifest["checks"],
              "Captured commands do not match the exact manifest checks.")
        expected_files = set(manifest["artifacts"]) | {spec["entrypoint"], spec["evidence"]}
        check({file["path"] for file in receipt["componentFiles"]} == expected_files
              and len(receipt["componentFiles"]) == len(expected_files), "Captured artifact inventory is incomplete.")
        for file in receipt["componentFiles"]:
            reader.read(file["path"], file["sha256"], file["bytes"])
        for run in receipt["checkRuns"]:
            check(type(run["exitCode"]) is int and run["exitCode"] == 0, "An actual component command failed.")
            file = run["output"]
            check(file["path"].startswith(P + "/evidence/checks/" + identifier + "-"),
                  "A captured command log is out of scope.")
            reader.read(file["path"], file["sha256"], file["bytes"])
        result = reader.json(spec["evidence"])
        check(type(result) is dict, "Actual component result must be a JSON object.")
        check(result.get("fixtureOnly", False) is False, "Unit-test fixtures cannot become actual contributions.")
        receipts[identifier], results[identifier] = receipt, result
    game = game_data(results["01-game-studio"],
                     reader.json(ROLES["01-game-studio"]["replay"]),
                     reader.json("projects/01-game-studio/evidence/runs/release-untaught.json"))
    bridge = reader.json(P + "/artifacts/tournament-analysis.json")
    for source in bridge["sourceFiles"]:
        check(source["path"].startswith("projects/05-planner/"), "Planner bridge source is out of scope.")
        reader.read(source["path"], source["sha256"], source["bytes"])
    planner = planner_data(results["05-planner"],
                     reader.json(ROLES["05-planner"]["tournament-plan"]),
                     reader.json("projects/05-planner/evidence/fixture-results.json"),
                     bridge, reader.json(P + "/artifacts/tournament-proposal.json"))
    tray = tray_data(results["07-manufacturing"],
                     reader.json("projects/07-manufacturing/generated/pocket-arcade/parameters.json"),
                     reader.json(ROLES["07-manufacturing"]["fabrication-review"]),
                     reader.json("projects/07-manufacturing/evidence/mesh-validation.json"))
    maintenance_result = results["09-handoff"]
    history_path = maintenance_result["historical_continuation"]["record"]
    check(history_path == "projects/09-handoff/evidence/historical-continuation.json",
          "Historical maintenance evidence must point to the declared public summary.")
    history = reader.json(history_path)
    for phase in ("before", "after"):
        source = history["repair"][phase + "_source"]
        check(source.startswith("projects/09-handoff/"), "Historical source snapshot is out of scope.")
        reader.read(source, history["repair"][phase + "_sha256"])
    for field in ("publication_checks", "snapshot_validation"):
        source = maintenance_result[field]
        check(source["path"].startswith("projects/09-handoff/evidence/"),
              "Public maintenance reproducibility evidence is out of scope.")
        evidence = reader.json(source["path"], source["sha256"])
        check(evidence["execution_root"] == "." and all(run["exit_code"] == 0 for run in evidence["runs"]),
              "Actual public reproducibility records must contain successful portable executions.")
    maintenance = maintenance_data(maintenance_result,
                     reader.json("projects/09-handoff/artifacts/pocket-arcade-maintenance.json"),
                     reader.json(ROLES["09-handoff"]["handoff"]),
                     reader.read("projects/09-handoff/fixtures/duplicate.jsonl"), history)
    for name in (tray["bundle"], tray["drawing"]):
        reader.read(name)
    display_sources = [
        ROLES["01-game-studio"]["replay"], game["negativeReplay"],
        planner["preset"], planner["analysis"], planner["proposal"],
        "projects/07-manufacturing/generated/pocket-arcade/parameters.json", tray["review"], tray["bundle"], tray["drawing"],
        maintenance["artifact"], maintenance["contract"], history_path, "projects/09-handoff/fixtures/duplicate.jsonl",
    ]
    data = {
        "schema": "pocket-arcade-connected-data/2", "fixtureOnly": False,
        "sourceKind": "current-public-artifact-bytes",
        "artifactSetSha256": hashlib.sha256(encode([
            {"id": identifier, "manifest": receipt["manifest"], "files": receipt["componentFiles"]}
            for identifier, receipt in receipts.items()
        ])).hexdigest(),
        "publication": {"showcaseAuthorized": True, "performedByThisBuild": False,
                        "scope": "Reviewed static showcase only; no native, human, physical or market approval."},
        "integrationStatus": "ready-for-local-validation",
        "pending": [], "game": game, "planner": planner, "tray": tray, "maintenance": maintenance,
        "sources": [reader.inputs[name] for name in display_sources],
        "limits": ["Recorded values are not a current hash verification.",
                   "The original tournament cutoff is infeasible; the verified alternative is an unapproved synthetic-model proposal, not an actual tournament.",
                   "Synthetic maintenance data, automated scores and nominal geometry are not human, physical or native acceptance.",
                   "Maintenance history is a labeled public derivative; private invocation identity cannot be publicly reverified."],
    }
    produced = {
        P + "/artifacts/connected-data.json": encode(data),
        P + "/connected-data.js": b"/* Original data-only binding of actual local artifact outputs. */\n"
          + ("globalThis.PocketArcadeData = Object.freeze(" + encode(data).decode("utf-8").strip().replace("<", "\\u003c") + ");\n").encode("utf-8"),
    }
    record = {
        "schema": "pocket-arcade-contributions/1", "fixtureOnly": False,
        "scope": "local-original-artifact-integration", "boundaries": dict(validate.BOUNDARIES),
        "contributions": [], "integrationArtifacts": [],
    }
    gate_basis = {
        "game-playable": "Preserved original engine/controller/DOM check records remain byte-valid; the actual trained recording wins. These component checks are not newly rerun by this public refresh.",
        "game-deterministic": "Preserved declared checks replay all eight recordings and verify the six-replay bundle; actual trained and negative-control scores still agree with unchanged result.json bytes.",
        "game-honest-scope": "Actual scores are labeled automated, the negative control remains lost, nativeOrganizationActivated is false, and no human-fun claim is adopted.",
        "planner-finite": "Preserved original checks and the unchanged recorded solver bridge verify the finite seven-task preset, complete model proposal and input-only export/import round trip; this refresh does not rerun the planner workflow.",
        "planner-refuses-overflow": "The 85-minute baseline cannot fit 75 minutes and retains a null schedule. Adversarial cases match; forged imported feasibility is ignored. The +10-minute model proposal preserves every task, and incomplete tie enumeration remains explicit.",
        "planner-offline": "Preserved static/DOM checks cover local-only behavior. Historical no-publication observations remain historical; authorization to publish this reviewed showcase does not approve a real tournament, native activation or market claim.",
        "tray-geometry": "Preserved independent mesh/inventory checks remain byte-valid; current card-token parameters agree and both nominal solids have closed oriented edges. No manufacturing workflow is rerun.",
        "tray-review": "The unchanged review, millimetre drawing and review ZIP remain hashed and covered by their preserved valid deterministic check records.",
        "tray-unbuilt-disclosure": "Actual result/mesh records explicitly report no physical tests, fabrication, orders or native activation. The 196 mm width change remains HOLD.",
        "maintenance-contract": "Seven current public checks cover strict acceptance, 19 ledger regressions, 12 replay tests, 14 projection/privacy tests and public evidence binding. Historical failing acceptance remains exit 1 in a labeled derived record.",
        "maintenance-reproducible": "Current public checks reproduce the unchanged CLI/export and the included midpoint/repaired-source behavior without private Git objects. The current queue retains exact input hash and raw/unique/replayed counts.",
        "maintenance-artifact-only": "Current public artifacts and an explicitly derived historical summary are inspected. This does not independently reverify the removed private invocation or identity. SYNTHETIC scope and release_authority false remain mandatory.",
    }
    for identifier, spec in specs.items():
        entry = {
            "id": identifier, "interfaceId": spec["interfaceId"], "state": "awaiting",
            "sourceCommit": None, "manifestSha256": None, "files": [], "roles": {}, "checkRuns": [],
            "gates": [{"id": gate["id"], "state": "awaiting", "proof": None} for gate in spec["gates"]],
        }
        if identifier in receipts:
            receipt = receipts[identifier]
            review_name = P + "/evidence/acceptance/" + identifier + ".json"
            review = {
                "schema": "pocket-arcade-bounded-acceptance/1", "fixtureOnly": False,
                "projectId": identifier,
                "sourceBasis": "Current public bytes and explicitly scoped recorded checks; no private Git history required.",
                "historicalSourceCommit": SOURCE_COMMITS[identifier],
                "checkProvenance": "new-public-projection-checks" if identifier == "09-handoff" else "preserved-valid-original-checks-not-rerun",
                "scope": "Public-file technical acceptance only; never verification of withheld private execution.",
                "checkCapture": reader.inputs[P + "/evidence/checks/" + identifier + "-runs.json"],
                "partnerResult": reader.inputs[spec["evidence"]],
                "checkOutputs": [run["output"] for run in receipt["checkRuns"]],
                "gates": {gate["id"]: {"status": "passed", "basis": gate_basis[gate["id"]]} for gate in spec["gates"]},
                "boundaries": dict(validate.BOUNDARIES),
                "humanOrOwnerReview": "pending", "physicalAcceptance": "not-performed",
                "publication": {"showcaseAuthorized": True, "deploymentPerformedHere": False},
                "browserObservation": "No browser evidence is claimed here; public deployment validation is a separate workflow.",
            }
            produced[review_name] = encode(review)
            proof_hash = lock(review_name, produced[review_name])["sha256"]
            entry.update({
                "state": "received", "sourceCommit": SOURCE_COMMITS[identifier],
                "manifestSha256": receipt["manifest"]["sha256"],
                "files": receipt["componentFiles"], "roles": ROLES[identifier], "checkRuns": receipt["checkRuns"],
                "gates": [{
                    "id": gate["id"], "state": "pass",
                    "proof": {"path": review_name, "sha256": proof_hash,
                              "pointer": "/gates/" + gate["id"] + "/status", "equals": "passed"},
                    "note": "Local content gate only; never a native approval or a waiver of a missing integration dependency.",
                } for gate in spec["gates"]],
            })
        record["contributions"].append(entry)
    prime_inputs = [
        P + "/" + name for name in ("consume.py", "capture_checks.py", "validate.py", "public_checks.py", "planner_bridge.mjs",
                                   "verify_experience.cjs", "index.html", "style.css", "app.js", "model.js",
                                   "artifacts/operator-kit.html")
    ] + [P + "/evidence/checks/" + identifier + "-runs.json" for identifier in ROLES]
    prime_inputs.extend([planner["analysis"], planner["proposal"]])
    for name in prime_inputs:
        reader.read(name)
        record["integrationArtifacts"].append(reader.inputs[name])
    for name in (P + "/artifacts/connected-data.json", P + "/connected-data.js"):
        record["integrationArtifacts"].append(lock(name, produced[name]))
    produced[validate.RECORD] = encode(record)
    return reader, produced


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    try:
        reader, produced = outputs(args.root)
        if args.check:
            mismatches = [name for name, data in produced.items() if reader.read(name) != data]
            check(not mismatches, "Stale actual interface bindings: " + ", ".join(mismatches))
        else:
            for name, data in produced.items():
                write_owned(reader.root, name, data)
        print(json.dumps({
            "schema": "pocket-arcade-consumer-check/1",
            "mode": "check" if args.check else "write",
            "boundContributions": list(ROLES), "pendingContributions": [],
            "integrationStatus": "ready-for-local-validation", "integrationPassed": False,
            "outputs": [lock(name, data) for name, data in produced.items()],
        }, indent=2))
        return 0
    except (validate.InputError, KeyError, TypeError, ValueError, OSError) as error:
        message, _ = portable_output(str(error).encode("utf-8"), args.root)
        print("Interface consumption failed: " + message.decode("utf-8"), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
