import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Engine, read, readJson, sha256, projectRoot, independentAssignmentAudit } from "../src/study.mjs";

const result = readJson("evidence/result.json");
const baseline = readJson("evidence/baseline.json");
const trials = readJson("evidence/trials.json");
const audit = readJson("evidence/dataset-audit.json");
const failures = readJson("evidence/counterexamples.json");

test("saved evidence covers every frozen case, method, incoming order and PRNG state", () => {
  assert.equal(baseline.cases.length, 4);
  assert.equal(trials.cases.length, 80);
  assert.equal(new Set(trials.cases.map((entry) => entry.caseId)).size, 80);
  for (const scenario of audit.scenarios) {
    const actual = trials.cases.filter((entry) => entry.scenario === scenario.id);
    const expected = Engine.trialOrders(scenario.items, scenario.id, 1729, 20);
    assert.deepEqual(actual.map((entry) => entry.trial), Array.from({ length: 20 }, (_, i) => i + 1));
    for (const [index, entry] of actual.entries()) {
      assert.equal(entry.stateBefore, expected[index].stateBefore);
      assert.equal(entry.stateAfter, expected[index].stateAfter);
      assert.deepEqual(entry.incomingOrder, expected[index].itemIds);
      assert.deepEqual(Object.keys(entry.methods), [...Engine.METHODS]);
      for (const packed of Object.values(entry.methods)) assert.deepEqual(packed.incomingOrder, entry.incomingOrder);
    }
  }
});

test("separate verifier reconstructs all 504 assignments rather than trusting pass flags", () => {
  const artifacts = Object.fromEntries(["dataset-audit", "baseline", "trials"].map((name) => [`evidence/${name}.json`, read(`evidence/${name}.json`).toString()]));
  assert.equal(independentAssignmentAudit(artifacts).checked, 504);
  const corrupted = structuredClone(trials);
  corrupted.cases[0].methods["input-first-fit"].bins[0].itemIds.pop();
  assert.throws(() => independentAssignmentAudit({ ...artifacts, "evidence/trials.json": JSON.stringify(corrupted) }), /exactly-once/);
});

test("all aggregate metrics and candidate gates are reconstructed from complete trials", () => {
  const baselineAuthored = baseline.cases.reduce((sum, entry) => sum + entry.methods["input-first-fit"].count, 0);
  const baselinePaired = trials.cases.reduce((sum, entry) => sum + entry.methods["input-first-fit"].count, 0);
  assert.equal(result.baselineAuthored, baselineAuthored);
  assert.equal(result.baselinePaired, baselinePaired);
  for (const summary of result.methods) {
    const a = baseline.cases.reduce((sum, entry) => sum + entry.methods[summary.method].count, 0);
    const p = trials.cases.reduce((sum, entry) => sum + entry.methods[summary.method].count, 0);
    assert.equal(summary.authoredTotal, a);
    assert.equal(summary.pairedTotal, p);
    const deltas = trials.cases.map((entry) => entry.methods[summary.method].count - entry.methods["input-first-fit"].count);
    assert.equal(summary.wins, deltas.filter((delta) => delta < 0).length);
    assert.equal(summary.losses, deltas.filter((delta) => delta > 0).length);
    assert.equal(summary.ties, deltas.filter((delta) => delta === 0).length);
    assert.equal(summary.wins + summary.losses + summary.ties, 80);
    if (summary.gate) {
      const authoredNoRegression = baseline.cases.every((entry) => entry.methods[summary.method].count <= entry.methods["input-first-fit"].count);
      const pairedNoRegression = audit.scenarios.every((scenario) =>
        trials.cases.filter((entry) => entry.scenario === scenario.id)
          .reduce((sum, entry) => sum + entry.methods[summary.method].count - entry.methods["input-first-fit"].count, 0) <= 0);
      assert.equal(summary.gate.pass, a < baselineAuthored && p < baselinePaired && authoredNoRegression && pairedNoRegression);
    }
  }
  const candidates = result.methods.filter((summary) => summary.gate?.pass);
  const preference = ["dual-best-fit", "beam-128", "bounded-exact"];
  candidates.sort((a, b) => a.pairedTotal - b.pairedTotal || a.authoredTotal - b.authoredTotal || preference.indexOf(a.method) - preference.indexOf(b.method));
  assert.equal(result.decision.selectedMethod, candidates[0]?.method ?? null);
});

test("regression ledger retains every losing method result and known failure", () => {
  const pairedLosses = trials.cases.flatMap((entry) => Object.entries(entry.methods)
    .filter(([, value]) => value.count > entry.methods["input-first-fit"].count)
    .map(([method]) => `${entry.caseId}/${method}`));
  assert.deepEqual(failures.pairedRegressions.map((entry) => `${entry.caseId}/${entry.method}`), pairedLosses);
  assert.deepEqual([failures.knownRegression.input, failures.knownRegression.dominant, failures.knownRegression.volume], [6, 7, 8]);
  assert.equal(failures.unattainableAggregateBound.aggregateLowerBound, 2);
  assert.equal(failures.unattainableAggregateBound.provenOptimum, 3);
  assert.ok(failures.rejectedCandidates.some((entry) => entry.method === "dual-best-fit"));
});

test("search traces remain within the frozen budgets and proof labels are honest", () => {
  for (const entry of [...baseline.cases, ...trials.cases]) {
    const beam = entry.methods["beam-128"];
    assert.equal(beam.trace.width, 128);
    assert.ok(beam.trace.layers.every((layer) => layer.kept <= 128));
    const exact = entry.methods["bounded-exact"];
    assert.equal(exact.trace.itemLimit, 12);
    assert.equal(exact.trace.nodeLimit, 50000);
    assert.ok(exact.trace.nodes <= 50000);
    assert.equal(exact.trace.nodes, exact.trace.levels.reduce((sum, level) => sum + level.visited, 0));
    if (["node-limit", "skipped-item-limit"].includes(exact.trace.status)) assert.equal(exact.proof.status, "bounded-unknown");
  }
});

test("copied source data and reviewed provenance match the parent verification record", () => {
  const sources = readJson("source/sources.json");
  const verified = JSON.parse(readFileSync(resolve(projectRoot, "../../evidence/seed-verification.json"), "utf8"))
    .seeds.find((seed) => seed.slug === sources.seedSlug);
  for (const key of ["seedRef", "cardRef", "archiveRef", "protocolRef"]) assert.equal(sources[key], verified[key]);
  for (const source of sources.copied_data) {
    const ref = verified.verifiedFiles.find((file) => file.path === source.seed_path);
    assert.equal(source.sha256, ref.sha256);
    assert.equal(sha256(read(source.local)), ref.sha256);
    assert.equal(read(source.local).length, ref.bytes);
  }
  for (const source of sources.reviewed_inert_documents) {
    assert.equal(source.sha256, verified.verifiedFiles.find((file) => file.path === source.path).sha256);
  }
});

test("evidence identifies the unchanged pre-comparison freeze and exact original implementation", () => {
  const freeze = readJson("protocol-lock.json");
  assert.equal(sha256(read("protocol.json")), freeze.protocol_sha256);
  assert.equal(sha256(read("PROTOCOL.md")), freeze.protocol_markdown_sha256);
  assert.equal(result.freeze.original_freeze_commit, freeze.original_freeze_commit);
  for (const [path, hash] of Object.entries(result.implementationHashes)) assert.equal(sha256(read(path)), hash);
  assert.equal(result.stage, "work-produced");
});
