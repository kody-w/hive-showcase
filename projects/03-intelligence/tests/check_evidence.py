#!/usr/bin/env python3
"""Offline evidence, provenance, links and rendered-HTML integrity checks."""

import csv
import hashlib
import json
import re
import subprocess
import unittest
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parents[1]


def load(relative):
    return json.loads((PROJECT / relative).read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Markup(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.elements = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.elements.append((tag, attrs))
        if "id" in attrs:
            self.ids.append(attrs["id"])


class EvidenceIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load("research/evidence.json")
        cls.protocol = load("research/protocol.json")
        cls.lock = load("research/protocol-lock.json")
        cls.seed = load("evidence/seed-inputs.json")
        cls.sources = {item["id"]: item for item in cls.data["sources"]}
        cls.claims = {item["id"]: item for item in cls.data["claims"]}
        cls.gates = {item["id"]: item for item in cls.protocol["gates"]}
        cls.captures = {key: load(value["capture"]) for key, value in cls.sources.items()}
        output = subprocess.run(
            ["node", str(PROJECT / "tests/render_fixture.mjs")],
            cwd=ROOT, capture_output=True, text=True, check=True, timeout=30,
        )
        cls.rendered = json.loads(output.stdout)

    def test_protocol_is_unchanged_and_predates_collection(self):
        self.assertEqual(digest((PROJECT / self.lock["protocol"]).read_bytes()), self.lock["sha256"])
        self.assertTrue(self.protocol["lockedBeforePublicCollection"])
        self.assertEqual(self.protocol["amendments"], [])
        lock_time = datetime.fromisoformat(self.lock["committedAt"].replace("Z", "+00:00"))
        for capture in self.captures.values():
            if "T" in capture["retrievedAt"]:
                self.assertGreater(datetime.fromisoformat(capture["retrievedAt"]), lock_time)
            else:
                self.assertGreaterEqual(capture["retrievedAt"], lock_time.date().isoformat())
                self.assertIn("timestampPrecision", capture)
        self.assertEqual({rule["id"] for rule in self.protocol["verdictRules"]},
                         {"v-demonstrated", "v-plausible", "v-unsupported"})

    def test_nine_actual_sources_and_six_nonvoting_families(self):
        self.assertGreaterEqual(len(self.sources), self.protocol["evidenceRules"]["minimumInspectedSources"])
        self.assertLessEqual(len(self.sources), 12)
        self.assertEqual(len(self.sources), 9)
        families = {item["id"] for item in self.data["families"]}
        self.assertEqual(len(families), 6)
        self.assertEqual({item["familyId"] for item in self.sources.values()}, families)
        self.assertEqual(self.sources["s-metr-2025"]["familyId"], self.sources["s-metr-2026"]["familyId"])
        self.assertEqual(self.sources["s-wix"]["familyId"], self.sources["s-techcrunch"]["familyId"])
        self.assertEqual(self.sources["s-peng"]["familyId"], self.sources["s-cui"]["familyId"])

    def test_source_metadata_and_bounded_capture_receipts(self):
        raw_hashes = 0
        for source_id, source in self.sources.items():
            with self.subTest(source=source_id):
                capture = self.captures[source_id]
                self.assertEqual(capture["outcome"], "captured")
                self.assertEqual(capture["sourceId"], source_id)
                self.assertEqual(capture["requestedUrl"], source["url"])
                self.assertTrue(source["url"].startswith("https://"))
                self.assertEqual(datetime.fromisoformat(source["publicationDate"]).date().isoformat(), source["publicationDate"])
                self.assertLessEqual(source["publicationDate"], self.data["asOf"])
                self.assertTrue(source["title"] and source["inspection"] and source["method"] and source["interest"])
                self.assertGreaterEqual(len(source["limitations"]), 2)
                words = sum(len(item.get("text", "").split()) for item in capture["excerpts"])
                self.assertLessEqual(words, 220)
                self.assertLess((PROJECT / source["capture"]).stat().st_size, 20_000)
                for excerpt in capture["excerpts"]:
                    if excerpt.get("sha256"):
                        self.assertEqual(digest(excerpt["text"].encode()), excerpt["sha256"])
                        self.assertEqual(len(excerpt["text"]), excerpt["endCharacter"] - excerpt["startCharacter"])
                if capture.get("responseSha256"):
                    self.assertRegex(capture["responseSha256"], r"^[a-f0-9]{64}$")
                    self.assertGreater(capture["responseBytes"], 0)
                    self.assertLessEqual(capture["responseBytes"], 4_000_000)
                    self.assertEqual(capture["status"], 200)
                    raw_hashes += 1
                else:
                    self.assertEqual(source_id, "s-levels-report")
                    self.assertIsNone(capture["status"])
                    self.assertIn("did not expose", capture["storagePolicy"])
        self.assertEqual(raw_hashes, 8)
        self.assertEqual(load("evidence/fetches/s-levels-report.json")["outcome"], "failed")

    def test_ids_are_unique_and_material_claims_resolve_to_inspected_passages(self):
        for group in ["sources", "claims", "families", "contradictions", "businessCases"]:
            ids = [item["id"] for item in self.data[group]]
            self.assertEqual(len(ids), len(set(ids)), group)
        used_sources = set()
        for claim in self.claims.values():
            self.assertIn(claim["stance"], ["support", "challenge", "context"])
            self.assertIn(claim["kind"], ["fact", "attribution", "inference", "uncertainty", "missing-evidence"])
            self.assertTrue(claim["text"] and claim["implication"] and claim["limit"])
            self.assertTrue(claim["citations"])
            refs = [citation["sourceId"] for citation in claim["citations"]]
            self.assertEqual(len(refs), len(set(refs)), claim["id"])
            for citation in claim["citations"]:
                self.assertIn(citation["sourceId"], self.sources)
                capture = self.captures[citation["sourceId"]]
                excerpts = {item["id"]: item for item in capture["excerpts"]}
                self.assertGreater(len(citation["locator"]), 15)
                self.assertTrue(citation["excerptIds"])
                for excerpt_id in citation["excerptIds"]:
                    self.assertIn(excerpt_id, excerpts)
                    self.assertTrue(excerpts[excerpt_id]["found"])
                used_sources.add(citation["sourceId"])
        self.assertEqual(used_sources, set(self.sources))
        missing_refs = {item["sourceId"] for item in self.claims["c-missing"]["citations"]}
        self.assertEqual(missing_refs, set(self.sources))

    def test_contradictions_and_temporal_correction_are_not_filtered_out_of_data(self):
        self.assertEqual({claim["stance"] for claim in self.claims.values()}, {"support", "challenge", "context"})
        self.assertEqual(len(self.data["contradictions"]), 5)
        for item in self.data["contradictions"]:
            self.assertGreaterEqual(len(item["claimIds"]), 2)
            self.assertTrue(item["analysis"] and item["resolutionObservation"])
            self.assertTrue(set(item["claimIds"]) <= set(self.claims))
        slow_sources = {item["sourceId"] for item in self.claims["c-slowdown"]["citations"]}
        self.assertIn("s-metr-2026", slow_sources)
        self.assertIn("out of date", self.claims["c-slowdown"]["text"])
        self.assertIn("−18%", self.claims["c-update"]["text"])
        self.assertIn("+9%", self.claims["c-update"]["text"])
        self.assertNotIn("18% slowdown", self.claims["c-update"]["text"])

    def test_all_hypotheses_have_opposition_and_non_discriminating_evidence(self):
        hypotheses = {item["id"] for item in self.protocol["hypotheses"]}
        self.assertEqual({item["hypothesisId"] for item in self.data["hypothesisAssessments"]}, hypotheses)
        for assessment in self.data["hypothesisAssessments"]:
            for field in ["supportClaimIds", "challengeClaimIds", "nonDiscriminatingClaimIds"]:
                self.assertTrue(assessment[field])
                self.assertTrue(set(assessment[field]) <= set(self.claims))
            self.assertTrue(assessment["assessment"] and assessment["limit"])

    def test_all_gates_verdict_conditions_and_reversal_directions_are_preserved(self):
        self.assertEqual(len(self.gates), 7)
        definitions = {item["id"] for item in self.protocol["definitions"]}
        for gate in self.gates.values():
            self.assertTrue(set(gate["definitionIds"]) <= definitions)
        self.assertEqual({item["gateId"] for item in self.data["gateAssessments"]}, set(self.gates))
        for assessment in self.data["gateAssessments"]:
            self.assertEqual(assessment["status"], "not-established")
            self.assertTrue(set(assessment["claimIds"]) <= set(self.claims))
        reversals = self.protocol["reversalConditions"]
        self.assertEqual({item["direction"] for item in reversals}, {"upgrade", "downgrade", "broaden"})
        self.assertEqual(set(reversals[0]["gateIds"]), set(self.gates))
        self.assertEqual(set(reversals[2]["gateIds"]), set(self.gates))
        for item in reversals:
            self.assertTrue(item["observation"] and item["effect"])
            self.assertTrue(set(item["gateIds"]) <= set(self.gates))
        self.assertEqual(set(self.data["verdict"]["reversalStatus"]), {item["id"] for item in reversals})
        self.assertTrue(all(value == "not-observed" for value in self.data["verdict"]["reversalStatus"].values()))

    def test_business_cases_do_not_convert_anecdotes_to_passes(self):
        for business in self.data["businessCases"]:
            self.assertEqual(set(business["gates"]), set(self.gates))
            self.assertTrue(set(business["sourceIds"]) <= set(self.sources))
            self.assertTrue(all(value in ["missing", "partial", "contradicted"] for value in business["gates"].values()))
        self.assertEqual(self.data["businessCases"][0]["gates"]["g-solo"], "contradicted")
        self.assertEqual(self.data["verdict"]["qualifiedBusinessCases"], 0)
        self.assertIsNone(self.data["verdict"]["probability"])
        self.assertTrue(set(self.data["verdict"]["claimIds"]) <= set(self.claims))

    def test_seed_snapshots_match_reviewed_original_bytes(self):
        self.assertEqual(len(self.seed["files"]), 21)
        self.assertFalse(self.seed["nativeInitialized"])
        self.assertFalse(self.seed["downloadedCodeExecuted"])
        for item in self.seed["files"]:
            raw = (PROJECT / item["path"]).read_bytes()
            self.assertEqual(len(raw), item["bytes"], item["path"])
            self.assertEqual(digest(raw), item["sha256"], item["path"])
        files = list((PROJECT / "inputs/seed").rglob("*"))
        self.assertFalse(any(path.is_file() and path.suffix in [".py", ".js", ".html", ".sh"] for path in files))
        self.assertIn("Copyright (c) 2026 Hive Hub contributors", (PROJECT / "inputs/seed/LICENSE").read_text())
        initialization = load("inputs/seed/initialize.json")
        self.assertFalse(initialization["external_effects_authorized"])
        self.assertFalse(initialization["network"])
        board = load("inputs/seed/templates/casework/work/task-board.json")
        self.assertEqual([item["id"] for item in board["tasks"] if item["state"] == "ready"], ["freeze-local-corpus"])

    def test_synthetic_row_ids_counts_and_eight_id_gap_stay_separate(self):
        records = self.seed["syntheticSourceRecords"]
        self.assertEqual(len(records), 18)
        self.assertEqual(len({item["id"] for item in records}), 18)
        for item in records:
            with (PROJECT / item["path"]).open(newline="") as handle:
                rows = list(csv.DictReader(handle))
            row = rows[item["row"] - 2]
            self.assertEqual(row["record_id"], item["id"])
            self.assertEqual(row["classification"], "SYNTHETIC")
        benchmark = PROJECT / "inputs/seed/templates/casework/work/starter/sources/benchmark-runs.csv"
        with benchmark.open(newline="") as handle:
            runs = {item["record_id"]: item for item in csv.DictReader(handle)}
        self.assertEqual(int(runs["run-04"]["acknowledged"]) - int(runs["run-04"]["recovered_ids"]), 8)
        self.assertFalse(any(int(item["offline_hours"]) >= 72 for item in runs.values()))
        self.assertEqual(self.seed["syntheticCounts"], {"sourceFiles": 5, "records": 18, "codedClaims": 9, "conflicts": 3})
        seed_ids = {item["id"] for item in records}
        self.assertFalse(seed_ids & set(self.sources))
        self.assertEqual(self.data["classification"], "new-public-research")

    def test_entire_local_integrity_inventory_recomputes(self):
        inventory = load("evidence/integrity.json")
        paths = [item["path"] for item in inventory["files"]]
        self.assertEqual(len(paths), len(set(paths)))
        self.assertIn("data.js", paths)
        self.assertIn("research/protocol.json", paths)
        for item in inventory["files"]:
            raw = (PROJECT / item["path"]).read_bytes()
            self.assertEqual(len(raw), item["bytes"], item["path"])
            self.assertEqual(digest(raw), item["sha256"], item["path"])

    def test_manifest_is_scoped_and_every_artifact_exists(self):
        manifest = load("manifest.json")
        self.assertEqual(manifest["id"], "03-intelligence")
        self.assertEqual(manifest["seedSlug"], "public-source-intelligence-bureau")
        self.assertEqual(manifest["stage"], "work-produced")
        self.assertTrue(manifest["summary"] and manifest["title"] and manifest["limitations"])
        for path in [manifest["entrypoint"], *manifest["artifacts"]]:
            self.assertTrue(path.startswith("projects/03-intelligence/"))
            self.assertTrue((ROOT / path).exists(), path)
        for command in manifest["checks"]:
            self.assertIsInstance(command, list)
            self.assertIn(command[0], ["node", "python3"])
            self.assertTrue(all(isinstance(item, str) and item for item in command))
            for item in command[1:]:
                if item.startswith("projects/"):
                    self.assertTrue((ROOT / item).is_file(), item)

    def assert_url(self, raw, base, ids):
        parsed = urlparse(raw)
        if parsed.scheme:
            self.assertEqual(parsed.scheme, "https", raw)
            self.assertTrue(parsed.netloc)
            return
        self.assertFalse(parsed.netloc, raw)
        if parsed.path:
            target = (base / unquote(parsed.path)).resolve()
            self.assertTrue(target.is_relative_to(ROOT), raw)
            self.assertTrue(target.exists(), raw)
        if parsed.fragment:
            fragment = unquote(parsed.fragment)
            if "=" in fragment:
                params = parse_qs(fragment)
                for kind, values in params.items():
                    self.assertIn(kind, ["source", "claim", "tab"])
                    for value in values:
                        self.assertIn(value, self.sources if kind == "source" else self.claims if kind == "claim" else ["map", "gates", "method"])
            elif not parsed.path:
                self.assertIn(fragment, ids, raw)

    def test_all_static_and_generated_links_resolve_without_network(self):
        full = Markup(self.rendered["fullPage"])
        self.assertEqual(len(full.ids), len(set(full.ids)), "Duplicate IDs in fully rendered initial page")
        for html in [self.rendered["fullPage"], *self.rendered["sources"], *self.rendered["claims"]]:
            parser = Markup(html)
            for tag, attrs in parser.elements:
                for attr in ["href", "src"]:
                    if attr in attrs:
                        self.assert_url(attrs[attr], PROJECT, set(full.ids))
                if attrs.get("target") == "_blank" and attrs.get("href", "").startswith("https://"):
                    self.assertIn("noopener", attrs.get("rel", ""))
                    self.assertIn("noreferrer", attrs.get("rel", ""))
                for attr, values in [("data-source", self.sources), ("data-claim", self.claims), ("data-gate-toggle", self.gates)]:
                    if attr in attrs:
                        self.assertIn(attrs[attr], values)
        for filename in ["README.md", "research/brief.md"]:
            path = PROJECT / filename
            for raw in re.findall(r"\[[^\]]+\]\(([^)]+)\)", path.read_text()):
                self.assert_url(raw, path.parent, set(full.ids))

    def test_basic_accessibility_and_critical_offline_constraints(self):
        parser = Markup(self.rendered["fullPage"])
        ids = set(parser.ids)
        tabs = [attrs for tag, attrs in parser.elements if attrs.get("role") == "tab"]
        self.assertEqual(len(tabs), 3)
        self.assertEqual(sum(attrs["aria-selected"] == "true" for attrs in tabs), 1)
        for attrs in tabs:
            self.assertIn(attrs["aria-controls"], ids)
        labels = {attrs["for"] for tag, attrs in parser.elements if tag == "label" and "for" in attrs}
        for tag, attrs in parser.elements:
            if tag in ["input", "select"]:
                self.assertIn(attrs.get("id"), labels)
            if tag == "script":
                self.assertFalse(urlparse(attrs["src"]).scheme)
        html = (PROJECT / "index.html").read_text()
        self.assertIn("../../assets/shared.css", html)
        self.assertIn("connect-src 'none'", html)
        self.assertIn("<noscript>", html)
        self.assertIn('aria-live="polite"', html)
        scripts = "\n".join((PROJECT / file).read_text() for file in ["app.js", "model.js", "render.js"])
        self.assertNotRegex(scripts, r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|eval)\s*[\.(]")
        self.assertNotRegex(html, r"\son(?:click|load|error|input)\s*=")
        css = (PROJECT / "styles.css").read_text()
        self.assertIn("prefers-reduced-motion", css)
        self.assertNotIn("@import", css)

    def test_authoritative_brief_and_source_limitations_remain_honest(self):
        brief = (PROJECT / "research/brief.md").read_text()
        self.assertIn("Conditionally plausible", brief)
        self.assertIn("not established", brief)
        self.assertIn("not proof", brief)
        self.assertIn("No", self.sources["s-swebench"]["inspection"])
        self.assertIn("abstract only", self.sources["s-cui"]["inspection"])
        self.assertIn("not a randomized causal", self.claims["c-stability"]["limit"])
        self.assertIn("not a year", self.sources["s-levels-report"]["limitations"][1])
        self.assertIn("benchmark", self.protocol["evidenceRules"]["proxyBoundary"].lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
