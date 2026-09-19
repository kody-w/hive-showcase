"""Verify bounded public seed bytes without executing downloaded code."""

import argparse
import hashlib
import io
import json
import re
import stat
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

BASE = "https://kody-w.github.io/hive-hub/"
INDEX = BASE + "api/hive-hub/v1/organization-seeds.json"
LIMIT = 4 * 1024 * 1024
PINS = {
    "independent-game-studio": "1b84cbff20dc163254feab2e53890eeef766be02756868d7ceae49a78f4b8e48",
    "one-person-conglomerate": "f111199b1a276f9fc8c836aa53ef5234af6bc847db3fdd963dd2bf3bff16a663",
    "public-source-intelligence-bureau": "6087a81af9f73e9787333e56d9f30ceade1fd02c4e98b9e9368248b5f9833551",
    "applied-invention-lab": "40362b6aa8f299a8c148c2a539dfa9fe6709ba8ade66a5c8cc630fdfe97e87fd",
    "product-launch-company": "f30f4349b32cfde5d9a1715f6293b54972435ab74fc56c7f17a63136791b2e8c",
    "enterprise-transformation-firm": "2de320c891f9b8ddc815bb591548f109bb1fbc02636db7b1ff75d392752b25d9",
    "micro-manufacturing-company": "e65367fa0c6e01ba4a28161bb1f258cb94f23d86432875a66533ab1f0913c8b2",
    "turnaround-firm": "f9112fb8e126f098c0a303662f92c925f30795c1039ee2ad9309bf4232376df0",
    "open-source-infrastructure-foundation": "f3ef3de76892c8d58ff6db41cf1665bcb607a6d230b366ccb552f1aaee8755b7",
    "federation-prime-contractor": "069200f14e55eb2a91f912ee2e9af636bec4c5950f8f27c917fd45d859c91114",
}
SDK_COMMIT = "29ead23b21645f8d7682ee00414930ffa9ce0ca6"
SDK_ENTRY_SHA = "be5a5c5a07119cda5544008a1b9b9832a74c3277c6b6f466039f66613e818a0d"
PROTOCOL_COMMIT = "591e014ad39e223b00ab343ae26e5d9a867ebeee"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON key: " + key)
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError("Non-finite JSON number: " + value)


def parse_json(data):
    return json.loads(
        data.decode("utf-8"),
        object_pairs_hook=unique_object,
        parse_constant=reject_constant,
    )


def safe_path(value):
    require(isinstance(value, str) and bool(value), "Empty or invalid path")
    path = PurePosixPath(value)
    require(
        not path.is_absolute()
        and "\\" not in value
        and ":" not in value
        and "\0" not in value
        and all(part not in ("", ".", "..") for part in value.split("/"))
        and str(path) == value,
        "Unsafe path: " + value,
    )
    return value


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Redirect refused: " + newurl)


def fetch(url):
    parsed = urllib.parse.urlsplit(url)
    require(
        parsed.scheme == "https"
        and parsed.netloc == "kody-w.github.io"
        and parsed.path.startswith("/hive-hub/api/hive-hub/v1/")
        and not parsed.query
        and not parsed.fragment,
        "Unapproved public object URL",
    )
    request = urllib.request.Request(url, headers={"User-Agent": "Hive-Local-Byte-Review/1"})
    with urllib.request.build_opener(NoRedirects).open(request, timeout=30) as response:
        data = response.read(LIMIT + 1)
    require(len(data) <= LIMIT, "Public object exceeded size bound")
    return data


def write_exact(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        require(path.is_file() and not path.is_symlink(), "Unsafe existing destination")
        require(path.read_bytes() == data, "Refusing to replace different existing bytes")
    else:
        with path.open("xb") as handle:
            handle.write(data)


def object_bytes(reference, cache, suffix=".json"):
    ref = reference["ref"]
    require(re.fullmatch(r"sha256:[0-9a-f]{64}", ref) is not None, "Invalid full SHA-256")
    digest = ref.split(":", 1)[1]
    relative = safe_path(reference["path"])
    require(reference["url"] == BASE + relative, "Object URL/path mismatch")
    if "sha256" in reference:
        require(reference["sha256"] == digest, "Conflicting object digest")
    path = cache / "objects" / (digest + suffix)
    data = path.read_bytes() if path.exists() else fetch(reference["url"])
    require(sha(data) == digest, "Downloaded-byte digest mismatch: " + relative)
    if "bytes" in reference:
        require(len(data) == reference["bytes"], "Object byte count mismatch")
    write_exact(path, data)
    return data


def verify_archive(data, declared):
    expected = {}
    for item in declared:
        name = safe_path(item["path"])
        require(name not in expected, "Duplicate declared file: " + name)
        encoded = item["content"].encode("utf-8")
        require(len(encoded) == item["bytes"], "Declared inline byte mismatch: " + name)
        require(sha(encoded) == item["sha256"], "Declared inline digest mismatch: " + name)
        expected[name] = item
    require(0 < len(expected) <= 200, "Unbounded package inventory")
    files = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        require(len(archive.infolist()) == len(expected), "Archive inventory count mismatch")
        require(sum(info.file_size for info in archive.infolist()) <= LIMIT, "Archive too large")
        for info in archive.infolist():
            name = safe_path(info.filename)
            require(name not in files, "Duplicate archive filename: " + name)
            require(name in expected, "Unexpected archive file: " + name)
            kind = stat.S_IFMT(info.external_attr >> 16)
            require(kind in (0, stat.S_IFREG) and not info.is_dir(), "Non-regular archive entry")
            require(not info.flag_bits & 1, "Encrypted archive entry")
            require(info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "Unsupported ZIP method")
            require(info.file_size == expected[name]["bytes"], "ZIP entry size mismatch")
            content = archive.read(info)
            require(sha(content) == expected[name]["sha256"], "ZIP file digest mismatch")
            require(content == expected[name]["content"].encode("utf-8"), "ZIP/descriptor mismatch")
            require("\0" not in content.decode("utf-8"), "NUL in text package")
            if name.endswith(".json"):
                parse_json(content)
            files[name] = content
    require(set(files) == set(expected), "Archive file set mismatch")
    seed = parse_json(files["seed.json"])
    inventory = {}
    for item in seed["inventory"]:
        name = safe_path(item["path"])
        require(name not in inventory, "Duplicate seed inventory item")
        inventory[name] = item
    require(set(inventory) == set(files) - {"seed.json"}, "Embedded inventory file set mismatch")
    for name, item in inventory.items():
        require(item["bytes"] == len(files[name]) and item["sha256"] == sha(files[name]),
                "Embedded inventory mismatch: " + name)
    return files


def verify_seed(entry, cache):
    slug = entry["slug"]
    require(entry["seed"]["ref"] == "sha256:" + PINS[slug], "Discovered seed changed since selection")
    descriptor = parse_json(object_bytes(entry["seed"], cache))
    card = parse_json(object_bytes(entry["card"], cache))
    dependencies = descriptor["dependencies"]
    require(dependencies["sdk"]["commit"] == SDK_COMMIT, "SDK commit mismatch")
    require(dependencies["sdk"]["entrypoint_sha256"] == SDK_ENTRY_SHA, "SDK entrypoint pin mismatch")
    require(dependencies["protocol"]["commit"] == PROTOCOL_COMMIT, "RAPP/1 commit mismatch")
    require(card["seed"] == entry["seed"], "Card seed binding mismatch")
    linked = {}
    for field in ("record", "protocol", "learningBundle", "conformance", "adapter",
                  "release", "skillDeclaration", "cameraAiCard"):
        linked[field] = parse_json(object_bytes(card[field], cache))
    record = linked["record"]
    dial_id = card["dialId"]
    require(re.fullmatch(r"dial:sha256:[0-9a-f]{64}", dial_id) is not None, "Invalid complete Dial ID")
    require(record["dialId"] == dial_id == linked["cameraAiCard"]["locator"],
            "Full Dial ID differs between card, record, and camera locator")
    require(record["locator"]["seed"] == entry["seed"], "Dial record seed binding mismatch")
    require(record["locator"]["archive"] == descriptor["archive"] == entry["archive"],
            "Archive package binding mismatch")
    for field in ("protocol", "learningBundle", "conformance", "adapter"):
        require(record[field] == card[field], "Card/record contract mismatch: " + field)
    protocol_ref = card["protocol"]["ref"]
    require(record["protocolFingerprint"] == protocol_ref, "Record protocol fingerprint mismatch")
    for field in ("learningBundle", "conformance", "adapter"):
        require(linked[field]["protocolFingerprint"] == protocol_ref,
                "Contract protocol fingerprint mismatch: " + field)
        require(linked[field]["protocol"] == card["protocol"], "Contract protocol binding mismatch")
    require(linked["protocol"]["protocolName"] == "rapp-work/1", "Wrong protocol")
    require(linked["protocol"]["workspaceProfile"] == "rapp-work-sdk/1", "Wrong workspace profile")
    archive = object_bytes(entry["archive"], cache, ".zip")
    files = verify_archive(archive, descriptor["files"])
    require(len(files) == entry["counts"]["packageFiles"], "Catalog package count mismatch")
    initialize = parse_json(files["initialize.json"])
    require(initialize["dependencies"] == dependencies, "Initialization dependency mismatch")
    require(initialize["external_effects_authorized"] is False, "Unexpected authority in seed")
    for name, data in files.items():
        path = cache / "seeds" / slug / name
        write_exact(path, data)
        path.chmod(0o444)
    return {
        "slug": slug,
        "name": entry["name"],
        "stage": "seed-verified",
        "seedRef": entry["seed"]["ref"],
        "cardRef": entry["card"]["ref"],
        "archiveRef": entry["archive"]["ref"],
        "archiveBytes": len(archive),
        "dialId": dial_id,
        "protocolRef": protocol_ref,
        "case": descriptor["case"],
        "verifiedFiles": [
            {"path": name, "bytes": len(data), "sha256": sha(data)}
            for name, data in sorted(files.items())
        ],
        "checks": [
            "Exact downloaded object SHA-256 values",
            "Full Dial ID equality across hash-verified card, record, and camera locator",
            "Protocol, learning, conformance, SDK declaration, and package bindings",
            "ZIP byte count and SHA-256",
            "Safe regular-file ZIP entries with unique names and exact inventory",
            "Every extracted file byte count, SHA-256, and descriptor content",
            "Embedded inventory and initialization dependencies",
        ],
        "nativeInitialized": False,
        "downloadedCodeExecuted": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    index_data = fetch(INDEX)
    index = parse_json(index_data)
    write_exact(args.cache / ("index-" + sha(index_data) + ".json"), index_data)
    entries = {}
    for entry in index["seeds"]:
        require(entry["slug"] not in entries, "Duplicate catalog slug")
        entries[entry["slug"]] = entry
    require(set(PINS).issubset(entries), "A selected seed is missing from the catalog")
    results = []
    for slug in PINS:
        result = verify_seed(entries[slug], args.cache)
        results.append(result)
        print("VERIFIED", slug, len(result["verifiedFiles"]), "files", flush=True)
    report = {
        "schema": "local-hive-seed-byte-review/1",
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "indexUrl": INDEX,
        "indexSha256": sha(index_data),
        "seeds": results,
        "limitations": [
            "Unsigned integrity review, not publisher authentication or a native SDK conformance run.",
            "No downloaded code executed, native setup applied, membership joined, or publication performed.",
            "Native setup still requires an exact locally trusted SDK, owner inputs, and exact-plan approvals.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("Verified", len(results), "bounded public seed packages.")


if __name__ == "__main__":
    main()
