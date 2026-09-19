import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, distribution, simulate, snapshot } from '../engine.mjs';
import { DESIGNS, SCENARIOS, comparisonInputs, runComparison, runAllComparisons } from '../model.mjs';
import { makeWorkload } from '../source.mjs';
import { loadSources, produce, checkArtifacts } from '../scripts/reproduce.mjs';

const step = (resource, duration) => ({ resource, duration, kind: 'work', label: 'Test work', reason: 'Earlier FIFO cases occupy service capacity.' });
const simple = (capacity = 1) => ({
  resources: [{ id: 'desk', label: 'Desk', capacity }],
  cases: [
    { id: 'a', arrival: 0, route: [step('desk', 5)] },
    { id: 'b', arrival: 0, route: [step('desk', 5)] },
    { id: 'c', arrival: 6, route: [step('desk', 5)] },
  ],
});
const workload = () => makeWorkload(loadSources());
const freeze = (object) => {
  if (object && typeof object === 'object') {
    Object.values(object).forEach(freeze);
    Object.freeze(object);
  }
  return object;
};

test('FIFO replay agrees with a hand-calculated one-slot queue', () => {
  const result = simulate(simple());
  assert.deepEqual(result.cases.map((item) => [item.history[0].startedAt, item.completedAt, item.waitMinutes]), [[0, 5, 0], [5, 10, 5], [10, 15, 4]]);
  assert.deepEqual(result.metrics.wait, { count: 3, min: 0, p50: 4, p95: 5, max: 5, mean: 3, sum: 9 });
  assert.equal(result.metrics.cycle.mean, 8);
  assert.equal(result.metrics.durationMinutes, 15);
  assert.equal(result.metrics.throughputPerHour, 12);
  assert.equal(result.metrics.resources[0].busyMinutes, 15);
  assert.equal(result.metrics.resources[0].utilization, 1);
  assert.equal(result.metrics.resources[0].maxQueue, 1);
  const atSix = snapshot(result, 6);
  assert.deepEqual(atSix.counts, { submitted: 3, notArrived: 0, waiting: 1, serving: 1, disposed: 1 });
  assert.equal(atSix.resources[0].queue[0].id, 'c');
  assert.equal(atSix.resources[0].waitMinutes, 5);
  assert.equal(snapshot(result, 9).resources[0].waitMinutes, 8);
});

test('parallel slots are real capacity, not reduced fake service times', () => {
  const plan = simple(2);
  plan.cases[2].arrival = 0;
  const result = simulate(plan);
  assert.deepEqual(result.cases.map((item) => item.completedAt), [5, 5, 10]);
  assert.equal(result.metrics.resources[0].maxBusy, 2);
  assert.equal(result.metrics.resources[0].maxQueue, 1);
  assert.equal(result.metrics.resources[0].utilization, 0.75);
  assert.equal(result.metrics.wait.sum, 5);
  assert.deepEqual(result.cases.map((item) => item.history[0].slot), [0, 1, 0]);
});

test('completion returns precede new arrivals at a tied timestamp', () => {
  const result = simulate({
    resources: [{ id: 'x', capacity: 1 }, { id: 'y', capacity: 1 }],
    cases: [
      { id: 'a', arrival: 0, route: [step('x', 5), step('y', 5)] },
      { id: 'b', arrival: 5, route: [step('y', 5)] },
    ],
  });
  assert.equal(result.cases[0].history[1].startedAt, 5);
  assert.equal(result.cases[1].history[0].startedAt, 10);
  const timeFive = result.events.filter((event) => event.time === 5);
  assert.ok(timeFive.findIndex((event) => event.type === 'finished') < timeFive.findIndex((event) => event.type === 'arrived'));
  assert.deepEqual(snapshot(result, 5).resources.find((resource) => resource.id === 'y').queue.map((item) => item.id), ['b']);
});

test('replay is deterministic, independent of collection order, and never mutates input', () => {
  const plan = freeze(simple());
  const first = simulate(plan);
  const reversed = structuredClone(plan);
  reversed.cases.reverse();
  reversed.resources.reverse();
  assert.deepEqual(simulate(plan), first);
  assert.deepEqual(simulate(reversed), first);
  const original = freeze(workload());
  assert.deepEqual(runAllComparisons(original), runAllComparisons(original));
});

test('metric windows exclude leading idle time; empty workloads have finite zero metrics', () => {
  const plan = simple();
  plan.cases.forEach((item) => { item.arrival += 100; });
  const result = simulate(plan);
  assert.equal(result.metrics.firstArrival, 100);
  assert.equal(result.metrics.durationMinutes, 15);
  assert.equal(result.metrics.throughputPerHour, 12);
  assert.equal(snapshot(result, 50).resources[0].utilization, 0);
  assert.equal(snapshot(result, 102).resources[0].utilization, 1);
  const empty = simulate({ resources: [{ id: 'idle', capacity: 1 }], cases: [] });
  assert.equal(empty.metrics.throughputPerHour, 0);
  assert.equal(empty.metrics.bottleneck, null);
  assert.equal(empty.metrics.resources[0].utilization, 0);
  assert.equal(snapshot(empty, 0).counts.submitted, 0);
});

test('nearest-rank tails, zeros, and means are explicit; p95 is max for eight cases', () => {
  assert.deepEqual(distribution([0, 2, 4, 6, 8, 10, 12, 14]), { count: 8, min: 0, p50: 6, p95: 14, max: 14, mean: 7, sum: 56 });
  assert.equal(distribution([]).mean, 0);
  assert.throws(() => distribution([NaN]));
  assert.throws(() => distribution([-1]));
});

for (const [name, mutate] of [
  ['zero capacity', (p) => { p.resources[0].capacity = 0; }],
  ['fractional capacity', (p) => { p.resources[0].capacity = 1.5; }],
  ['duplicate resource', (p) => { p.resources.push({ id: 'desk', capacity: 1 }); }],
  ['duplicate case', (p) => { p.cases[1].id = 'a'; }],
  ['negative arrival', (p) => { p.cases[0].arrival = -1; }],
  ['nonfinite arrival', (p) => { p.cases[0].arrival = Infinity; }],
  ['fractional arrival', (p) => { p.cases[0].arrival = 0.5; }],
  ['unknown resource', (p) => { p.cases[0].route[0].resource = 'lost'; }],
  ['zero service', (p) => { p.cases[0].route[0].duration = 0; }],
  ['fractional service', (p) => { p.cases[0].route[0].duration = 0.5; }],
  ['missing reason', (p) => { delete p.cases[0].route[0].reason; }],
  ['empty route', (p) => { p.cases[0].route = []; }],
]) {
  test(`invalid plan rejects ${name}, rather than silently losing cases`, () => {
    const plan = simple();
    mutate(plan);
    assert.throws(() => simulate(plan));
  });
}

test('all 12 runs conserve every case at every event and between events without exceeding capacity', () => {
  for (const comparison of runAllComparisons(workload())) {
    for (const run of comparison.runs) {
      assert.equal(run.metrics.submitted, 8);
      assert.equal(run.metrics.disposed, 8);
      assert.equal(run.metrics.dropped, 0);
      assert.deepEqual(run.cases.map((item) => item.id), workload().cases.map((item) => item.id));
      for (const time of run.eventTimes.flatMap((value) => [value, value + 0.5])) {
        const state = snapshot(run, time);
        assert.equal(state.counts.notArrived + state.counts.waiting + state.counts.serving + state.counts.disposed, 8);
        for (const resource of state.resources) {
          assert.ok(resource.active.length <= resource.capacity);
          assert.ok(resource.utilization >= 0 && resource.utilization <= 1);
          if (resource.queue.length) assert.equal(resource.active.length, resource.capacity, 'No idle server may leave a FIFO queue waiting');
        }
      }
      for (const item of run.cases) {
        assert.equal(item.waitMinutes + item.serviceMinutes, item.cycleMinutes);
        let previousEnd = item.arrival;
        for (const visit of item.history) {
          assert.equal(visit.queuedAt, previousEnd);
          assert.ok(visit.startedAt >= visit.queuedAt);
          assert.equal(visit.endedAt - visit.startedAt, visit.duration);
          previousEnd = visit.endedAt;
        }
        assert.equal(previousEnd, item.completedAt);
      }
      assert.equal(run.metrics.wait.sum, run.metrics.resources.reduce((sum, resource) => sum + resource.waitMinutes, 0));
      for (const resource of run.metrics.resources) {
        assert.ok(resource.maxBusy <= resource.capacity);
        assert.equal(resource.busyMinutes, run.cases.flatMap((item) => item.history).filter((visit) => visit.resource === resource.id).reduce((sum, visit) => sum + visit.duration, 0));
      }
    }
  }
});

test('comparison inputs are byte-identical within scenarios; stress changes only declared assumptions', () => {
  const original = workload();
  for (const scenario of SCENARIOS) {
    const comparison = runComparison(original, scenario.id);
    assert.equal(comparison.runs.length, DESIGNS.length);
    assert.ok(comparison.runs.every((run) => run.inputKey === canonical(comparison.inputs)));
    assert.deepEqual(comparison.inputs.cases.map((item) => item.source), original.cases.map((item) => item.source));
    assert.deepEqual(comparison.inputs.cases.map((item) => item.arrival), scenario.id === 'paced' ? [0, 10, 20, 30, 40, 50, 60, 70] : Array(8).fill(0));
  }
  assert.throws(() => comparisonInputs(original, 'invented'), /Unknown scenario/);
});

test('every exception has a capacity-constrained owner visit and bounded unchanged-source rework', () => {
  for (const run of runComparison(workload()).runs) {
    assert.deepEqual(run.metrics.sourceCategories, { 'ready-for-human-approval': 2, 'needs-review': 4, 'needs-data': 2 });
    assert.equal(run.metrics.approved, 0);
    assert.equal(run.metrics.rework.cases, 6);
    assert.equal(run.metrics.rework.caseRate, 0.75);
    assert.equal(run.metrics.rework.visits, run.designId === 'triage' ? 6 : 8);
    for (const item of run.cases) {
      const exceptions = item.history.filter((visit) => visit.kind === 'exception');
      assert.deepEqual(exceptions.map((visit) => visit.reasonCode).sort(), [...item.source.data_errors, ...item.source.review_reasons].sort());
      assert.ok(exceptions.every((visit) => visit.owner && visit.payload && visit.returnPath && visit.unresolved));
      assert.ok(item.history.filter((visit) => visit.kind === 'recheck').every((visit) => visit.reason.includes('all original reasons remain')));
      assert.equal(run.events.find((event) => event.type === 'disposed' && event.caseId === item.id).approved, false);
    }
    assert.equal(run.cases.find((item) => item.id === 'q-105').source.total_usd, null);
  }
});

test('unmodeled exceptions and forged source precedence fail closed', () => {
  const data = workload();
  data.cases[0].source.review_reasons.push('new-policy');
  data.cases[0].source.state = 'needs-review';
  assert.throws(() => runComparison(data), /Unmodeled exception/);
  data.cases[0].source.review_reasons = [];
  assert.throws(() => runComparison(data), /precedence/);
  const invalid = workload();
  invalid.cases[4].source.total_usd = '0.00';
  assert.throws(() => runComparison(invalid), /zero-dollar/);
});

test('fixed-input comparison refuses a missing, extra, or relabeled original case', () => {
  const missing = workload();
  missing.cases.pop();
  assert.throws(() => runComparison(missing), /exactly the eight/);
  const extra = workload();
  extra.cases.push(structuredClone(extra.cases[0]));
  assert.throws(() => runComparison(extra), /exactly the eight/);
  const changed = workload();
  changed.cases[0].id = 'q-999';
  assert.throws(() => runComparison(changed), /exactly the eight/);
  const malformed = workload();
  malformed.cases[0].source.total_usd = 'NaN';
  assert.throws(() => runComparison(malformed), /exact cents/);
  const mislabeled = workload();
  mislabeled.cases[4].source.review_reasons = mislabeled.cases[4].source.data_errors;
  mislabeled.cases[4].source.data_errors = [];
  mislabeled.cases[4].source.total_usd = '0.00';
  mislabeled.cases[4].source.state = 'needs-review';
  assert.throws(() => runComparison(mislabeled), /remain separate/);
});

test('replay snapshots reject invalid clocks instead of losing work', () => {
  const result = simulate(simple());
  for (const time of [-1, NaN, Infinity]) assert.throws(() => snapshot(result, time), /clock/);
});

test('paced model comparison locks all metrics, not just a favorable mean', () => {
  const [baseline, triage, pod] = runComparison(workload()).runs;
  assert.deepEqual([baseline, triage, pod].map((run) => [
    run.metrics.durationMinutes, run.metrics.wait.mean, run.metrics.wait.p95, run.metrics.cycle.p95, run.metrics.cleanCycle.p95,
  ]), [[248, 71.75, 98, 208, 76], [162, 16.75, 32, 110, 58], [223, 26, 54, 183, 28]]);
  assert.deepEqual([baseline, triage, pod].map((run) => run.metrics.bottleneck), ['billing', 'intake', 'pod']);
  assert.equal(triage.metrics.resources.find((resource) => resource.id === 'disposition').waitMinutes, 48);
  assert.equal(baseline.metrics.resources.find((resource) => resource.id === 'disposition').waitMinutes, 14);
});

test('gate squeeze demonstrates faster overall drainage but a worse clean-quote tail and relocated bottleneck', () => {
  const [baseline, triage] = runComparison(workload(), 'gate').runs;
  assert.equal(baseline.metrics.durationMinutes, 376);
  assert.equal(triage.metrics.durationMinutes, 324);
  assert.equal(baseline.metrics.cleanCycle.p95, 150);
  assert.equal(triage.metrics.cleanCycle.p95, 180);
  assert.equal(triage.metrics.bottleneck, 'disposition');
  assert.equal(baseline.metrics.resources.find((resource) => resource.id === 'disposition').waitMinutes, 310);
  assert.equal(triage.metrics.resources.find((resource) => resource.id === 'disposition').waitMinutes, 528);
});

test('slow-owner stress makes the pooled pod worse on throughput and tails, despite faster clean cases', () => {
  const [baseline, , pod] = runComparison(workload(), 'escalation').runs;
  assert.equal(baseline.metrics.durationMinutes, 280);
  assert.equal(pod.metrics.durationMinutes, 390);
  assert.ok(pod.metrics.throughputPerHour < baseline.metrics.throughputPerHour);
  assert.equal(baseline.metrics.wait.p95, 132);
  assert.equal(pod.metrics.wait.p95, 194);
  assert.ok(pod.metrics.cleanCycle.p95 < baseline.metrics.cleanCycle.p95);
  assert.equal(pod.metrics.bottleneck, 'pod');
});

test('persisted workload, summaries, and full paced histories are exactly reproducible', () => {
  checkArtifacts(produce().artifacts);
});
