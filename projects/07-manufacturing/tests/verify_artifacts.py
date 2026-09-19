"""Independent, standard-library validation of the exported review artifacts."""

import argparse
from collections import defaultdict
import csv
import hashlib
from html.parser import HTMLParser
import io
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile


PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parents[1]
CONFIGURATIONS = ("stackline", "compact", "pocket-arcade")


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def near(actual, expected, message, tolerance=1e-5):
    require(math.isfinite(actual) and abs(actual - expected) <= tolerance,
            "{}: {} != {}".format(message, actual, expected))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def subtract(a, b):
    return tuple(x - y for x, y in zip(a, b))


def dot(a, b):
    return math.fsum(x * y for x, y in zip(a, b))


def parse_stl(text):
    lines = [line.strip() for line in text.strip().splitlines()]
    require(lines[0].startswith("solid ") and lines[-1].startswith("endsolid "), "STL solid delimiters")
    require(lines[0][6:] == lines[-1][9:], "STL solid names match")
    require((len(lines) - 2) % 7 == 0, "STL facet records are complete")
    normals, triangles = [], []
    for i in range(1, len(lines) - 1, 7):
        normal = lines[i].split()
        require(len(normal) == 5 and normal[:2] == ["facet", "normal"], "STL facet normal")
        require(lines[i + 1] == "outer loop", "STL outer loop")
        vertices = []
        for line in lines[i + 2:i + 5]:
            words = line.split()
            require(len(words) == 4 and words[0] == "vertex", "STL vertex record")
            vertices.append(tuple(float(n) for n in words[1:]))
        require(lines[i + 5] == "endloop" and lines[i + 6] == "endfacet", "STL closing records")
        normals.append(tuple(float(n) for n in normal[2:]))
        triangles.append(tuple(vertices))
    return triangles, normals


def reachable(start, adjacency):
    visited, pending = set(), [start]
    while pending:
        node = pending.pop()
        if node in visited:
            continue
        visited.add(node)
        pending.extend(adjacency[node] - visited)
    return visited


def analyze_mesh(triangles, normals=None):
    require(bool(triangles), "Mesh is nonempty")
    vertices, unique_faces = set(), set()
    edges = defaultdict(list)
    links = defaultdict(lambda: defaultdict(set))
    volume_terms = []
    for index, triangle in enumerate(triangles):
        require(len(triangle) == 3, "Triangle arity")
        require(all(math.isfinite(c) for v in triangle for c in v), "Finite vertices")
        a, b, c = triangle
        n = cross(subtract(b, a), subtract(c, a))
        norm = math.sqrt(dot(n, n))
        require(norm > 1e-9, "No degenerate triangle")
        if normals is not None:
            require(all(math.isfinite(v) for v in normals[index]), "Finite normals")
            require(all(abs(v / norm - u) < 1e-7 for v, u in zip(n, normals[index])), "Facet normals match winding")
        canonical = tuple(sorted(triangle))
        require(canonical not in unique_faces, "No duplicate facets")
        unique_faces.add(canonical)
        vertices.update(triangle)
        for i, v in enumerate(triangle):
            other = triangle[(i + 1) % 3]
            edge = tuple(sorted((v, other)))
            edges[edge].append((index, 1 if v < other else -1))
            b, c = triangle[(i + 1) % 3], triangle[(i + 2) % 3]
            links[v][b].add(c)
            links[v][c].add(b)
        a, b, c = triangle
        volume_terms.append(dot(a, cross(b, c)) / 6)
    adjacency = defaultdict(set)
    for uses in edges.values():
        require(len(uses) == 2, "Every edge has exactly two incident triangles (watertight)")
        require(sum(direction for _, direction in uses) == 0, "Opposite directed edge use")
        adjacency[uses[0][0]].add(uses[1][0])
        adjacency[uses[1][0]].add(uses[0][0])
    require(len(reachable(0, adjacency)) == len(triangles), "Exactly one connected shell")
    for link in links.values():
        require(all(len(neighbors) == 2 for neighbors in link.values()), "Vertex link has degree two")
        require(len(reachable(next(iter(link)), link)) == len(link), "Vertex link is one cycle (manifold vertex)")
    volume = math.fsum(volume_terms)
    require(volume > 0, "Positive outward signed volume")
    minimum = [min(v[a] for v in vertices) for a in range(3)]
    maximum = [max(v[a] for v in vertices) for a in range(3)]
    return {
        "triangles": len(triangles), "vertices": len(vertices), "edges": len(edges),
        "connectedShells": 1, "unpairedEdges": 0, "orientationErrors": 0,
        "nonmanifoldVertices": 0, "degenerateTriangles": 0, "duplicateFacets": 0,
        "watertight": True, "closedTwoManifold": True,
        "eulerCharacteristic": len(vertices) - len(edges) + len(triangles),
        "signedVolumeMM3": round(volume, 9),
        "boundsMM": {"min": minimum, "max": maximum, "size": [b - a for a, b in zip(minimum, maximum)]},
    }


def verify_rejection_controls(triangles):
    def rejects(bad):
        try:
            analyze_mesh(bad)
        except AssertionError:
            return
        raise AssertionError("Adversarial mesh was not rejected")
    rejects(triangles[:-1])
    rejects([tuple(reversed(triangles[0]))] + triangles[1:])
    rejects(triangles + [triangles[0]])
    rejects([((0.0, 0.0, 0.0),) * 3] + triangles)
    translated = [tuple(tuple(v + (400 if a == 0 else 0) for a, v in enumerate(p)) for p in t) for t in triangles]
    rejects(triangles + translated)
    return ["open boundary", "reversed triangle", "duplicate facet", "degenerate facet", "disconnected shells"]


def verify_drawing(directory, p):
    svg = ET.fromstring((directory / "drawing.svg").read_text())
    require(svg.attrib["width"].endswith("mm") and svg.attrib["height"].endswith("mm"), "SVG physical mm units")
    view = list(map(float, svg.attrib["viewBox"].split()))
    require(view[:2] == [0, 0], "SVG origin")
    near(float(svg.attrib["width"][:-2]), view[2], "SVG horizontal mm scale")
    near(float(svg.attrib["height"][:-2]), view[3], "SVG vertical mm scale")
    text = " ".join(svg.itertext())
    require("50 mm scale bar" in text, "SVG has scale bar label")
    require("not a cut template" in text.lower(), "SVG is a drawing, not a cut template")
    namespace = {"s": "http://www.w3.org/2000/svg"}
    rects = []
    for rect in svg.findall("s:rect", namespace):
        if rect.attrib.get("width") == "100%":
            continue
        x, y = float(rect.attrib.get("x", 0)), float(rect.attrib.get("y", 0))
        w, h = float(rect.attrib["width"]), float(rect.attrib["height"])
        require(w > 0 and h > 0, "SVG closed nonnegative rectangular geometry")
        require(x >= 0 and y >= 0 and x + w <= view[2] and y + h <= view[3], "Drawing geometry stays on sheet")
        rects.append((w, h))
    require((p["width"], p["depth"]) in rects, "Top view outer dimensions")
    require((p["width"], p["height"]) in rects, "Front view outer dimensions")
    bar = next(item for item in svg.findall("s:path", namespace) if item.attrib.get("class") == "bar")
    require("h 50 " in bar.attrib["d"], "SVG scale bar length is 50 drawing units = 50 mm")
    ET.fromstring((directory / "preview.svg").read_text())
    return {"xml": "valid", "units": "mm", "drawingUnitsPerMM": 1, "scaleBarMM": 50, "cutTemplate": False}


def verify_zip(directory):
    raw = (directory / "review-bundle.zip").read_bytes()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        require(len(set(names)) == len(names), "Unique archive entries")
        require(archive.testzip() is None, "All archive CRC-32 values match")
        for name in names:
            require(not name.startswith("/") and ".." not in Path(name).parts, "Safe archive paths")
            info = archive.getinfo(name)
            require(info.date_time == (1980, 1, 1, 0, 0, 0), "Deterministic ZIP timestamps")
            require(info.compress_type == zipfile.ZIP_STORED, "Stored ZIP format")
            if not name.startswith("source/"):
                require(archive.read(name) == (directory / name).read_bytes(), "ZIP/disk byte equality: " + name)
        require(archive.read("source/engine.js") == (PROJECT / "engine.js").read_bytes(), "ZIP original engine source")
        require(archive.read("source/archive.js") == (PROJECT / "archive.js").read_bytes(), "ZIP original archive source")
        require(archive.read("source/seed-LICENSE.txt") == (PROJECT / "data/seed/LICENSE").read_bytes(), "ZIP source license")
        require(archive.read("source/source-provenance.json") == (PROJECT / "data/source-provenance.json").read_bytes(), "ZIP provenance")
        require(archive.read("source/README.md") == (PROJECT / "README.md").read_bytes(), "ZIP method documentation")
        require(b"Permission is hereby granted" in archive.read("THIRD-PARTY-NOTICES.txt"), "Live-bundle MIT notice")
    return {"crc": "pass", "entries": len(names), "sourceIncluded": True, "bytes": len(raw), "sha256": sha256(raw)}


def verify_configuration(identifier):
    directory = PROJECT / "generated" / identifier
    parameters = json.loads((directory / "parameters.json").read_text())
    require(parameters["units"] == "mm", "Parameter units")
    p = parameters["parameters"]
    w, d, h, t, f = [p[k] for k in ("width", "depth", "height", "wall", "floor")]
    c, r, ih, n = [p[k] for k in ("clearance", "rib", "insertHeight", "bays")]
    iw, idepth = w - 2 * (t + c), d - 2 * (t + c)
    expected_volume = {
        "tray": w * d * h - (w - 2 * t) * (d - 2 * t) * (h - f),
        "insert": (2 * iw * r + (n - 1) * (idepth - 2 * r) * r) * ih,
    }
    expected_size = {"tray": [w, d, h], "insert": [iw, idepth, ih]}
    parts, controls = {}, []
    for part in ("tray", "insert"):
        triangles, normals = parse_stl((directory / (part + ".stl")).read_text())
        analysis = analyze_mesh(triangles, normals)
        for a in range(3):
            near(analysis["boundsMM"]["min"][a], 0, "Local origin", 1e-8)
            near(analysis["boundsMM"]["size"][a], expected_size[part][a], "Nominal STL bound", 1e-8)
        near(analysis["signedVolumeMM3"], expected_volume[part], "Independent analytic volume")
        require(analysis["eulerCharacteristic"] == (2 if part == "tray" else 2 - 2 * (n - 2)), "Expected solid topology")
        analysis["analyticVolumeMM3"] = expected_volume[part]
        analysis["volumeDifferenceMM3"] = round(analysis["signedVolumeMM3"] - expected_volume[part], 9)
        parts[part] = analysis
        if identifier == "stackline" and part == "tray":
            controls = verify_rejection_controls(triangles)
    near(parameters["assembledInsertTranslationMM"][0], t + c, "Insert centered X gap")
    near(parameters["assembledInsertTranslationMM"][1], t + c, "Insert centered Y gap")
    near(parameters["assembledInsertTranslationMM"][2], f, "Insert floor contact")
    require(h - f - ih >= 2, "Insert rim recess")
    require(idepth - 2 * r >= 20, "Positive usable bay depth")
    with (directory / "bom.csv").open(newline="") as stream:
        bom = list(csv.DictReader(stream))
    require([row["part_id"] for row in bom] == ["tray", "insert"], "Two-part BOM identities")
    density = parameters["assumptions"]["densityGCM3"]
    for row in bom:
        part = row["part_id"]
        require(row["quantity"] == "1", "One of each part")
        near(float(row["solid_volume_mm3"]), expected_volume[part], "BOM volume")
        near(float(row["modeled_mass_g"]), expected_volume[part] / 1000 * density, "BOM mass")
        for a, key in enumerate(("x_mm", "y_mm", "z_mm")):
            near(float(row[key]), expected_size[part][a], "BOM dimensions")
    report = json.loads((directory / "review.json").read_text())
    near(report["totalVolumeMM3"], sum(expected_volume.values()), "Report total solid volume")
    near(report["economics"]["solidMassG"], sum(expected_volume.values()) / 1000 * density, "Report modeled mass")
    require(report["physicalTestsPerformed"] == [], "No physical outcomes claimed")
    require(len(report["bays"]) == n, "Bay count")
    require(all(bay["width"] >= 12 and bay["depth"] >= 20 for bay in report["bays"]), "Every bay positive and usable")
    near(sum(bay["width"] for bay in report["bays"]) + (n - 1) * r, iw, "Bay/rib width partition")
    for part in parts:
        require(report["meshes"][part]["triangles"] == parts[part]["triangles"], "Reported triangle count")
        near(report["meshes"][part]["signedVolumeMM3"], parts[part]["signedVolumeMM3"], "Report STL volume")
    with (directory / "inspection.csv").open(newline="") as stream:
        checks = list(csv.DictReader(stream))
    require(len(checks) >= 10 and all(row["status"] == "NOT PERFORMED" for row in checks), "Unperformed inspection gates")
    require(all(float(row["lower"]) <= float(row["nominal"]) <= float(row["upper"]) for row in checks), "Inspection intervals")
    return {
        "id": identifier, "units": "nominal mm coordinates; STL requires explicit mm import",
        "parts": parts, "bomParts": 2, "drawing": verify_drawing(directory, p),
        "archive": verify_zip(directory), "adversarialControlsRejected": controls,
    }


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("src", "href"):
                self.references.append(value)


def verify_inventory_and_links():
    index = json.loads((PROJECT / "generated/artifact-index.json").read_text())
    indexed = set()
    for artifact in index["artifacts"]:
        name = artifact["path"]
        require(name.startswith("projects/07-manufacturing/"), "Artifact scope")
        file = (ROOT / name).resolve()
        require(PROJECT in file.parents, "Artifact path containment")
        data = file.read_bytes()
        require(len(data) == artifact["bytes"] and sha256(data) == artifact["sha256"], "Artifact byte hash: " + name)
        indexed.add(file)
    actual = {p.resolve() for p in (PROJECT / "generated").rglob("*") if p.is_file() and p.name != "artifact-index.json"}
    require(actual == indexed, "Every generated artifact is in the inventory")
    for source, expected in index["sourceHashes"].items():
        require(sha256((PROJECT / source).read_bytes()) == expected, "Original source hash: " + source)
    links = Links()
    links.feed((PROJECT / "index.html").read_text())
    checked = 0
    for ref in links.references:
        require(not ref.startswith(("http:", "https:", "//", "javascript:")), "No remote/script browser dependency")
        if ref.startswith("#"):
            continue
        file = (PROJECT / ref.split("#")[0]).resolve()
        if PROJECT not in file.parents:
            continue  # Shared/root pages are parent-owned.
        if file.name == "result.json":
            continue  # Written only after this validator and the Node suite succeed.
        require(file.is_file(), "Local HTML download/source link exists: " + ref)
        checked += 1
    return {"sha256Artifacts": len(indexed), "originalSourceHashes": len(index["sourceHashes"]), "localHTMLLinks": checked}


def run():
    configurations = [verify_configuration(identifier) for identifier in CONFIGURATIONS]
    inspection = json.loads((PROJECT / "generated/synthetic-inspection.json").read_text())
    require((inspection["pass"], inspection["hold"]) == (3, 2), "Baseline synthetic gauge replay")
    wide = json.loads((PROJECT / "generated/width-change-review.json").read_text())
    require(wide["decision"] == "HOLD" and wide["proposal"]["pack"]["marginsMM"][0] == -8, "Width change remains held")
    return {
        "schema": "stackline-independent-artifact-check/1",
        "validator": "Original Python 3 standard-library parser/geometry/ZIP/XML checks; no CAD tools",
        "status": "pass", "configurations": configurations,
        "stlSolidsChecked": 6, "inventory": verify_inventory_and_links(),
        "digitalOnly": True, "physicalTestsPerformed": [],
        "notTested": [
            "Physical dimensions, material, fabrication process, fit or handling",
            "Slicer/renderer import behavior or automatic unit interpretation",
            "Actual card/token compatibility, strength or transit protection",
            "Real-browser visual/accessibility behavior (parent-owned review)",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--write-evidence", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = run()
    evidence = PROJECT / "evidence/mesh-validation.json"
    encoded = json.dumps(result, indent=2) + "\n"
    if args.write_evidence:
        evidence.parent.mkdir(parents=True, exist_ok=True)
        evidence.write_text(encoded)
    else:
        require(evidence.read_text() == encoded, "Persisted mesh evidence equals a fresh independent run")
    print("Independent validation PASS: 6 closed manifold STL solids, 3 drawings/BOMs/ZIPs, 5 adversarial rejection controls, {} artifact hashes.".format(result["inventory"]["sha256Artifacts"]))


if __name__ == "__main__":
    main()
