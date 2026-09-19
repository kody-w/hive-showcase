"""Audit public bytes and reproduce historical behavior without Git history."""

import difflib
from html.parser import HTMLParser
import importlib.util
import json
import hashlib
import re
import sys
from urllib.parse import unquote, urlsplit

from public_projection import (
    PROJECT, ROOT, digest, privacy_findings, scoped_path, verify_integrity,
)
from verify_inputs import check_inputs

sys.path.insert(0, str(PROJECT))
import receipt_ledger


def require(condition, label):
    if not condition:
        raise ValueError(label)


def load(relative):
    return json.loads((PROJECT / relative).read_text(encoding="utf-8"))


def midpoint_module():
    path = PROJECT / "evidence/midpoint-receipt-ledger.py"
    history = load("evidence/historical-continuation.json")
    require(digest(path) == history["repair"]["before_sha256"], "Midpoint source hash differs")
    spec = importlib.util.spec_from_file_location("handoff_original_midpoint", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def verify_capture(capture, implementation):
    phase = capture["phase"]
    before = phase == "before"
    require(capture["schema"] == "handoff-public-capture/1", "Unknown capture schema")
    require(capture["record_kind"] == "redacted-derived-historical-record", "Unlabeled historical derivative")
    require(capture["execution_root"] == ".", "Capture root is not portable")
    require(capture["contract_sha256"] == digest(PROJECT / "ACCEPTANCE.json"), "Acceptance bytes changed")
    expected_source = PROJECT / ("evidence/midpoint-receipt-ledger.py" if before else "receipt_ledger.py")
    require(capture["source_sha256"] == digest(expected_source), "Captured source differs")
    require([run["name"] for run in capture["runs"]] == ["acceptance", "tests"], "Missing historical runner")
    for run in capture["runs"]:
        require(run["exit_code"] == (1 if before else 0), "Historical exit outcome changed")
        for channel in ("stdout", "stderr"):
            log = run[channel]
            require(digest(scoped_path(log["path"])) == log["sha256"], "Published log hash differs")
            require(log["transform"] in ("unchanged-bytes", "traceback-path-rebased-to-repository-relative"),
                    "Unknown log transformation")
            require((log["sha256"] == log["original_sha256"]) == (log["transform"] == "unchanged-bytes"),
                    "Historical versus published-byte claim differs")
    acceptance = json.loads(scoped_path(capture["runs"][0]["stdout"]["path"]).read_text())
    require((acceptance["passed"], acceptance["failed"]) == ((2, 1) if before else (3, 0)),
            "Historical acceptance counts changed")
    log = scoped_path(capture["runs"][1]["stderr"]["path"]).read_text()
    require(f"Ran {16 if before else 19} tests" in log, "Historical regression count changed")
    require(("FAILED (failures=1)" if before else "\nOK\n") in log, "Historical regression verdict changed")
    targets = {case["id"]: case for case in load("ACCEPTANCE.json")["cases"]}
    require({case["id"] for case in capture["replays"]} == set(targets), "Replay cases changed")
    require({case["id"] for case in acceptance["cases"]} == set(targets), "Acceptance cases changed")
    for replay in capture["replays"]:
        target = targets[replay["id"]]
        fixture = PROJECT / target["fixture"]
        text = fixture.read_text()
        receipts = implementation.parse_jsonl(text)
        actual = implementation.summarize(receipts)
        require(replay["input_sha256"] == digest(fixture), "Fixture bytes changed")
        require(replay["records"] == [json.loads(line) for line in text.splitlines() if line.strip()], "Input records changed")
        require(replay["expected"] == target["expected"], "Historical target changed")
        require(replay["actual"] == actual, "Historical result differs from included original source")
        require(replay["frames"] == [
            implementation.summarize(receipts[:size]) for size in range(len(receipts) + 1)
        ], "A historical replay frame differs from included original source")
        require(replay["maintenance"] == implementation.maintenance_report(receipts), "Maintenance accounting differs")
        observed = next(case for case in acceptance["cases"] if case["id"] == replay["id"])
        require(observed["actual"] == actual and observed["expected"] == target["expected"], "Process output differs")
        require(observed["passed"] == (actual == target["expected"]), "Incorrect historical pass flag")
        require((actual == target["expected"]) == (not before or replay["id"] != "duplicate"), "Wrong defect boundary")
    observations = json.dumps(capture["replays"], sort_keys=True, separators=(",", ":")).encode()
    require(hashlib.sha256(observations).hexdigest() == capture["observations_sha256"], "Historical observation digest differs")


class LocalLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if "id" in values:
            require(values["id"] not in self.ids, "Duplicate HTML ID")
            self.ids.add(values["id"])
        self.links.extend(values[key] for key in ("href", "src") if key in values)


def check():
    require(not check_inputs()["changed_or_missing"], "Preserved historical inputs changed")
    integrity = load("evidence/public-integrity.json")
    require(not privacy_findings(json.dumps(integrity)), "Private metadata in integrity manifest")
    count = verify_integrity(integrity)
    history = load("evidence/historical-continuation.json")
    require(history["record_kind"] == "derived-historical-summary", "History mislabeled")
    require(history["continuation_count"] == 1 and history["model"] == "gpt-6-astra", "Historical continuation claim changed")
    require(digest(PROJECT / "receipt_ledger.py") == history["repair"]["after_sha256"], "Original repair changed")
    baseline = midpoint_module()
    for phase in ("before", "continuation", "after"):
        capture = load(f"evidence/{phase}.json")
        require(capture["original_record_sha256"] == history["original_record_hashes"][f"evidence/{phase}.json"],
                "Historical origin hash differs")
        verify_capture(capture, baseline if phase == "before" else receipt_ledger)
    expected_diff = "".join(difflib.unified_diff(
        (PROJECT / "evidence/midpoint-receipt-ledger.py").read_text().splitlines(keepends=True),
        (PROJECT / "receipt_ledger.py").read_text().splitlines(keepends=True),
        fromfile="evidence/midpoint-receipt-ledger.py", tofile="receipt_ledger.py", n=0,
    ))
    require((PROJECT / "evidence/repair.diff").read_text() == expected_diff, "Published one-line repair diff differs")
    recovered = load("evidence/recovery.json")
    require(recovered["prior_conversation"]["evidence_level"] == "historical-executor-self-report", "Isolation overclaimed")
    require(recovered["context_recovered"] and recovered["context_missing"], "Missing recovery boundaries")
    early = load("evidence/continuation-baseline.json")
    require(early["record_kind"] == "redacted-derived-historical-record", "Executor baseline mislabeled")
    require([run["exit_code"] for run in early["runs"]] == [0, 1, 1], "Executor's original failure hidden")
    require(early["runs"][1]["stdout"] == (PROJECT / "evidence/before-acceptance.stdout.txt").read_text(),
            "Original pre-edit acceptance differs")
    require("Ran 16 tests" in early["runs"][2]["stderr"] and "FAILED (failures=1)" in early["runs"][2]["stderr"],
            "Original pre-edit regression failure differs")
    export = load("artifacts/pocket-arcade-maintenance.json")
    duplicate = next(case for case in load("evidence/after.json")["replays"] if case["id"] == "duplicate")
    require(export == dict(duplicate["maintenance"], input_sha256=duplicate["input_sha256"]), "Consumer output changed")
    manifest = load("manifest.json")
    require(manifest["id"] == "09-handoff" and manifest["stage"] == "work-produced", "Manifest identity differs")
    for artifact in manifest["artifacts"]:
        require(scoped_path(artifact).is_file(), "Missing public artifact")
    result = load("evidence/result.json")
    check_record = scoped_path(result["publication_checks"]["path"])
    packages = json.loads(check_record.read_text())
    require(packages["record_kind"] == "new-public-projection-checks", "Fresh checks mislabeled as historical")
    require([run["argv"] for run in packages["runs"]] == manifest["checks"][:-1], "Fresh command coverage differs")
    require(all(run["exit_code"] == 0 for run in packages["runs"]), "A fresh publication check failed")
    for entry in packages["tested_files"]:
        require(digest(scoped_path(entry["path"])) == entry["sha256"], "Source changed after fresh checks")
    require(result["schema"] == "handoff-public-result/1", "Unknown public result schema")
    require(result["historical_validation"] == history["historical_outcomes"], "Historical numbers changed")
    require(result["publication_checks"]["sha256"] == digest(check_record),
            "Fresh check record hash differs")
    page = LocalLinks()
    page.feed((PROJECT / "index.html").read_text())
    for link in page.links:
        target = urlsplit(link)
        require(not target.scheme and not target.netloc, "Page depends on an external resource")
        if target.path:
            path = (PROJECT / unquote(target.path)).resolve()
            require(path.is_relative_to(ROOT) and path.is_file(), "Missing local page resource")
        elif target.fragment:
            require(target.fragment in page.ids, "Missing local anchor")
    return {
        "status": "pass",
        "current_public_files_bound": count,
        "preserved_original_inputs": 6,
        "historical_duplicate_behavior": "4 events before; 3 after; one replay",
        "historical_frames_reproduced_from_included_source": True,
        "fresh_publication_commands": len(packages["runs"]),
        "historical_invocation_reverification": "Not possible publicly; private invocation metadata is withheld.",
        "qualification": "Public byte/behavior consistency, not new continuation evidence or an identity attestation.",
    }


if __name__ == "__main__":
    try:
        print(json.dumps(check(), indent=2))
    except (ValueError, KeyError, OSError) as exc:
        print(f"public evidence check failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
