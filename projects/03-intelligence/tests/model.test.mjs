import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const project = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, project), "utf8");
const sandbox = { URL, URLSearchParams, Intl };
vm.createContext(sandbox);
for (const file of ["data.js", "model.js", "render.js"]) vm.runInContext(read(file), sandbox, { filename: fileURLToPath(new URL(file, project)) });
const M = sandbox.EvidenceModel;
const R = sandbox.EvidenceRender;
const bundle = sandbox.INTELLIGENCE_DATA;
const data = bundle.research;
const protocol = bundle.protocol;
const clone = (value) => JSON.parse(JSON.stringify(value));
const ids = (items) => Array.from(items, (item) => item.id);
const allGateIds = Array.from(protocol.gates, (gate) => gate.id);

test("bundle is exactly the authored claim data and locked protocol", () => {
  assert.deepEqual(clone(data), JSON.parse(read("research/evidence.json")));
  assert.deepEqual(clone(protocol), JSON.parse(read("research/protocol.json")));
  assert.equal(data.sources.length, 9);
  assert.equal(data.claims.length, 12);
});

test("all three directional filters retain exactly their claims", () => {
  for (const stance of ["support", "challenge", "context"]) {
    const claims = M.filterClaims(data, { stance });
    assert.ok(claims.length > 0);
    assert.ok(claims.every((claim) => claim.stance === stance));
    assert.deepEqual(ids(claims), ids(data.claims.filter((claim) => claim.stance === stance)));
  }
  assert.equal(M.filterClaims(data, {}).length, 12);
});

test("search is case-insensitive and searches source titles/dates", () => {
  assert.ok(M.filterClaims(data, { query: "  MeTr  " }).some((claim) => claim.id === "c-update"));
  assert.ok(M.filterClaims(data, { query: "2026-02-24" }).some((claim) => claim.id === "c-update"));
  assert.ok(M.filterClaims(data, { query: "retention" }).some((claim) => claim.id === "c-missing"));
  assert.equal(M.filterClaims(data, { query: "not-a-real-claim-82741" }).length, 0);
});

test("method, direction and text filters intersect without changing evidence", () => {
  const before = JSON.stringify(data);
  const claims = M.filterClaims(data, { stance: "support", kind: "commercial", query: "87,000" });
  assert.deepEqual(ids(claims), ["c-game"]);
  assert.equal(JSON.stringify(data), before);
  assert.equal(data.verdict.id, "v-plausible");
});

test("citation graph has exactly one edge for each declared claim-source relation", () => {
  for (const stance of ["all", "support", "challenge", "context"]) {
    const claims = M.filterClaims(data, { stance });
    const edges = M.edgesFor(claims);
    assert.equal(edges.length, claims.reduce((sum, claim) => sum + claim.citations.length, 0));
    const visible = new Set(ids(M.visibleSources(data, claims)));
    for (const edge of edges) {
      assert.ok(visible.has(edge.sourceId));
      assert.ok(claims.some((claim) => claim.id === edge.claimId));
    }
  }
});

test("deep links validate IDs and unknown values cannot inject a selection", () => {
  assert.equal(M.initialState(data, "#source=s-metr-2026").selectedId, "s-metr-2026");
  assert.equal(M.initialState(data, "#claim=c-staff").selectedId, "c-staff");
  assert.equal(M.initialState(data, "#tab=method").tab, "method");
  const fallback = M.initialState(data, "#source=%3Cscript%3E&tab=bad");
  assert.equal(fallback.selectedId, "c-field");
  assert.equal(fallback.tab, "map");
});

test("empty results clear a stale inspector and resetting restores an actual claim", () => {
  const initial = M.initialState(data);
  const empty = M.transition(data, initial, { type: "filter", query: "zz-no-match-78777" });
  assert.equal(empty.selectedId, null);
  assert.match(R.inspector(bundle, empty), /No claim selected/);
  const reset = M.transition(data, empty, { type: "reset" });
  assert.ok(M.claimById(data, reset.selectedId));
});

test("following a hidden counterclaim clears only obstructing filters", () => {
  let state = M.transition(data, M.initialState(data), { type: "filter", stance: "support" });
  state = M.transition(data, state, { type: "claim", id: "c-slowdown" });
  assert.equal(state.stance, "all");
  assert.equal(state.selectedId, "c-slowdown");
  const source = M.transition(data, state, { type: "source", id: "s-metr-2026" });
  assert.equal(source.selectedType, "source");
  assert.equal(M.routeFor(source), "#source=s-metr-2026");
});

test("every claim inspector exposes attribution, limits, source locators and tensions", () => {
  for (const claim of data.claims) {
    const html = R.claimInspector(bundle, claim);
    assert.ok(html.includes(R.escape(claim.text)));
    assert.ok(html.includes(R.escape(claim.limit)));
    assert.match(html, /Interpretation, not an extra fact/);
    for (const citation of claim.citations) {
      assert.ok(html.includes(`data-source="${citation.sourceId}"`));
      assert.ok(html.includes(R.escape(citation.locator)));
    }
  }
  const opposing = R.claimInspector(bundle, M.claimById(data, "c-slowdown"));
  assert.match(opposing, /c-update/);
  assert.match(opposing, /out of date/);
});

test("every source drilldown exposes independence, date, methods, limits and actual hashes", () => {
  for (const source of data.sources) {
    const html = R.sourceInspector(bundle, source);
    assert.ok(html.includes(R.escape(source.method)));
    assert.ok(html.includes(R.escape(source.interest)));
    assert.ok(html.includes(source.capture));
    assert.ok(html.includes(bundle.receipt.sourceCaptureSha256[source.id]));
    assert.match(html, /Original source \(online\)/);
    assert.match(html, /noopener noreferrer/);
  }
  const fallback = R.sourceInspector(bundle, M.sourceById(data, "s-levels-report"));
  assert.match(fallback, /No body hash or HTTP status is invented/);
});

test("rendering escapes evidence strings and rejects non-HTTPS source URLs", () => {
  assert.equal(R.escape('<img src=x onerror="evil()">'), "&lt;img src=x onerror=&quot;evil()&quot;&gt;");
  for (const input of ["javascript:alert(1)", "data:text/html,bad", "file:///private/test", "https://synthetic:synthetic@example.invalid/"]) {
    assert.equal(R.externalUrl(input), "");
  }
  const malicious = { ...data.claims[0], title: "<script>not executable</script>" };
  assert.ok(!R.claimInspector(bundle, malicious).includes("<script>"));
});

function verifiedCase(id = "verified-1", founderId = "founder-1") {
  return {
    id, founderId, classification: "public-verified-record", unrelated: true,
    periodMonths: 6, samePeriod: true, independent: true,
    gates: Object.fromEntries(allGateIds.map((gate) => [gate, "met"])),
  };
}

test("actual evidence yields conditional plausibility and zero qualifying cases", () => {
  const verdict = M.assessVerdict(data, protocol);
  assert.equal(verdict.id, data.verdict.id);
  assert.equal(verdict.qualifiedCaseIds.length, 0);
  assert.equal(verdict.transferable, false);
  assert.equal(verdict.profileAdvisoryWithdrawn, false);
  assert.equal(data.verdict.probability, null);
});

test("bounded existence requires every gate; omit each one in turn", () => {
  assert.equal(M.qualifiesBusinessCase(verifiedCase(), protocol), true);
  for (const gateId of allGateIds) {
    for (const status of ["missing", "partial", "contradicted", undefined]) {
      const item = verifiedCase();
      item.gates[gateId] = status;
      assert.equal(M.qualifiesBusinessCase(item, protocol), false, `${gateId}: ${status}`);
    }
  }
});

test("every additional same-period, duration and independence condition is necessary", () => {
  for (const change of [
    { periodMonths: 5 }, { samePeriod: false }, { independent: false },
    { classification: "synthetic" }, { classification: "benchmark" },
    { classification: "public-attributed-anecdote" },
  ]) {
    assert.equal(M.qualifiesBusinessCase({ ...verifiedCase(), ...change }, protocol), false);
  }
  assert.equal(M.allGatesMet({}, { gates: [] }), false);
});

test("one complete verified case upgrades existence, not transfer", () => {
  const modified = clone(data);
  modified.businessCases.push(verifiedCase());
  const verdict = M.assessVerdict(modified, protocol);
  assert.equal(verdict.id, "v-demonstrated");
  assert.deepEqual(Array.from(verdict.qualifiedCaseIds), ["verified-1"]);
  assert.equal(verdict.transferable, false);
});

function matchedTrial(id, favorable = false) {
  return {
    id, prespecified: true, matched: true, familiarized: true, weeks: 8,
    allRoleLogs: true, qualityMeasured: true, costMeasured: true,
    aiLaborCostAdvantage: favorable, offsettingQualityBenefit: false, accountabilityRetained: true,
  };
}

test("downgrade requires three eligible trials and at least two adverse outcomes", () => {
  const trials = [matchedTrial("a"), matchedTrial("b"), matchedTrial("c", true)];
  assert.equal(M.profileUndermined(trials), true);
  assert.equal(M.profileUndermined(trials.slice(0, 2)), false);
  assert.equal(M.profileUndermined([matchedTrial("a"), matchedTrial("b", true), matchedTrial("c", true)]), false);
  for (const key of ["prespecified", "matched", "familiarized", "allRoleLogs", "qualityMeasured", "costMeasured"]) {
    const incomplete = clone(trials);
    incomplete[0][key] = false;
    assert.equal(M.profileUndermined(incomplete), false, key);
  }
  const tooShort = clone(trials);
  tooShort[0].weeks = 7;
  assert.equal(M.profileUndermined(tooShort), false);
  const qualityOffset = clone(trials);
  qualityOffset[0].offsettingQualityBenefit = true;
  assert.equal(M.profileUndermined(qualityOffset), false);
});

test("lost accountability satisfies adverse outcome, not universal impossibility", () => {
  const modified = clone(data);
  modified.verdict.matchedTrials = [matchedTrial("a", true), matchedTrial("b", true), matchedTrial("c", true)];
  modified.verdict.matchedTrials[0].accountabilityRetained = false;
  modified.verdict.matchedTrials[1].accountabilityRetained = false;
  const verdict = M.assessVerdict(modified, protocol);
  assert.equal(verdict.id, "v-unsupported");
  assert.equal(verdict.profileAdvisoryWithdrawn, true);
  modified.businessCases.push(verifiedCase());
  assert.equal(M.assessVerdict(modified, protocol).id, "v-demonstrated");
  assert.equal(M.assessVerdict(modified, protocol).profileAdvisoryWithdrawn, true);
});

test("lack of mechanism supports insufficient-support verdict, never a false success", () => {
  const modified = clone(data);
  modified.verdict.mechanismSupported = false;
  assert.equal(M.assessVerdict(modified, protocol).id, "v-unsupported");
});

test("transfer requires three unrelated founders, failures, denominator and non-AI comparison", () => {
  const modified = clone(data);
  modified.businessCases = [verifiedCase("a", "f1"), verifiedCase("b", "f2"), verifiedCase("c", "f3")];
  modified.verdict.transferCohort = { denominatorDisclosed: true, failuresIncluded: true, nonAIComparison: true };
  assert.equal(M.assessVerdict(modified, protocol).transferable, true);
  for (const key of Object.keys(modified.verdict.transferCohort)) {
    const missing = clone(modified);
    missing.verdict.transferCohort[key] = false;
    assert.equal(M.assessVerdict(missing, protocol).transferable, false, key);
  }
  modified.businessCases[2].founderId = "f1";
  assert.equal(M.assessVerdict(modified, protocol).transferable, false);
});

test("counterfactual is always labeled hypothetical, rejects duplicates and cannot mutate evidence", () => {
  const before = JSON.stringify(data);
  const complete = M.counterfactual(allGateIds, protocol);
  assert.equal(complete.hypothetical, true);
  assert.equal(complete.allMet, true);
  assert.match(R.scenarioMessage(allGateIds, protocol), /NOT happened/);
  for (const gateId of allGateIds) {
    assert.equal(M.counterfactual(allGateIds.filter((id) => id !== gateId), protocol).allMet, false);
  }
  assert.equal(M.counterfactual(["g-solo", "g-solo", "invented"], protocol).supplied, 1);
  assert.equal(JSON.stringify(data), before);
  assert.equal(M.assessVerdict(data, protocol).id, "v-plausible");
});

test("all hypotheses, source families, definitions and reversal conditions are visible", () => {
  const method = R.method(bundle);
  const gates = R.gates(bundle, M.initialState(data));
  for (const hypothesis of protocol.hypotheses) assert.ok(method.includes(R.escape(hypothesis.disconfirmer)));
  for (const family of data.families) assert.ok(method.includes(R.escape(family.note)));
  for (const definition of protocol.definitions) assert.ok(method.includes(R.escape(definition.meaning)));
  for (const reversal of protocol.reversalConditions) {
    assert.ok(gates.includes(R.escape(reversal.observation)));
    assert.ok(gates.includes(R.escape(reversal.effect)));
  }
  assert.match(method, /synthetic/);
});
