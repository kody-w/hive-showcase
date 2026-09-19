#!/usr/bin/env python3
"""Execute exactly the offline manifest checks and persist bounded actual results."""

import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parents[1]


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    manifest = json.loads((PROJECT / "manifest.json").read_text())
    research = json.loads((PROJECT / "research/evidence.json").read_text())
    result_path = PROJECT / "evidence/result.json"
    output_dir = PROJECT / "evidence/test-output"
    output_dir.mkdir(parents=True, exist_ok=True)
    result = {
        "schema": "executed-local-research-checks/1",
        "projectId": "03-intelligence",
        "stage": "work-produced",
        "status": "running",
        "startedAt": now(),
        "checks": [],
        "researchVerdict": research["verdict"]["id"],
        "facts": {
            "inspectedSources": len(research["sources"]),
            "provenanceFamilies": len(research["families"]),
            "claims": len(research["claims"]),
            "contradictions": len(research["contradictions"]),
            "operatingGates": len(research["gateAssessments"]),
            "qualifyingBusinessCases": research["verdict"]["qualifiedBusinessCases"],
            "syntheticSourceRecords": 18,
            "rawHttpResponseHashes": 8,
        },
        "verificationScope": "Offline byte/hash, citation, ID/link, synthetic separation, source coverage, rendered HTML, DOM-fixture controller and all verdict/reversal-condition logic checks. Not real-browser visual validation or independent verification of the underlying study/financial data.",
        "notPerformed": [
            "Real-browser preview or visual/a11y certification",
            "Financial, customer or accepted-AI-work audit",
            "Market test, founder outreach or contact",
            "Downloaded seed code execution or native Hive initialization",
            "Server, deployment, purchase, publication or external mutation",
        ],
        "limitations": manifest["limitations"],
    }
    result_path.write_text(json.dumps(result, indent=2) + "\n")
    for number, argv in enumerate(manifest["checks"], 1):
        started = time.monotonic()
        try:
            completed = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=120)
            exit_code = completed.returncode
            output = completed.stdout + completed.stderr
        except subprocess.TimeoutExpired as error:
            exit_code = 124
            output = "Timed out after 120 seconds: " + str(error)
        duration = round(time.monotonic() - started, 3)
        encoded = output.encode()
        retained = encoded if len(encoded) <= 16000 else encoded[:4000] + b"\n[bounded middle omitted]\n" + encoded[-12000:]
        log_path = output_dir / f"check-{number:02d}.txt"
        log_path.write_bytes(retained)
        record = {
            "argv": argv,
            "cwd": "repository-root",
            "exitCode": exit_code,
            "durationSeconds": duration,
            "completedAt": now(),
            "outputFile": log_path.relative_to(PROJECT).as_posix(),
            "completeOutputSha256": hashlib.sha256(encoded).hexdigest(),
            "retainedOutputSha256": hashlib.sha256(retained).hexdigest(),
            "outputTruncated": len(encoded) > 16000,
        }
        result["checks"].append(record)
        print(("PASS" if exit_code == 0 else "FAIL") + ": " + " ".join(argv))
        if exit_code != 0:
            print(output[-6000:])
    result["status"] = "passed" if all(item["exitCode"] == 0 for item in result["checks"]) else "failed"
    result["completedAt"] = now()
    result_path.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Saved actual validation receipt: {result_path.relative_to(ROOT)} ({result['status']})")
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
