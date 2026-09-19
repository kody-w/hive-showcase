#!/usr/bin/env python3
"""Verify local contribution bytes and recorded acceptance; never run a partner."""

import argparse
import hashlib
import json
import math
import re
import stat
import sys
from pathlib import Path, PurePosixPath


PROJECT = "projects/10-pocket-arcade"
CONTRACT = PROJECT + "/contract.json"
RECORD = PROJECT + "/contributions.json"
FIXTURE_MARKER = ".pocket-arcade-test-fixture.json"
MAX_FILE_BYTES = 16 * 1024 * 1024
PRIVATE_SEGMENTS = {".git", ".env", ".ssh", ".rapp", ".openrappter", "stores", "private", "keys", "credentials"}
PASS_VALUES = [True, "pass", "passed", "verified", "local-checks-passed"]
EXPECTED = {
    "01-game-studio": "independent-game-studio",
    "05-planner": "product-launch-company",
    "07-manufacturing": "micro-manufacturing-company",
    "09-handoff": "open-source-infrastructure-foundation",
}
BOUNDARIES = {
    key: False for key in (
        "nativeMembership", "foreignWorkspaceRegistration", "signedReceipts",
        "crossWorldAuthority", "externalEffects", "physicalManufactureVerified",
        "publicLaunch", "automaticPartnerCodeExecution",
    )
}


class InputError(ValueError):
    def __init__(self, code, message, path=None):
        super().__init__(message)
        self.code, self.path = code, path

    def record(self):
        return {"code": self.code, "message": str(self), "path": self.path}


def require(condition, code, message, path=None):
    if not condition:
        raise InputError(code, message, path)


def same(left, right):
    return type(left) is type(right) and left == right


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def object_keys(value, required, optional=(), label="object"):
    require(type(value) is dict, "malformed-object", label + " must be an object.")
    require(set(required) <= set(value), "missing-field",
            label + " is missing: " + ", ".join(sorted(set(required) - set(value))))
    require(set(value) <= set(required) | set(optional), "unexpected-field",
            label + " has unknown fields: " +
            ", ".join(sorted(set(value) - set(required) - set(optional))))


def unique_strings(value, label, minimum=0):
    require(type(value) is list and len(value) >= minimum
            and all(nonempty(item) for item in value),
            "malformed-list", label + " must be a list of nonempty strings.")
    require(len(value) == len(set(value)), "duplicate-value", label + " has duplicates.")
    return value


def repo_path(value):
    require(isinstance(value, str) and 0 < len(value) <= 400
            and re.fullmatch(r"[A-Za-z0-9._/-]+", value) is not None,
            "unsafe-path", "Expected a plain repository-relative file path.", str(value))
    require(not value.startswith("/") and all(
        part not in ("", ".", "..") for part in value.split("/")
    ), "unsafe-path", "Absolute, empty and traversal path components are forbidden.", value)
    require(not any(part.casefold() in PRIVATE_SEGMENTS for part in value.split("/")),
            "private-path", "Repository metadata, private stores and key directories are not artifacts.", value)
    return value


def sha256(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None,
            "invalid-hash", "Expected an exact lowercase SHA-256, without a prefix.")
    return value


def json_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate-json-key", "Duplicate JSON key: " + key)
        result[key] = value
    return result


def reject_constant(value):
    raise InputError("nonfinite-json", "Nonfinite JSON number: " + value)


def finite_float(value):
    result = float(value)
    require(math.isfinite(result), "nonfinite-json", "JSON number exceeds finite precision: " + value)
    return result


class Reader:
    def __init__(self, root):
        try:
            self.root = Path(root).resolve(strict=True)
        except (OSError, RuntimeError) as error:
            raise InputError("root-unavailable", str(error))
        require(self.root.is_dir(), "root-unavailable", "Repository root must be a directory.")
        self.inputs = {}

    def resolve(self, name):
        repo_path(name)
        current = self.root
        for index, part in enumerate(name.split("/")):
            current = current / part
            try:
                info = current.lstat()
            except OSError as error:
                raise InputError("missing-file", (error.strerror or "Input unavailable") + ": " + name, name)
            require(not stat.S_ISLNK(info.st_mode), "symlink-forbidden",
                    "Symlinked inputs are not accepted.", name)
            if index < len(name.split("/")) - 1:
                require(stat.S_ISDIR(info.st_mode), "not-directory",
                        "An input parent is not a directory.", name)
            else:
                require(stat.S_ISREG(info.st_mode), "not-regular-file",
                        "An input must be a regular file.", name)
                require(info.st_size <= MAX_FILE_BYTES, "oversized-file",
                        "Input exceeds the 16 MiB per-file limit.", name)
        return current

    def read(self, name, expected_hash=None, expected_bytes=None):
        path = self.resolve(name)
        try:
            with path.open("rb") as source:
                data = source.read(MAX_FILE_BYTES + 1)
        except OSError as error:
            raise InputError("unreadable-file", str(error), name)
        require(len(data) <= MAX_FILE_BYTES, "oversized-file",
                "Input exceeds the 16 MiB per-file limit.", name)
        digest = hashlib.sha256(data).hexdigest()
        lock = {"path": name, "sha256": digest, "bytes": len(data)}
        if name in self.inputs:
            require(self.inputs[name] == lock, "input-changed",
                    "Input changed during this validation run.", name)
        self.inputs[name] = lock
        if expected_hash is not None:
            require(digest == sha256(expected_hash), "hash-mismatch",
                    "SHA-256 differs from the recorded bytes.", name)
        if expected_bytes is not None:
            require(type(expected_bytes) is int and expected_bytes >= 0,
                    "invalid-byte-count", "Byte count must be a nonnegative integer.", name)
            require(len(data) == expected_bytes, "byte-count-mismatch",
                    "Byte count differs from the recorded bytes.", name)
        return data

    def json(self, name, expected_hash=None):
        data = self.read(name, expected_hash)
        try:
            return json.loads(data.decode("utf-8"), object_pairs_hook=json_pairs,
                              parse_constant=reject_constant, parse_float=finite_float)
        except InputError as error:
            error.path = name
            raise
        except (UnicodeError, ValueError, RecursionError) as error:
            raise InputError("malformed-json", str(error), name)

    def write_report(self, name, report):
        repo_path(name)
        require(name.startswith(PROJECT + "/evidence/") and name.endswith(".json"),
                "unsafe-output", "Reports may only be written under Pocket Arcade evidence/.", name)
        require(name.casefold() not in {p.casefold() for p in self.inputs},
                "input-overwrite", "An output must not overwrite any input.", name)
        current = self.root
        for part in name.split("/")[:-1]:
            current = current / part
            if not current.exists() and not current.is_symlink():
                current.mkdir()
            require(not current.is_symlink() and current.is_dir(),
                    "unsafe-output", "Output parents must be real directories.", name)
        output = self.root / name
        require(not output.is_symlink() and (not output.exists() or output.is_file()),
                "unsafe-output", "Output must be a regular file, not a symlink.", name)
        output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def validate_boundaries(value):
    object_keys(value, BOUNDARIES, label="boundaries")
    require(all(value[key] is False for key in BOUNDARIES),
            "authority-claim", "All native, external and physical-authority flags must remain false.")


def validate_contract(contract):
    object_keys(contract, (
        "schema", "id", "seedSlug", "entrypoint", "scope", "boundaries",
        "acceptancePolicy", "journey", "contributors",
    ), label="contract")
    require(contract["schema"] == "pocket-arcade-integration-contract/1"
            and contract["id"] == "10-pocket-arcade"
            and contract["seedSlug"] == "federation-prime-contractor"
            and contract["entrypoint"] == PROJECT + "/index.html",
            "contract-version", "Unsupported contract identity or version.")
    require(nonempty(contract["scope"]), "malformed-contract", "Contract scope must be nonempty text.")
    validate_boundaries(contract["boundaries"])
    policy = contract["acceptancePolicy"]
    object_keys(policy, (
        "manifestStage", "hashAlgorithm", "hashScope", "checkExecution",
        "passingProofValues", "missingPolicy", "acceptanceMeaning",
    ), label="acceptance policy")
    require(all(nonempty(policy[key]) for key in (
        "hashScope", "checkExecution", "missingPolicy", "acceptanceMeaning",
    )), "malformed-policy", "Acceptance-policy descriptions must be nonempty text.")
    require(policy["manifestStage"] == "work-produced" and policy["hashAlgorithm"] == "sha256"
            and type(policy["passingProofValues"]) is list
            and len(policy["passingProofValues"]) == len(PASS_VALUES)
            and all(same(a, b) for a, b in zip(policy["passingProofValues"], PASS_VALUES)),
            "weakened-policy", "Hash, stage and passing-proof policy cannot be weakened.")
    specs = contract["contributors"]
    require(type(specs) is list and len(specs) == len(EXPECTED),
            "contributor-set", "The contract requires exactly the four scoped contributors.")
    by_id = {}
    for spec in specs:
        object_keys(spec, (
            "id", "label", "seedSlug", "worldLabel", "directory", "manifest",
            "entrypoint", "evidence", "interfaceId", "scope", "dependsOn", "roles", "gates",
        ), label="contributor contract")
        identifier = spec["id"]
        require(isinstance(identifier, str) and identifier in EXPECTED and identifier not in by_id,
                "contributor-set", "Unknown or duplicate contributor ID.")
        directory = "projects/" + identifier
        require(spec["seedSlug"] == EXPECTED[identifier] and spec["directory"] == directory
                and spec["manifest"] == directory + "/manifest.json"
                and spec["entrypoint"] == directory + "/index.html"
                and spec["evidence"] == directory + "/evidence/result.json",
                "foreign-scope", "Contributor paths and seed identity must stay in their own scope.")
        require(all(nonempty(spec[key]) for key in ("label", "worldLabel", "scope", "interfaceId")),
                "malformed-contract", "Contributor descriptions and interface ID are required.")
        dependencies = unique_strings(spec["dependsOn"], "dependencies")
        require(all(dep in EXPECTED and dep != identifier for dep in dependencies),
                "unknown-dependency", "Dependencies must refer to other declared contributors.")
        require(type(spec["roles"]) is dict and bool(spec["roles"]),
                "missing-roles", "Each contributor requires explicit artifact roles.")
        for role, definition in spec["roles"].items():
            require(re.fullmatch(r"[a-z][a-z0-9-]+", role) is not None,
                    "invalid-role", "Artifact roles need stable kebab-case names.")
            object_keys(definition, ("extensions", "description"), label="artifact role")
            extensions = unique_strings(definition["extensions"], "role extensions", 1)
            require(all(re.fullmatch(r"\.[a-z0-9]+", item) for item in extensions)
                    and nonempty(definition["description"]),
                    "invalid-role", "Artifact roles require extensions and descriptions.")
        require(type(spec["gates"]) is list and len(spec["gates"]) >= 3,
                "missing-gates", "Each contribution requires at least three explicit acceptance gates.")
        gate_ids = []
        for gate in spec["gates"]:
            object_keys(gate, ("id", "description"), label="acceptance gate")
            require(nonempty(gate["id"]) and nonempty(gate["description"]),
                    "malformed-gate", "Gate ID and description are required.")
            gate_ids.append(gate["id"])
        unique_strings(gate_ids, "acceptance gate IDs", 3)
        by_id[identifier] = spec
    visiting, visited = set(), set()

    def visit(identifier):
        require(identifier not in visiting, "dependency-cycle", "Contribution dependencies contain a cycle.")
        if identifier in visited:
            return
        visiting.add(identifier)
        for dependency in by_id[identifier]["dependsOn"]:
            visit(dependency)
        visiting.remove(identifier)
        visited.add(identifier)

    for identifier in by_id:
        visit(identifier)
    journey = contract["journey"]
    require(type(journey) is list and len(journey) == 4,
            "malformed-journey", "The local journey requires exactly four stops.")
    for index, step in enumerate(journey):
        object_keys(step, ("step", "contributor", "action", "handoff"), label="journey stop")
        require(type(step["step"]) is int and step["step"] == index + 1
                and step["contributor"] == list(EXPECTED)[index]
                and nonempty(step["action"]) and nonempty(step["handoff"]),
                "malformed-journey", "Journey stops must follow the four declared contributors.")
    return by_id


def validate_manifest(reader, spec, fixture_mode, expected_hash=None):
    manifest = reader.json(spec["manifest"], expected_hash)
    required = ("id", "title", "seedSlug", "entrypoint", "summary", "checks",
                "artifacts", "limitations", "stage")
    require(type(manifest) is dict and all(key in manifest for key in required),
            "malformed-manifest", "Manifest is missing required project fields.", spec["manifest"])
    require(manifest["id"] == spec["id"] and manifest["seedSlug"] == spec["seedSlug"]
            and manifest["entrypoint"] == spec["entrypoint"] and manifest["stage"] == "work-produced",
            "incompatible-manifest", "Manifest identity, entrypoint or stage does not match.", spec["manifest"])
    require(nonempty(manifest["title"]) and nonempty(manifest["summary"]),
            "malformed-manifest", "Manifest title and summary are required.", spec["manifest"])
    require(type(manifest.get("fixtureOnly", False)) is bool, "malformed-manifest",
            "A fixture declaration must be a boolean.", spec["manifest"])
    require(manifest.get("fixtureOnly", False) is False or fixture_mode,
            "fixture-in-real-run", "A test-fixture manifest cannot establish a real contribution.", spec["manifest"])
    artifacts = unique_strings(manifest["artifacts"], "manifest artifacts", 1)
    unique_strings(manifest["limitations"], "manifest limitations", 1)
    for name in artifacts:
        repo_path(name)
        require(name.startswith(spec["directory"] + "/"), "foreign-artifact",
                "Manifest artifacts must stay inside their own project directory.", name)
    checks = manifest["checks"]
    require(type(checks) is list and bool(checks), "missing-checks", "Manifest needs actual check commands.")
    for command in checks:
        require(type(command) is list and len(command) >= 2
                and all(nonempty(arg) and "\x00" not in arg for arg in command),
                "malformed-command", "Each check is a nonempty CLI-argument array, not a shell string.")
    require(len({json.dumps(command) for command in checks}) == len(checks),
            "duplicate-command", "Manifest contains duplicate check commands.")
    return manifest


def resolve_pointer(document, pointer):
    require(isinstance(pointer, str) and pointer.startswith("/") and len(pointer) <= 512,
            "invalid-pointer", "Acceptance needs an explicit RFC 6901 JSON pointer.")
    value = document
    for token in pointer[1:].split("/"):
        require(re.search(r"~(?![01])", token) is None, "invalid-pointer", "Invalid JSON pointer escape.")
        token = token.replace("~1", "/").replace("~0", "~")
        if type(value) is dict:
            require(token in value, "missing-acceptance-field", "JSON pointer does not exist: " + pointer)
            value = value[token]
        elif type(value) is list:
            require(re.fullmatch(r"0|[1-9][0-9]*", token) is not None and int(token) < len(value),
                    "missing-acceptance-field", "JSON array pointer does not exist: " + pointer)
            value = value[int(token)]
        else:
            raise InputError("missing-acceptance-field", "JSON pointer traverses a scalar: " + pointer)
    return value


def gate_index(entry, spec):
    gates = entry["gates"]
    require(type(gates) is list, "malformed-gates", "Gate records must be an array.")
    result = {}
    for gate in gates:
        object_keys(gate, ("id", "state", "proof"), ("note",), label="recorded gate")
        require(nonempty(gate["id"]) and gate["id"] not in result,
                "duplicate-gate", "Gate IDs must be nonempty and unique.")
        if "note" in gate:
            require(nonempty(gate["note"]), "malformed-gate", "A gate note must be nonempty text.")
        result[gate["id"]] = gate
    require(set(result) == {gate["id"] for gate in spec["gates"]},
            "gate-set-mismatch", "Every contracted acceptance gate is required; extras are rejected.")
    return result


def validate_received(reader, spec, entry, fixture_mode, result):
    sha256(entry["manifestSha256"])
    manifest = validate_manifest(reader, spec, fixture_mode, entry["manifestSha256"])
    require(entry["sourceCommit"] is None or (
        isinstance(entry["sourceCommit"], str)
        and re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", entry["sourceCommit"]) is not None
    ), "invalid-source-commit", "sourceCommit is null or a recorded full commit hash, not an attestation.")
    files = entry["files"]
    require(type(files) is list, "malformed-locks", "Artifact locks must be an array.")
    locks = {}
    for lock in files:
        object_keys(lock, ("path", "sha256", "bytes"), label="artifact lock")
        name = repo_path(lock["path"])
        require(name not in locks, "duplicate-lock", "An artifact must be locked exactly once.", name)
        require(name.startswith(spec["directory"] + "/"), "foreign-artifact",
                "Artifact locks cannot absorb another project's files or stores.", name)
        sha256(lock["sha256"])
        require(type(lock["bytes"]) is int and lock["bytes"] > 0,
                "invalid-byte-count", "Contribution artifacts must contain actual bytes.", name)
        locks[name] = lock
    required_files = set(manifest["artifacts"]) | {spec["entrypoint"], spec["evidence"]}
    require(set(locks) == required_files, "artifact-set-mismatch",
            "Locks must exactly cover manifest artifacts, entrypoint and evidence/result.json.")
    for name in sorted(locks):
        lock = locks[name]
        reader.read(name, lock["sha256"], lock["bytes"])
    evidence = reader.json(spec["evidence"])
    require(type(evidence) is dict, "malformed-evidence", "Contribution evidence must be a JSON object.")
    require(type(evidence.get("fixtureOnly", False)) is bool, "malformed-evidence",
            "A fixture declaration must be a boolean.")
    require(evidence.get("fixtureOnly", False) is False or fixture_mode,
            "fixture-in-real-run", "Fixture evidence cannot establish a real contribution.")
    roles = entry["roles"]
    require(type(roles) is dict and set(roles) == set(spec["roles"]),
            "role-set-mismatch", "Every contracted artifact role must be bound, with no extras.")
    for role, name in roles.items():
        require(isinstance(name, str) and name in locks, "unlocked-role", "Role must point at a locked artifact.")
        require(PurePosixPath(name).suffix in spec["roles"][role]["extensions"],
                "incompatible-role", "Artifact extension does not implement role: " + role, name)
    result["files"] = [locks[name] for name in sorted(locks)]
    result["roles"] = roles
    gates = gate_index(entry, spec)
    for identifier, gate in gates.items():
        observed = {"id": identifier, "status": "rejected"}
        try:
            require(gate["state"] == "pass", "gate-not-passed",
                    "Acceptance was not recorded as pass: " + identifier)
            proof = gate["proof"]
            object_keys(proof, ("path", "sha256", "pointer", "equals"), label="gate proof")
            name = repo_path(proof["path"])
            require(name in (
                spec["evidence"], PROJECT + "/evidence/acceptance/" + spec["id"] + ".json",
            ), "foreign-proof", "Gate proofs must reference this contributor's result or its prime review.", name)
            sha256(proof["sha256"])
            require(any(same(proof["equals"], item) for item in PASS_VALUES),
                    "invalid-pass-value", "Acceptance proofs must compare to an explicit success value.")
            document = reader.json(name, proof["sha256"])
            require(type(document) is dict, "malformed-proof", "Acceptance proof must be a JSON object.", name)
            require(type(document.get("fixtureOnly", False)) is bool, "malformed-proof",
                    "A fixture declaration must be a boolean.", name)
            require(document.get("fixtureOnly", False) is False or fixture_mode,
                    "fixture-in-real-run", "Fixture proof cannot establish real acceptance.", name)
            require(same(resolve_pointer(document, proof["pointer"]), proof["equals"]),
                    "acceptance-mismatch", "Actual acceptance field is not the expected success value.", name)
            observed.update({"status": "recorded-pass", "proof": proof})
        except InputError as error:
            observed["error"] = error.record()
            result["errors"].append(error.record())
        result["gates"].append(observed)
    runs = entry["checkRuns"]
    require(type(runs) is list and len(runs) == len(manifest["checks"]),
            "check-run-set", "A recorded run is required for every manifest check.")
    seen_commands = set()
    for index, run in enumerate(runs):
        object_keys(run, ("argv", "exitCode", "output"), ("recordedAt",), label="check run")
        require(run["argv"] in manifest["checks"] and type(run["argv"]) is list,
                "unlisted-check", "A check receipt must match an exact manifest CLI-argument array.")
        command_key = json.dumps(run["argv"])
        require(command_key not in seen_commands, "duplicate-check-run", "A check is recorded more than once.")
        seen_commands.add(command_key)
        require(type(run["exitCode"]) is int and run["exitCode"] == 0,
                "check-failed", "A recorded manifest check did not exit successfully.")
        output = run["output"]
        object_keys(output, ("path", "sha256", "bytes"), label="check output")
        name = repo_path(output["path"])
        prefix = PROJECT + "/evidence/checks/" + spec["id"] + "-"
        require(name.startswith(prefix) and "/" not in name[len(prefix):] and name.endswith(".txt"),
                "foreign-check-log", "Check outputs must remain in this contributor's prime evidence scope.", name)
        sha256(output["sha256"])
        require(type(output["bytes"]) is int and output["bytes"] > 0,
                "empty-check-log", "A check receipt needs its actual nonempty output bytes.", name)
        reader.read(name, output["sha256"], output["bytes"])
        if "recordedAt" in run:
            require(nonempty(run["recordedAt"]), "malformed-check-run", "recordedAt must be text.")
    result["recordedCheckCount"] = len(runs)
    if not result["errors"]:
        result["contentChecksPassed"] = True
        result["status"] = "accepted-local"


def validate_contribution(reader, spec, entry, fixture_mode):
    result = {
        "id": spec["id"], "label": spec["label"], "interfaceId": spec["interfaceId"],
        "status": "rejected", "dependsOn": spec["dependsOn"], "sourceCommit": None,
        "contentChecksPassed": False,
        "files": [], "roles": {}, "gates": [], "recordedCheckCount": 0, "errors": [],
    }
    try:
        object_keys(entry, (
            "id", "interfaceId", "state", "sourceCommit", "manifestSha256",
            "files", "roles", "gates", "checkRuns",
        ), label="contribution")
        require(entry["interfaceId"] == spec["interfaceId"],
                "interface-mismatch", "Contribution does not implement the contracted interface version.")
        require(entry["state"] in ("awaiting", "received"), "invalid-state",
                "Contribution state is awaiting or received; acceptance is derived, not submitted.")
        result["sourceCommit"] = entry["sourceCommit"]
        if entry["state"] == "awaiting":
            gates = gate_index(entry, spec)
            require(entry["manifestSha256"] is None and entry["sourceCommit"] is None
                    and entry["files"] == [] and entry["roles"] == {} and entry["checkRuns"] == []
                    and all(g["state"] == "awaiting" and g["proof"] is None for g in gates.values()),
                    "inconsistent-pending", "An awaiting record must not contain invented hashes or acceptance.")
            result["status"] = "awaiting"
            result["gates"] = [{"id": name, "status": "awaiting"} for name in gates]
            result["errors"].append(InputError(
                "contribution-pending", "No real contribution has been bound to this interface."
            ).record())
            for name in (spec["manifest"], spec["entrypoint"], spec["evidence"]):
                try:
                    if name == spec["manifest"]:
                        validate_manifest(reader, spec, fixture_mode)
                    elif name == spec["evidence"]:
                        require(type(reader.json(name)) is dict, "malformed-evidence",
                                "Evidence must be a JSON object.", name)
                    else:
                        reader.read(name)
                except InputError as error:
                    result["errors"].append(error.record())
                    if error.code != "missing-file":
                        result["status"] = "rejected"
                    elif result["status"] != "rejected":
                        result["status"] = "missing"
            return result
        validate_received(reader, spec, entry, fixture_mode, result)
    except InputError as error:
        result["errors"].append(error.record())
    return result


def validate_repository(root, contract_path=CONTRACT, record_path=RECORD, fixture_mode=False):
    report = {
        "schema": "pocket-arcade-validation/1",
        "mode": "test-fixtures" if fixture_mode else "real-local-artifacts",
        "fixtureOnly": bool(fixture_mode),
        "integrationStatus": "integration-failed",
        "validationPassed": False,
        "integrationPassed": False,
        "boundaries": dict(BOUNDARIES),
        "contributions": [],
        "inputFiles": [],
        "errors": [],
        "limitations": [
            "Hashes establish local byte consistency, not authenticity, signatures or native authority.",
            "Acceptance fields and command outputs are recorded evidence; this validator never executes partner code.",
            "A content pass does not establish live browser usability, physical fabrication, publication or commercial acceptance.",
            "No private stores are loaded and no external effects are performed.",
        ],
    }
    reader = None
    try:
        reader = Reader(root)
        for name in (contract_path, record_path):
            repo_path(name)
            require(name.startswith(PROJECT + "/") and name.endswith(".json"),
                    "foreign-config", "Integration inputs must stay within the prime project.")
        marker_exists = (reader.root / FIXTURE_MARKER).exists() or (reader.root / FIXTURE_MARKER).is_symlink()
        if fixture_mode:
            require(marker_exists, "fixture-marker-missing", "Fixture mode requires an explicit fixture-root marker.")
            marker = reader.json(FIXTURE_MARKER)
            require(type(marker) is dict and marker.get("schema") == "pocket-arcade-test-fixture/1"
                    and marker.get("fixtureOnly") is True,
                    "malformed-fixture-marker", "Fixture root is not explicitly marked as test-only.")
        else:
            require(not marker_exists, "fixture-in-real-run",
                    "A marked test root can never be treated as real delivery evidence.")
        specs = validate_contract(reader.json(contract_path))
        record = reader.json(record_path)
        object_keys(record, ("schema", "fixtureOnly", "scope", "boundaries", "contributions"),
                    ("integrationArtifacts",), label="contribution record")
        require(record["schema"] == "pocket-arcade-contributions/1"
                and record["scope"] == "local-original-artifact-integration",
                "record-version", "Unsupported contribution record identity or version.")
        require(type(record["fixtureOnly"]) is bool and record["fixtureOnly"] is fixture_mode,
                "fixture-mode-mismatch", "Fixture declarations and the requested mode must match exactly.")
        validate_boundaries(record["boundaries"])
        integration_artifacts = record.get("integrationArtifacts", [])
        require(type(integration_artifacts) is list and len(integration_artifacts) <= 32,
                "malformed-integration-artifacts", "Prime integration artifacts must be a bounded array.")
        integration_names = set()
        for lock in integration_artifacts:
            object_keys(lock, ("path", "sha256", "bytes"), label="prime artifact lock")
            name = repo_path(lock["path"])
            require(name.startswith(PROJECT + "/") and name not in integration_names,
                    "foreign-integration-artifact", "Prime artifacts must be unique and in the prime project.", name)
            require(name not in (contract_path, record_path),
                    "self-referential-lock", "Contract and record inputs are already hashed by the validator.", name)
            integration_names.add(name)
            sha256(lock["sha256"])
            require(type(lock["bytes"]) is int and lock["bytes"] > 0,
                    "invalid-byte-count", "Prime artifacts require actual nonempty bytes.", name)
            reader.read(name, lock["sha256"], lock["bytes"])
        entries = record["contributions"]
        require(type(entries) is list and len(entries) == len(specs),
                "contribution-set", "Exactly the four contracted contributions are required.")
        by_id = {}
        for entry in entries:
            require(type(entry) is dict and isinstance(entry.get("id"), str)
                    and entry["id"] in specs and entry["id"] not in by_id,
                    "contribution-set", "Unknown, duplicate or malformed contribution ID.")
            by_id[entry["id"]] = entry
        for identifier, spec in specs.items():
            report["contributions"].append(validate_contribution(reader, spec, by_id[identifier], fixture_mode))
        results = {item["id"]: item for item in report["contributions"]}
        for _ in results:
            for item in results.values():
                if item["status"] == "accepted-local":
                    blockers = [dep for dep in item["dependsOn"] if results[dep]["status"] != "accepted-local"]
                    if blockers:
                        item["status"] = "blocked-by-dependency"
                        item["errors"].append(InputError(
                            "dependency-blocked", "Upstream local gates are not accepted: " + ", ".join(blockers)
                        ).record())
        for name, lock in list(reader.inputs.items()):
            reader.read(name, lock["sha256"], lock["bytes"])
        passed = all(item["status"] == "accepted-local" for item in results.values())
        report["validationPassed"] = passed
        report["integrationPassed"] = passed and not fixture_mode
        if passed:
            report["integrationStatus"] = "fixture-checks-passed" if fixture_mode else "local-integration-checks-passed"
        elif (any(item["status"] in ("awaiting", "missing") for item in results.values())
              and all(item["status"] in ("awaiting", "missing", "accepted-local", "blocked-by-dependency")
                      for item in results.values())):
            report["integrationStatus"] = "awaiting-real-contributions"
    except InputError as error:
        report["errors"].append(error.record())
    if reader:
        report["inputFiles"] = [reader.inputs[name] for name in sorted(reader.inputs)]
    if fixture_mode:
        for contribution in report["contributions"]:
            if contribution["status"] == "accepted-local":
                contribution["status"] = "accepted-fixture"
    report["summary"] = {
        "requiredContributions": len(EXPECTED),
        "acceptedLocalContributions": sum(c["status"] == "accepted-local" for c in report["contributions"]),
        "acceptedFixtureContributions": sum(c["status"] == "accepted-fixture" for c in report["contributions"]),
        "verifiedLocalContributions": sum(c["contentChecksPassed"] and not fixture_mode for c in report["contributions"]),
        "verifiedFixtureContributions": sum(c["contentChecksPassed"] and fixture_mode for c in report["contributions"]),
        "dependencyBlockedContributions": sum(c["status"] == "blocked-by-dependency" for c in report["contributions"]),
        "awaitingContributions": [c["id"] for c in report["contributions"] if c["status"] in ("awaiting", "missing")],
        "recordedCheckCount": sum(c["recordedCheckCount"] for c in report["contributions"]),
        "inputFileCount": len(report["inputFiles"]),
    }
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Explicit repository root; no implicit workspace discovery.")
    parser.add_argument("--contract", default=CONTRACT, help="Repository-relative prime contract JSON.")
    parser.add_argument("--record", default=RECORD, help="Repository-relative prime contribution record.")
    parser.add_argument("--output", help="Optional repository-relative report in Pocket Arcade evidence/.")
    parser.add_argument("--fixture-mode", action="store_true", help="Test-only; requires a marked fixture root.")
    args = parser.parse_args(argv)
    report = validate_repository(args.root, args.contract, args.record, args.fixture_mode)
    if args.output:
        try:
            writer = Reader(args.root)
            writer.inputs = {item["path"]: item for item in report["inputFiles"]}
            writer.write_report(args.output, report)
        except (InputError, OSError) as error:
            failure = error if isinstance(error, InputError) else InputError("output-failed", str(error))
            report["errors"].append(failure.record())
            report["validationPassed"] = report["integrationPassed"] = False
            report["integrationStatus"] = "integration-failed"
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["validationPassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
