import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeAgenda, applyRepair, explainConflict, findRepairs, solveAgenda, validateAgenda, verifySchedule, LIMITS } from "../engine.mjs";
import { getPreset, PRESET_INFO } from "../presets.mjs";

const fixtures = JSON.parse(readFileSync(new URL("../fixtures/adversarial.json", import.meta.url), "utf8")).cases;
const duplicate = value => JSON.parse(JSON.stringify(value));
const fixture = id => fixtures.find(item => item.id === id);

for (const item of fixtures) {
  test(`adversarial: ${item.id}`, () => {
    const snapshot = JSON.stringify(item.agenda);
    const outcome = analyzeAgenda(item.agenda, item.options);
    const expected = item.expected;
    assert.equal(outcome.feasibility.status, expected.status);
    assert.equal(outcome.feasibility.proof.kind, expected.proofKind);
    assert.equal(outcome.repairs.status, expected.repairStatus);
    assert.equal(JSON.stringify(item.agenda), snapshot, "the engine must not mutate input");
    if (expected.coreSize !== undefined) {
      assert.equal(outcome.conflict.status, "minimum-proven");
      assert.equal(outcome.conflict.taskIds.length, expected.coreSize);
    }
    if (expected.coreStatus) assert.equal(outcome.conflict.status, expected.coreStatus);
    if (expected.cost) {
      assert.deepEqual(outcome.repairs.optimum, expected.cost);
      assert.equal(outcome.repairs.minimumProven, true);
      assert.equal(outcome.repairs.proof.cheaperCandidatesComplete, true);
    }
    if (expected.choices !== undefined) assert.equal(outcome.repairs.choices.length, expected.choices);
    if (expected.status === "feasible") {
      assert.equal(verifySchedule(item.agenda, outcome.feasibility.schedule).valid, true);
      if (expected.lastEnd) assert.equal(outcome.feasibility.schedule.at(-1).end, expected.lastEnd);
    } else assert.equal(outcome.feasibility.schedule, null, "no partial or guessed schedule");
    if (expected.status === "unproven") assert.equal(outcome.feasibility.proof.complete, false);
    if (expected.unboundedStatus) assert.equal(solveAgenda(item.agenda).status, expected.unboundedStatus);
    for (const choice of outcome.repairs.choices) {
      const repaired = applyRepair(item.agenda, choice);
      assert.equal(verifySchedule(repaired, choice.schedule).valid, true);
      assert.deepEqual(repaired.tasks.map(task => task.id), item.agenda.tasks.map(task => task.id));
      assert.deepEqual(repaired.day.availability, validateAgenda(item.agenda).agenda.day.availability);
      for (const task of repaired.tasks) {
        const original = item.agenda.tasks.find(original => original.id === task.id);
        assert.deepEqual(task.dependsOn, original.dependsOn);
        assert.deepEqual(task.availability, original.availability);
        assert.equal(task.fixedStart, original.fixedStart ?? null);
      }
    }
  });
}

test("all shipped synthetic presets are supported, deterministic and immutable", () => {
  for (const { id } of PRESET_INFO) {
    const input = getPreset(id);
    const before = duplicate(input);
    const first = analyzeAgenda(input);
    assert.equal(validateAgenda(input).status, "valid");
    assert.deepEqual(first, analyzeAgenda(input));
    assert.deepEqual(input, before);
    const another = getPreset(id);
    another.tasks[0].label = "changed";
    assert.notEqual(getPreset(id).tasks[0].label, "changed");
  }
});

test("Pocket Arcade keeps rounds, two breaks and fixed check-in in every repair", () => {
  const input = getPreset("arcade");
  const result = analyzeAgenda(input);
  assert.equal(input.tasks.reduce((sum, task) => sum + task.duration, 0), 85);
  assert.equal(input.day.end - input.day.start, 75);
  assert.deepEqual(result.repairs.optimum, { changedFields: 1, totalMinutes: 10 });
  assert.equal(result.repairs.choices.length, 4);
  for (const choice of result.repairs.choices) {
    assert.equal(choice.agenda.tasks.filter(task => task.kind === "break").length, 2);
    assert.equal(choice.agenda.tasks.find(task => task.id === "check-in").fixedStart, 840);
    assert.equal(choice.schedule.length, 7);
    assert.equal(verifySchedule(choice.agenda, choice.schedule).valid, true);
  }
});

test("library adaptation retains all source topics instead of copying the seed's greedy omission", () => {
  const input = getPreset("library");
  const result = analyzeAgenda(input);
  assert.equal(input.tasks.reduce((sum, task) => sum + task.duration, 0), 73);
  assert.equal(result.feasibility.status, "infeasible");
  assert.deepEqual(result.repairs.optimum, { changedFields: 1, totalMinutes: 13 });
  assert.equal(result.repairs.choices.length, 2);
  assert.ok(result.repairs.choices.every(choice => choice.schedule.some(slot => slot.taskId === "template-demo")));
});

test("a fields-first objective can deliberately prefer 25 minutes over a two-field 10-minute alternative", () => {
  const input = duplicate(fixture("lexicographic-repair").agenda);
  const optimum = findRepairs(input);
  input.tasks.find(task => task.id === "middle").duration = 15;
  input.tasks.find(task => task.id === "last").duration = 15;
  assert.equal(solveAgenda(input).status, "feasible");
  assert.deepEqual(optimum.optimum, { changedFields: 1, totalMinutes: 25 });
});

test("a choice limit may truncate tied repairs without invalidating the minimum cost", () => {
  const input = fixture("overloaded-duration").agenda;
  const limited = findRepairs(input, { maxChoices: 1 });
  assert.equal(limited.status, "minimum-proven");
  assert.equal(limited.choices.length, 1);
  assert.equal(limited.proof.tiesComplete, false);
  assert.equal(limited.minimumProven, true);
});

test("a node-limited smallest-core search cannot claim minimality", () => {
  const outcome = explainConflict(fixture("dependency-conflict").agenda, { maxCoreNodes: 0 });
  assert.equal(outcome.status, "unproven-minimum");
  assert.equal(outcome.minimumCardinalityProven, false);
});

test("zero search nodes still allow sound arithmetic proofs, but not a guessed witness", () => {
  assert.equal(solveAgenda(fixture("overloaded-duration").agenda, { maxNodes: 0 }).status, "infeasible");
  assert.equal(solveAgenda(fixture("boundary-valid-agenda").agenda, { maxNodes: 0 }).status, "unproven");
});

test("empty agenda is feasible; empty availability with a commitment is not", () => {
  const agenda = getPreset("boundary");
  agenda.tasks = [];
  assert.deepEqual(solveAgenda(agenda).schedule, []);
  const withTask = getPreset("boundary");
  withTask.day.availability = [];
  assert.equal(validateAgenda(withTask).status, "valid");
  assert.equal(solveAgenda(withTask).status, "infeasible");
});

test("adjacent and overlapping availability windows are normalized without mutation", () => {
  const input = fixture("boundary-valid-agenda").agenda;
  const agenda = duplicate(input);
  agenda.day.availability = [[1410, 1440], [1380, 1410], [1390, 1400]];
  agenda.tasks[0].availability = [[1380, 1395], [1395, 1440]];
  assert.equal(solveAgenda(agenda).status, "feasible");
  assert.deepEqual(validateAgenda(agenda).agenda.day.availability, [[1380, 1440]]);
  assert.equal(agenda.day.availability.length, 3);
});

test("self-dependency is a supported, proven cycle", () => {
  const agenda = getPreset("split");
  agenda.tasks[0].dependsOn = [agenda.tasks[0].id];
  assert.equal(validateAgenda(agenda).status, "valid");
  assert.equal(solveAgenda(agenda).proof.kind, "dependency-cycle");
});

const invalidMutations = [
  ["duration zero", input => { input.tasks[0].duration = 0; }],
  ["duration fraction", input => { input.tasks[0].duration = 12.5; }],
  ["NaN", input => { input.day.end = NaN; }],
  ["out of day", input => { input.day.end = 1445; }],
  ["overnight", input => { input.day.end = input.day.start - 5; }],
  ["off-grid", input => { input.tasks[0].duration = 12; }],
  ["missing task availability", input => { delete input.tasks[0].availability; }],
  ["missing global availability", input => { delete input.day.availability; }],
  ["reversed window", input => { input.tasks[0].availability = [[600, 540]]; }],
  ["dangling dependency", input => { input.tasks[0].dependsOn = ["missing"]; }],
  ["repeated dependency", input => { input.tasks[0].dependsOn = ["one", "one"]; }],
  ["array instead of task", input => { input.tasks[0] = []; }],
  ["bad ID", input => { input.tasks[0].id = "<script>"; }],
  ["blank label", input => { input.tasks[0].label = " "; }],
  ["invalid floor", input => { input.repairs = { durationFloors: { one: 0 } }; }],
  ["floor above duration", input => { input.repairs = { durationFloors: { one: 20 } }; }],
  ["unknown floor ID", input => { input.repairs = { durationFloors: { absent: 5 } }; }],
  ["shortening fixed event", input => { input.tasks[0].fixedStart = 540; input.repairs = { durationFloors: { one: 5 } }; }],
  ["cutoff shrinks", input => { input.repairs = { latestEnd: 555 }; }],
  ["bad fixed-start type", input => { input.tasks[0].fixedStart = "09:00"; }],
  ["bad classification", input => { input.classification = "validated-real-users"; }],
];
for (const [name, mutate] of invalidMutations) {
  test(`malformed input is not an impossibility proof: ${name}`, () => {
    const agenda = duplicate(fixture("search-bound-infeasible").agenda);
    mutate(agenda);
    const result = solveAgenda(agenda);
    assert.equal(result.status, "invalid");
    assert.equal(result.schedule, null);
    assert.equal(result.proof.complete, false);
  });
}

test("null, arrays, primitive and missing-top-level objects are invalid, not crashes", () => {
  for (const value of [null, [], "agenda", 12, {}, { schema: "agenda-planner/1", day: {} }])
    assert.equal(solveAgenda(value).status, "invalid");
});

test("unsupported features and limits are never silently ignored", () => {
  const candidates = [];
  const nine = duplicate(fixture("search-bound-infeasible").agenda);
  nine.tasks = Array.from({ length: 9 }, (_, index) => ({ id: `task-${index}`, label: "Task", duration: 5, availability: [[540, 600]], dependsOn: [] }));
  candidates.push(nine);
  const large = getPreset("library");
  large.repairs.latestEnd = 700;
  candidates.push(large);
  const optional = getPreset("library");
  optional.tasks[0].required = false;
  candidates.push(optional);
  const recurrence = getPreset("library");
  recurrence.tasks[0].recurrence = "daily";
  candidates.push(recurrence);
  const unknownSchema = getPreset("library");
  unknownSchema.schema = "agenda-planner/2";
  candidates.push(unknownSchema);
  const unsupportedGrid = getPreset("library");
  unsupportedGrid.day.stepMinutes = 2;
  candidates.push(unsupportedGrid);
  const tooManyWindows = getPreset("library");
  tooManyWindows.day.availability = Array.from({ length: LIMITS.maxWindows + 1 }, () => [540, 600]);
  candidates.push(tooManyWindows);
  for (const agenda of candidates) {
    const outcome = solveAgenda(agenda);
    assert.equal(outcome.status, "unsupported");
    assert.equal(outcome.schedule, null);
  }
});

test("complete schedule verification rejects dropped, duplicated, moved or falsified commitments", () => {
  const agenda = getPreset("boundary");
  const witness = solveAgenda(agenda).schedule;
  const mutations = [
    schedule => schedule.pop(),
    schedule => { schedule[1] = duplicate(schedule[0]); },
    schedule => { schedule[0].start += 5; schedule[0].end += 5; },
    schedule => { schedule[0].duration -= 5; schedule[0].end -= 5; },
    schedule => { schedule[1].start = 1405; schedule[1].end = 1430; },
    schedule => { schedule[2].start += 5; schedule[2].end += 5; },
    schedule => { schedule[1].taskId = "invented"; },
    schedule => { schedule[1].end = NaN; },
    schedule => { schedule[0] = null; },
  ];
  for (const mutation of mutations) {
    const broken = duplicate(witness);
    mutation(broken);
    assert.equal(verifySchedule(agenda, broken).valid, false);
  }
  assert.equal(verifySchedule(agenda, null).valid, false);
  assert.equal(verifySchedule(null, []).valid, false);
});

test("verifier rejects availability holes and reversed dependencies even without overlaps", () => {
  const agenda = duplicate(fixture("search-bound-feasible").agenda);
  const reversed = [
    { taskId: "two", start: 540, end: 545, duration: 5 },
    { taskId: "one", start: 545, end: 550, duration: 5 },
  ];
  assert.equal(verifySchedule(agenda, reversed).valid, false);
  agenda.tasks[1].dependsOn = [];
  agenda.day.availability = [[550, 560]];
  assert.equal(verifySchedule(agenda, reversed).valid, false);
});

test("repair application rechecks policy and witness instead of trusting downloaded choice data", () => {
  const agenda = getPreset("library");
  const choice = findRepairs(agenda).choices[0];
  const original = duplicate(agenda);
  const repaired = applyRepair(agenda, choice);
  assert.deepEqual(agenda, original);
  assert.equal(solveAgenda(repaired).status, "feasible");
  const stale = duplicate(agenda);
  stale.day.end++;
  assert.throws(() => applyRepair(stale, choice), /stale/);
  const fabricated = duplicate(choice);
  fabricated.schedule.pop();
  assert.throws(() => applyRepair(agenda, fabricated), /witness/);
  fabricated.changes[0].to = 1440;
  assert.throws(() => applyRepair(agenda, fabricated), /policy/);
  assert.throws(() => applyRepair(agenda, { changes: [{ type: "drop-task" }] }), /Unknown/);
  assert.throws(() => applyRepair(agenda, { ...choice, changes: [...choice.changes, ...choice.changes] }), /twice/);
  assert.throws(() => applyRepair({}, choice), /invalid/);
});

test("malformed API bounds are explicit developer errors", () => {
  for (const options of [{ maxNodes: -1 }, { maxNodes: 0.5 }, { maxNodes: LIMITS.hardNodes + 1 }, { maxChoices: 0 }, { maxCoreChecks: 256 }])
    assert.throws(() => solveAgenda(getPreset("library"), options), RangeError);
  assert.throws(() => solveAgenda(getPreset("library"), { magic: 10 }), /Unknown/);
  assert.throws(() => solveAgenda(getPreset("library"), { toString: 1 }), /Unknown/);
  assert.throws(() => solveAgenda(getPreset("library"), null), TypeError);
});

test("prototype-named legal task IDs never inherit a duration-repair permission", () => {
  const input = {
    schema: "agenda-planner/1", title: "Legal constructor ID", classification: "synthetic",
    day: { start: 540, end: 560, stepMinutes: 5, availability: [[540, 560]] },
    tasks: [{ id: "constructor", label: "Constructor", duration: 20, availability: [[540, 560]], dependsOn: [] }],
  };
  assert.equal(solveAgenda(input).status, "feasible");
  const unauthorized = {
    changes: [{ type: "shorten-task", taskId: "constructor", from: 20, to: 15 }],
    schedule: [{ taskId: "constructor", start: 540, end: 555, duration: 15 }],
  };
  assert.throws(() => applyRepair(input, unauthorized), /policy/);
  input.repairs = { durationFloors: { constructor: 15 } };
  assert.equal(applyRepair(input, unauthorized).tasks[0].duration, 15);
  assert.throws(() => getPreset("constructor"), /Unknown preset/);
  assert.throws(() => getPreset("__proto__"), /Unknown preset/);
});

test("an unknown original feasibility yields an explicitly unproven conflict result", () => {
  const result = explainConflict(fixture("search-bound-feasible").agenda, { maxNodes: 1 });
  assert.equal(result.status, "unproven");
  assert.deepEqual(result.taskIds, []);
});

test("results are plain JSON, with no BigInt masks or partial assignment state", () => {
  for (const { id } of PRESET_INFO) {
    const analysis = analyzeAgenda(getPreset(id));
    assert.deepEqual(JSON.parse(JSON.stringify(analysis)), analysis);
  }
});
