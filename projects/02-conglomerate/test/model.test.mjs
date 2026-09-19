import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialScenario, rankVentures, recommendedAllocation, auditAllocation, sensitivity } from "../model.mjs";

const data = JSON.parse(readFileSync(new URL("../data/inputs.json", import.meta.url), "utf8"));
const fresh = () => initialScenario(data);

test("default hard cap is exactly 300; Ledgerleaf leaves 60 minutes uncommitted", () => {
  const scenario = fresh();
  const ranking = rankVentures(scenario);
  assert.equal(scenario.budgetMinutes, 300);
  assert.equal(ranking.recommended, "ledgerleaf-tools");
  assert.equal(ranking.candidates[0].score, 53);
  assert.equal(ranking.candidates[0].unitMinutes, 180);
  const audit = auditAllocation(scenario, recommendedAllocation(scenario));
  assert.equal(audit.feasible, true);
  assert.deepEqual([audit.allocatedMinutes, audit.reviewMinutes, audit.reserveMinutes, audit.unusedMinutes], [180, 30, 30, 60]);
  assert.equal(audit.usedMinutes + audit.unusedMinutes, 300);
});

test("allocation includes review once, enforces exact boundary and rejects a one-minute overrun", () => {
  const scenario = fresh();
  const allocations = recommendedAllocation(scenario);
  allocations["ledgerleaf-tools"] = 240;
  assert.equal(auditAllocation(scenario, allocations).feasible, true);
  assert.equal(auditAllocation(scenario, allocations).unusedMinutes, 0);
  allocations["ledgerleaf-tools"] = 241;
  const audit = auditAllocation(scenario, allocations);
  assert.equal(audit.feasible, false);
  assert.equal(audit.unusedMinutes, -1);
  assert.match(audit.issues.join(" "), /Over budget by 1/);
});

test("splitting 300 minutes among five ventures is not five useful offerings", () => {
  const scenario = fresh();
  const audit = auditAllocation(scenario, Object.fromEntries(scenario.ventures.map(v => [v.id, 60])));
  assert.equal(audit.feasible, false);
  assert.equal(audit.active.length, 5);
  assert.equal(audit.usedMinutes, 360);
  assert.match(audit.issues.join(" "), /at most one/);
  assert.match(audit.issues.join(" "), /partially funding/);
});

test("empty allocation is feasible but does not incur a fictitious review", () => {
  const audit = auditAllocation(fresh(), {});
  assert.equal(audit.feasible, true);
  assert.equal(audit.reviewMinutes, 0);
  assert.equal(audit.unusedMinutes, 270);
  assert.deepEqual(audit.active, []);
});

test("hundreds of capacity cases never recommend an over-budget or partially funded offer", () => {
  for (let reserve = 0; reserve <= 300; reserve += 10) {
    for (let review = 0; review <= 90; review += 10) {
      const scenario = fresh();
      scenario.reserveMinutes = reserve;
      scenario.reviewMinutes = review;
      const ranking = rankVentures(scenario);
      const audit = auditAllocation(scenario, recommendedAllocation(scenario));
      assert.equal(audit.feasible, true, `reserve ${reserve}, review ${review}`);
      assert.ok(audit.usedMinutes <= 300);
      assert.equal(audit.usedMinutes + audit.unusedMinutes, 300);
      assert.ok(audit.active.length <= 1);
      assert.equal(audit.active[0] ?? null, ranking.recommended);
    }
  }
});

test("literal seed reserve and primary full seed durations are honestly infeasible", () => {
  const literal = fresh();
  literal.reserveMinutes = data.sourceCapacity.reservedHours * 60;
  assert.equal(rankVentures(literal).recommended, null);
  assert.equal(auditAllocation(literal, {}).feasible, false);
  const original = fresh();
  original.mode = "seed";
  const result = rankVentures(original);
  assert.equal(result.valid, true);
  assert.equal(result.recommended, null);
  assert.equal(result.candidates.filter(c => c.feasible).length, 0);
  assert.ok(result.candidates.every(c => c.totalMinutes + original.reserveMinutes > 300));
});

test("withheld offline dependency excludes a high scorer and flags manual funding", () => {
  const scenario = fresh();
  scenario.ventures[0].ready = false;
  assert.equal(rankVentures(scenario).recommended, "quietbench-templates");
  assert.equal(auditAllocation(scenario, { "ledgerleaf-tools": 180 }).feasible, false);
  for (const v of scenario.ventures) v.ready = false;
  assert.equal(rankVentures(scenario).recommended, null);
});

test("a score tie explicitly reports all ties and prefers fewer minutes", () => {
  const scenario = fresh();
  scenario.weights = { learning: 1, reuse: 0, speed: 0 };
  for (const v of scenario.ventures) { v.learning = 3; v.confidence = 50; }
  const result = rankVentures(scenario);
  assert.equal(result.recommended, "routepaper-planners");
  assert.equal(result.tiedIds.length, 5);
  assert.equal(result.margin, 0);
});

test("ties on score and minutes use a stable lexical ID, not source order", () => {
  const scenario = fresh();
  for (const v of scenario.ventures) {
    Object.assign(v, { deliveryMinutes: 80, testPrepMinutes: 20, learning: 3, reuse: 3, confidence: 50 });
  }
  const before = JSON.stringify(scenario);
  assert.equal(rankVentures(scenario).recommended, "fieldnote-guides");
  assert.equal(JSON.stringify(scenario), before);
  scenario.ventures.reverse();
  assert.equal(rankVentures(scenario).recommended, "fieldnote-guides");
});

test("sensitivity exposes two plausible flips and preserves source inputs", () => {
  const scenario = fresh();
  const before = JSON.stringify(scenario);
  const cases = sensitivity(scenario);
  assert.equal(cases.find(c => c.label === "Speed weight = 4").recommended, "quietbench-templates");
  assert.equal(cases.find(c => c.label === "Leader confidence −10 points").recommended, "quietbench-templates");
  assert.equal(cases.find(c => c.label === "Speed only").recommended, "routepaper-planners");
  assert.equal(cases.find(c => c.label === "All delivery + preparation estimates +25%").recommended, "ledgerleaf-tools");
  assert.equal(JSON.stringify(scenario), before);
});

test("zero weights, invalid inputs, unknown allocations and altered hard caps are not repaired silently", () => {
  for (const mutate of [
    s => { s.weights = { learning: 0, reuse: 0, speed: 0 }; },
    s => { s.weights.learning = -1; },
    s => { s.weights.speed = Infinity; },
    s => { s.ventures[0].deliveryMinutes = 0; },
    s => { s.ventures[0].confidence = 101; },
    s => { s.ventures[0].reuse = 1.5; },
    s => { s.ventures[0].ready = "yes"; },
    s => { s.ventures[1].id = s.ventures[0].id; },
    s => { s.reserveMinutes = NaN; },
    s => { s.reviewMinutes = -2; },
    s => { s.budgetMinutes = 301; },
    s => { s.maxActive = 5; },
    s => { s.mode = "unlimited"; }
  ]) {
    const scenario = fresh();
    mutate(scenario);
    assert.equal(rankVentures(scenario).valid, false);
    assert.equal(rankVentures(scenario).recommended, null);
  }
  for (const allocations of [{ ghost: 1 }, { "ledgerleaf-tools": NaN }, { "ledgerleaf-tools": -1 }, { "ledgerleaf-tools": 180.5 }]) {
    assert.equal(auditAllocation(fresh(), allocations).feasible, false);
  }
});

test("all zero-confidence scores decline to manufacture a strategic winner", () => {
  const scenario = fresh();
  for (const v of scenario.ventures) v.confidence = 0;
  const ranking = rankVentures(scenario);
  assert.equal(ranking.valid, true);
  assert.equal(ranking.recommended, null);
  assert.match(ranking.issues[0], /no positive/);
});
