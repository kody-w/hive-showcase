import test from "node:test";
import assert from "node:assert/strict";
import { solveAgenda, findRepairs, explainConflict, validateAgenda, verifySchedule } from "../engine.mjs";

const cloneOracleData = value => JSON.parse(JSON.stringify(value));

function bruteSchedule(agenda) {
  const placed = [];
  const available = (windows, start, end) => {
    for (let minute = start; minute < end; minute++)
      if (!windows.some(([left, right]) => left <= minute && minute + 1 <= right)) return false;
    return true;
  };
  function enumerate(index) {
    if (index === agenda.tasks.length) {
      const byId = new Map(placed.map(slot => [slot.taskId, slot]));
      return agenda.tasks.every(task => task.dependsOn.every(id => byId.get(id).end <= byId.get(task.id).start))
        ? cloneOracleData(placed) : null;
    }
    const task = agenda.tasks[index];
    for (let start = agenda.day.start; start + task.duration <= agenda.day.end; start += agenda.day.stepMinutes) {
      const end = start + task.duration;
      if (task.fixedStart !== null && task.fixedStart !== undefined && start !== task.fixedStart) continue;
      if (!available(agenda.day.availability, start, end) || !available(task.availability, start, end)) continue;
      if (placed.some(slot => start < slot.end && slot.start < end)) continue;
      placed.push({ taskId: task.id, start, end, duration: task.duration });
      const solution = enumerate(index + 1);
      placed.pop();
      if (solution) return solution;
    }
    return null;
  }
  return enumerate(0);
}

function everyRepair(agenda) {
  const variables = [];
  const step = agenda.day.stepMinutes;
  if (agenda.repairs.latestEnd > agenda.day.end)
    variables.push({ cap: (agenda.repairs.latestEnd - agenda.day.end) / step, task: null });
  agenda.tasks.forEach((task, index) => {
    const floor = agenda.repairs.durationFloors[task.id] ?? task.duration;
    if (floor < task.duration) variables.push({ cap: (task.duration - floor) / step, task: index });
  });
  const feasible = [];
  function enumerate(index, amounts) {
    if (index !== variables.length) {
      for (let amount = 0; amount <= variables[index].cap; amount++) enumerate(index + 1, [...amounts, amount]);
      return;
    }
    if (!amounts.some(Boolean)) return;
    const candidate = cloneOracleData(agenda);
    amounts.forEach((amount, index) => {
      if (variables[index].task === null) candidate.day.end += amount * step;
      else candidate.tasks[variables[index].task].duration -= amount * step;
    });
    const witness = bruteSchedule(candidate);
    if (witness) feasible.push({
      agenda: candidate, witness,
      changedFields: amounts.filter(Boolean).length,
      totalMinutes: amounts.reduce((sum, amount) => sum + amount * step, 0),
    });
  }
  enumerate(0, []);
  feasible.sort((a, b) => a.changedFields - b.changedFields || a.totalMinutes - b.totalMinutes);
  return feasible;
}

function randomModels(count, seed, withRepairs = false) {
  let state = seed;
  const random = modulus => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % modulus;
  };
  const result = [];
  const windowsFromBits = (bits, slots) => {
    const windows = [];
    for (let slot = 0; slot < slots; slot++) {
      if (!(bits & (1 << slot))) continue;
      const start = 540 + slot * 5;
      if (windows.at(-1)?.[1] === start) windows.at(-1)[1] += 5;
      else windows.push([start, start + 5]);
    }
    return windows;
  };
  for (let index = 0; index < count; index++) {
    const slots = 4 + random(3);
    const extraSlots = withRepairs ? random(3) : 0;
    const envelope = slots + extraSlots;
    const allBits = (1 << envelope) - 1;
    const makeWindows = () => windowsFromBits(random(2) ? allBits : random(allBits + 1), envelope);
    const taskCount = 1 + random(3);
    const tasks = [];
    const durationFloors = {};
    for (let task = 0; task < taskCount; task++) {
      const id = `task-${task}`;
      const duration = (1 + random(3)) * 5;
      const fixedStart = random(5) ? null : 540 + random(envelope) * 5;
      const dependsOn = [];
      for (let predecessor = 0; predecessor < taskCount; predecessor++)
        if (random(12) === 0) dependsOn.push(`task-${predecessor}`);
      tasks.push({ id, label: id, duration, fixedStart, availability: makeWindows(), dependsOn });
      if (withRepairs && fixedStart === null && duration > 5)
        durationFloors[id] = duration - (1 + random(duration / 5 - 1)) * 5;
    }
    result.push({
      schema: "agenda-planner/1", title: `Oracle fixture ${seed}:${index}`, classification: "synthetic",
      day: { start: 540, end: 540 + slots * 5, stepMinutes: 5, availability: makeWindows() },
      tasks, repairs: { latestEnd: 540 + envelope * 5, durationFloors },
    });
  }
  return result;
}

test("independent exhaustive start-vector oracle agrees on 1,000 small models", () => {
  let feasible = 0;
  let infeasible = 0;
  for (const [index, agenda] of randomModels(1000, 20260918).entries()) {
    assert.equal(validateAgenda(agenda).status, "valid");
    const reference = bruteSchedule(agenda);
    const actual = solveAgenda(agenda, { maxNodes: 100000 });
    assert.equal(actual.status, reference ? "feasible" : "infeasible", `model ${index}: ${JSON.stringify(agenda)}`);
    if (reference) {
      feasible++;
      assert.equal(verifySchedule(agenda, actual.schedule).valid, true);
    } else {
      infeasible++;
      assert.equal(actual.proof.complete, true);
    }
  }
  assert.ok(feasible > 50, "the corpus must actually exercise feasible witnesses");
  assert.ok(infeasible > 50, "the corpus must actually exercise infeasibility proofs");
});

test("independent full Cartesian repair enumeration checks 250 finite policies", () => {
  let minima = 0;
  let absenceProofs = 0;
  for (const [index, agenda] of randomModels(250, 5091726, true).entries()) {
    const base = bruteSchedule(agenda);
    const actual = findRepairs(agenda, { maxNodes: 100000, maxRepairNodes: 100000, maxRepairCandidates: 100000, maxChoices: 20 });
    if (base) {
      assert.equal(actual.status, "not-needed");
      continue;
    }
    const reference = everyRepair(agenda);
    if (!reference.length) {
      absenceProofs++;
      assert.equal(actual.status, "none-within-policy", `policy ${index}`);
      assert.equal(actual.proof.allCandidatesComplete, true);
      assert.equal(String(actual.proof.candidatesChecked), actual.proof.candidateSpaceSize);
      continue;
    }
    minima++;
    const best = reference[0];
    const equalCost = reference.filter(candidate => candidate.changedFields === best.changedFields && candidate.totalMinutes === best.totalMinutes);
    assert.equal(actual.status, "minimum-proven", `policy ${index}`);
    assert.deepEqual(actual.optimum, { changedFields: best.changedFields, totalMinutes: best.totalMinutes }, `policy ${index}`);
    assert.equal(actual.choices.length, equalCost.length, `all tied optima for policy ${index}`);
    assert.equal(actual.proof.tiesComplete, true);
    for (const choice of actual.choices) {
      assert.ok(bruteSchedule(choice.agenda), `independent repair witness ${index}`);
      assert.equal(verifySchedule(choice.agenda, choice.schedule).valid, true);
      assert.equal(choice.changes.length, best.changedFields);
      assert.equal(choice.changes.reduce((sum, change) => sum + Math.abs(change.from - change.to), 0), best.totalMinutes);
    }
  }
  assert.ok(minima > 5, "minimum-cost claims were exercised");
  assert.ok(absenceProofs > 20, "absence-of-allowed-repair proofs were exercised");
});

test("minimum task cores agree with independent subset enumeration on 150 models", () => {
  let conflicts = 0;
  for (const agenda of randomModels(150, 552026)) {
    if (bruteSchedule(agenda)) continue;
    conflicts++;
    let minimumSize = Infinity;
    for (let mask = 1; mask < 1 << agenda.tasks.length; mask++) {
      const selected = agenda.tasks.filter((_, index) => mask & (1 << index));
      const ids = new Set(selected.map(task => task.id));
      const subset = { ...agenda, tasks: selected.map(task => ({ ...task, dependsOn: task.dependsOn.filter(id => ids.has(id)) })) };
      if (!bruteSchedule(subset)) minimumSize = Math.min(minimumSize, selected.length);
    }
    const actual = explainConflict(agenda, { maxNodes: 100000, maxCoreNodes: 100000 });
    assert.equal(actual.status, "minimum-proven");
    assert.equal(actual.taskIds.length, minimumSize, agenda.title);
    const ids = new Set(actual.taskIds);
    const subset = { ...agenda, tasks: agenda.tasks.filter(task => ids.has(task.id)).map(task => ({ ...task, dependsOn: task.dependsOn.filter(id => ids.has(id)) })) };
    assert.equal(bruteSchedule(subset), null);
  }
  assert.ok(conflicts > 50);
});
