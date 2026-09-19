"""Run explicit local project checks and persist their actual results."""

import argparse
import hashlib
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from verify_seeds import parse_json, safe_path

ROOT = Path(__file__).resolve().parents[1]


def artifact_file(root, relative):
    safe_path(relative)
    candidate = root / relative
    if candidate.is_symlink():
        raise ValueError("Artifact must not be a symlink: " + relative)
    resolved = candidate.resolve()
    if root.resolve() not in resolved.parents or ".git" in Path(relative).parts:
        raise ValueError("Artifact escapes the public repository: " + relative)
    if not resolved.is_file():
        raise ValueError("Artifact file is missing: " + relative)
    return resolved


def artifact_files(root, relative):
    safe_path(relative)
    candidate = root / relative
    if not candidate.is_dir():
        artifact_file(root, relative)
        return [relative]
    resolved = candidate.resolve()
    if candidate.is_symlink() or root.resolve() not in resolved.parents or ".git" in Path(relative).parts:
        raise ValueError("Artifact directory must stay inside the public repository")
    files = []
    for child in sorted(candidate.rglob("*")):
        if child.is_symlink():
            raise ValueError("Artifact directory contains a symlink")
        if child.is_dir():
            continue
        name = child.relative_to(root).as_posix()
        artifact_file(root, name)
        files.append(name)
        if len(files) > 1000:
            raise ValueError("Artifact directory exceeds the explicit 1000-file bound")
    if not files:
        raise ValueError("Artifact directory is empty: " + relative)
    return files


def load_manifest(root, spec):
    project_id = spec["id"]
    manifest_path = artifact_file(root, "projects/" + project_id + "/manifest.json")
    manifest = parse_json(manifest_path.read_bytes())
    expected = {
        "id": project_id,
        "seedSlug": spec["seedSlug"],
        "entrypoint": "projects/" + project_id + "/index.html",
        "stage": "work-produced",
    }
    for field, value in expected.items():
        if manifest.get(field) != value:
            raise ValueError("Manifest %s must be %r" % (field, value))
    for field in ("title", "summary"):
        if not isinstance(manifest.get(field), str) or not manifest[field].strip():
            raise ValueError("Missing manifest " + field)
    for field in ("limitations", "artifacts"):
        if not isinstance(manifest.get(field), list) or not all(
            isinstance(item, str) for item in manifest[field]
        ):
            raise ValueError("Manifest %s must be an array of strings" % field)
    if not manifest["artifacts"]:
        raise ValueError("A project must declare actual artifacts")
    artifact_file(root, manifest["entrypoint"])
    artifact_file(root, "projects/" + project_id + "/evidence/result.json")
    for artifact in manifest["artifacts"]:
        artifact_files(root, artifact)
    checks = manifest.get("checks")
    if not isinstance(checks, list) or not checks:
        raise ValueError("A project must declare actual check commands")
    for command in checks:
        if not isinstance(command, list) or not command or not all(
            isinstance(arg, str) and arg and "\0" not in arg for arg in command
        ):
            raise ValueError("Checks must be nonempty command argument arrays")
        if command[0] not in ("node", "python3"):
            raise ValueError("Only explicit Node/Python project checks are supported")
    return manifest


def run_command(root, argv):
    start = time.monotonic()
    started_at = datetime.now(timezone.utc).isoformat()
    try:
        result = subprocess.run(
            argv, cwd=root, capture_output=True, text=True, timeout=300, check=False
        )
        return {
            "argv": argv,
            "startedAt": started_at,
            "durationSeconds": round(time.monotonic() - start, 4),
            "exitCode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except subprocess.TimeoutExpired as error:
        def text(value):
            return value.decode("utf-8", errors="replace") if isinstance(value, bytes) else value or ""
        return {
            "argv": argv,
            "startedAt": started_at,
            "durationSeconds": round(time.monotonic() - start, 4),
            "exitCode": None,
            "error": "Check exceeded the explicit 300-second bound",
            "stdout": text(error.stdout),
            "stderr": text(error.stderr),
        }
    except OSError as error:
        return {
            "argv": argv,
            "startedAt": started_at,
            "durationSeconds": round(time.monotonic() - start, 4),
            "exitCode": None,
            "error": str(error),
            "stdout": "",
            "stderr": "",
        }


def inspect_project(root, spec):
    result = {"id": spec["id"], "status": "failed", "commands": [], "artifacts": []}
    try:
        manifest = load_manifest(root, spec)
        for command in manifest["checks"]:
            command_result = run_command(root, command)
            result["commands"].append(command_result)
            if command_result["exitCode"] != 0:
                result["error"] = "A declared project check failed"
        paths = set([
            manifest["entrypoint"],
            "projects/" + spec["id"] + "/manifest.json",
            "projects/" + spec["id"] + "/evidence/result.json",
        ])
        for artifact in manifest["artifacts"]:
            paths.update(artifact_files(root, artifact))
        for relative in sorted(paths):
            data = artifact_file(root, relative).read_bytes()
            result["artifacts"].append({
                "path": relative, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()
            })
        if "error" not in result:
            result["status"] = "passed"
    except (ValueError, KeyError, TypeError, OSError) as error:
        result["error"] = str(error)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", action="append", default=[], help="Check only this project id.")
    parser.add_argument("--output", default="evidence/check-results.json")
    args = parser.parse_args()
    catalog = parse_json((ROOT / "assets/catalog.json").read_bytes())
    known = {spec["id"] for spec in catalog}
    unknown = set(args.project) - known
    if unknown:
        parser.error("Unknown project ids: " + ", ".join(sorted(unknown)))
    selected = [spec for spec in catalog if not args.project or spec["id"] in args.project]
    report = {
        "schema": "local-hive-showcase-checks/1",
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "allProjects": not args.project,
        "projects": [],
        "nativeActivation": False,
        "humanReview": "pending",
    }
    if not args.project:
        report["toolkit"] = run_command(ROOT, [
            "python3", "-m", "unittest", "discover", "-s", "tools", "-p", "test_*.py"
        ])
        print("TOOLKIT", "PASSED" if report["toolkit"]["exitCode"] == 0 else "FAILED", flush=True)
    for spec in selected:
        result = inspect_project(ROOT, spec)
        report["projects"].append(result)
        print(result["status"].upper(), spec["id"], flush=True)
        if result["status"] != "passed":
            print(result.get("error", "Unknown failure"), file=sys.stderr)
            for command in result["commands"]:
                if command["exitCode"] != 0:
                    print((command["stdout"] + command["stderr"])[-8000:], file=sys.stderr)
    projects_passed = all(
        result["status"] == "passed" for result in report["projects"]
    )
    toolkit_passed = "toolkit" not in report or report["toolkit"]["exitCode"] == 0
    report["status"] = "passed" if projects_passed and toolkit_passed else "failed"
    safe_path(args.output)
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
