import test from "node:test";
import assert from "node:assert/strict";
import { Engine as E, loadInputs } from "../src/study.mjs";

const input = loadInputs();
const cap = input.capacity;
const fixture = (loads) => loads.map(([volume, weight], i) => ({
  id: `test-${String(i + 1).padStart(2, "0")}`, scenario: "test", volume, weight
}));
const byScenario = (id) => input.scenarios.find((scenario) => scenario.id === id).items;

function exhaustiveMinimum(items, capacity) {
  let minimum = items.length;
  function assign(index, loads) {
    if (index === items.length) { minimum = Math.min(minimum, loads.length); return; }
    const item = items[index];
    for (const load of loads) {
      if (load[0] + item.volume <= capacity.volume_units && load[1] + item.weight <= capacity.weight_units) {
        load[0] += item.volume; load[1] += item.weight;
        assign(index + 1, loads);
        load[0] -= item.volume; load[1] -= item.weight;
      }
    }
    if (loads.length < minimum) {
      loads.push([item.volume, item.weight]); assign(index + 1, loads); loads.pop();
    }
  }
  assign(0, []);
  return minimum;
}

test("source expansion preserves all 11 rows, 29 IDs, source order and shape assumptions", () => {
  assert.deepEqual(input.scenarios.map((scenario) => scenario.itemCount), [4, 8, 14, 3]);
  assert.equal(input.scenarios.reduce((sum, scenario) => sum + scenario.rowCount, 0), 11);
  assert.deepEqual(byScenario("order-trap").map((item) => item.id), [
    "filler-card-pack-01", "filler-card-pack-02", "core-board-pack-01", "core-board-pack-02"
  ]);
  for (const scenario of input.scenarios) {
    assert.equal(new Set(scenario.items.map((item) => item.id)).size, scenario.itemCount);
    assert.ok(scenario.items.every((item) => item.shapeNote));
  }
});

test("CSV parser handles quoted notes but rejects ambiguous or invalid source data", () => {
  const header = "classification,scenario,sku,count,volume-units,weight-units,shape-note\n";
  const good = 'SYNTHETIC,test,item,1,10,10,"Unknown, unmeasured geometry"\n';
  assert.equal(E.parseDataset(header + good, cap)[0].items[0].shapeNote, "Unknown, unmeasured geometry");
  for (const bad of [
    good.replace("SYNTHETIC", "REAL"), good.replace(",1,10,10,", ",0,10,10,"),
    good.replace(",1,10,10,", ",21,10,10,"), good.replace(",1,10,10,", ",1,11,10,"),
    good.replace(",1,10,10,", ",1,10,11,"), good.replace(",1,10,10,", ",1,1.5,10,"),
    good.replace("test", ""), good.replace('"Unknown, unmeasured geometry"', '"Unclosed'),
    good + good, good.replace('"Unknown, unmeasured geometry"', '"Closed"junk'),
    good.replace("item,1", "item,1e0")
  ]) assert.throws(() => E.parseDataset(header + bad, cap));
  assert.throws(() => E.parseDataset("x".repeat(1048577), cap), /1 MiB/);
  assert.throws(() => E.parseDataset(header + good.repeat(1001), cap), /1000/);
  const tooMany = Array.from({ length: 4 }, (_, i) => `SYNTHETIC,test,item-${i},20,1,1,Unknown\n`).join("");
  assert.throws(() => E.parseDataset(header + tooMany, cap), /too large/);
});

test("all twelve original reference counts are reproduced without imported reference code", () => {
  for (const scenario of input.scenarios) {
    const expected = input.expected.scenarios[scenario.id];
    for (const method of input.plan.algorithms) {
      const packed = E.pack(scenario.items, cap, method);
      assert.equal(packed.count, expected[method], `${scenario.id}/${method}`);
      assert.equal(packed.lowerBound, expected.lower_bound);
      assert.equal(packed.validation.valid, true);
    }
  }
});

test("the dominant and volume counterexamples remain worse on mixed-classroom", () => {
  const items = byScenario("mixed-classroom");
  assert.deepEqual(input.plan.algorithms.map((method) => E.pack(items, cap, method).count), [6, 7, 8]);
});

test("every original method respects both capacities and exactly-once assignments", () => {
  for (const scenario of input.scenarios) {
    for (const method of E.METHODS) {
      const packed = E.pack(scenario.items, cap, method);
      assert.ok(E.verifyAssignments(scenario.items, packed.bins, cap).valid);
      assert.ok(packed.count >= scenario.lowerBound);
    }
  }
});

test("verification rejects duplicate, missing, unknown, overloaded and falsified assignments", () => {
  const items = fixture([[3, 7], [3, 7]]);
  const good = E.pack(items, cap, "input-first-fit").bins;
  const changed = (mutate) => {
    const bins = structuredClone(good); mutate(bins);
    assert.equal(E.verifyAssignments(items, bins, cap).valid, false);
  };
  changed((bins) => bins[0].itemIds.push(items[0].id));
  changed((bins) => bins.pop());
  changed((bins) => { bins[0].itemIds[0] = "unknown"; });
  changed((bins) => { bins[0].volume = 0; });
  changed((bins) => { bins[0].remainingWeight = 10; });
  const weightOverflow = [{ itemIds: items.map((item) => item.id), volume: 6, weight: 14 }];
  assert.match(E.verifyAssignments(items, weightOverflow, cap).errors.join(","), /Weight overflow/);
  const volumeItems = fixture([[7, 3], [7, 3]]);
  assert.match(E.verifyAssignments(volumeItems, [{ itemIds: volumeItems.map((item) => item.id), volume: 14, weight: 6 }], cap).errors.join(","), /Volume overflow/);
});

test("invalid integer capacities, oversized items and cross-scenario input fail", () => {
  const items = fixture([[1, 1]]);
  for (const value of [0, -1, NaN, Infinity, 1.1]) {
    assert.throws(() => E.pack(items, { ...cap, volume_units: value }, "input-first-fit"));
  }
  assert.throws(() => E.pack(fixture([[11, 1]]), cap, "input-first-fit"), /Oversized/);
  assert.throws(() => E.pack([...items, { ...items[0], id: "different", scenario: "elsewhere" }], cap, "input-first-fit"), /boundaries/);
  assert.throws(() => E.pack([items[0], items[0]], cap, "input-first-fit"), /Duplicate/);
  assert.throws(() => E.pack(items, cap, "not-a-method"), /Unknown/);
});

test("inclusive capacity equality and empty input are handled exactly", () => {
  for (const method of E.METHODS) {
    const full = E.pack(fixture([[10, 10]]), cap, method);
    assert.equal(full.count, 1);
    assert.equal(full.bins[0].remainingVolume, 0);
    assert.equal(full.proof.method, "aggregate-bound-equality");
    assert.equal(E.pack([], cap, method).count, 0);
  }
});

test("normalized sorting uses both capacities and exact rational ties", () => {
  const unequal = { ...cap, volume_units: 20 };
  const items = fixture([[11, 1], [3, 6]]);
  assert.equal(E.orderedItems(items, "dominant-first-fit", unequal)[0].id, items[1].id);
  const tied = [{ id: "b", scenario: "test", volume: 7, weight: 1 }, { id: "a", scenario: "test", volume: 1, weight: 7 }];
  assert.deepEqual(E.orderedItems(tied, "dominant-first-fit", cap).map((item) => item.id), ["a", "b"]);
});

test("xorshift32 and FNV-1a match fixed algorithm vectors", () => {
  const stream = E.randomStream(1);
  assert.deepEqual([stream.next(), stream.next(), stream.next()], [270369, 67634689, 2647435461]);
  assert.equal(E.scenarioSeed(1, "hello"), (0x4f9f2cab ^ 1) >>> 0);
  assert.throws(() => E.randomStream(0), /state/);
  assert.throws(() => stream.bounded(0), /bound/);
});

test("permutation streams are repeatable, continuous and scenario-specific", () => {
  const items = byScenario("order-trap");
  const a = E.trialOrders(items, "order-trap", 1729, 20);
  assert.deepEqual(a, E.trialOrders(items, "order-trap", 1729, 20));
  assert.notEqual(E.scenarioSeed(1729, "order-trap"), E.scenarioSeed(1729, "weight-trap"));
  for (let i = 0; i < a.length; i += 1) {
    assert.deepEqual([...a[i].itemIds].sort(), items.map((item) => item.id).sort());
    if (i) assert.equal(a[i].stateBefore, a[i - 1].stateAfter);
  }
});

test("aggregate equality proves a result without pretending to run exact search", () => {
  const packed = E.pack(byScenario("mixed-classroom"), cap, "bounded-exact");
  assert.equal(packed.count, 6);
  assert.equal(packed.proof.method, "aggregate-bound-equality");
  assert.equal(packed.trace.status, "bound-equality");
  assert.equal(packed.trace.nodes, 0);
});

test("bulky-gaps needs exhaustive proof above its unattainable aggregate bound", () => {
  const greedy = E.pack(byScenario("bulky-gaps"), cap, "input-first-fit");
  const exact = E.pack(byScenario("bulky-gaps"), cap, "bounded-exact");
  assert.equal(greedy.lowerBound, 2);
  assert.equal(greedy.proof.status, "bounded-unknown");
  assert.equal(exact.count, 3);
  assert.equal(exact.proof.method, "exhaustive-search");
  assert.equal(exact.trace.status, "exhausted");
  assert.equal(exact.proof.certifiedLowerBound, 3);
});

test("node and item limits report unknown rather than inventing exact proofs", () => {
  const nodeLimited = E.pack(byScenario("order-trap"), cap, "bounded-exact", { exactNodeLimit: 1 });
  assert.equal(nodeLimited.trace.nodes, 1);
  assert.equal(nodeLimited.trace.status, "node-limit");
  assert.equal(nodeLimited.proof.status, "bounded-unknown");
  const sorted = E.orderedItems(byScenario("mixed-classroom"), "volume-first-fit", cap);
  const skipped = E.pack(sorted, cap, "bounded-exact");
  assert.equal(skipped.count, 8);
  assert.equal(skipped.trace.status, "skipped-item-limit");
  assert.equal(skipped.proof.optimalBinCount, null);
  assert.throws(() => E.pack(sorted, cap, "bounded-exact", { exactItemLimit: 14 }), /budget/);
  assert.throws(() => E.pack(sorted, cap, "bounded-exact", { exactNodeLimit: 50001 }), /budget/);
});

test("bounded exact agrees with a separate exhaustive partition enumerator on 40 test fixtures", () => {
  let state = 7;
  const draw = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  for (let trial = 0; trial < 40; trial += 1) {
    const items = fixture(Array.from({ length: 1 + trial % 7 }, () => [1 + draw() % 9, 1 + draw() % 9]));
    const actual = E.pack(items, cap, "bounded-exact");
    assert.equal(actual.count, exhaustiveMinimum(items, cap), `test fixture ${trial}`);
    assert.equal(actual.proof.status, "proven-model-optimum");
  }
});

test("beam states stay bounded and fallback never worsens its first-fit incumbent", () => {
  for (const scenario of input.scenarios) {
    for (const width of [1, 128]) {
      const packed = E.pack(scenario.items, cap, "beam-128", { beamWidth: width });
      assert.ok(packed.count <= E.pack(scenario.items, cap, "input-first-fit").count);
      for (const layer of packed.trace.layers) {
        assert.ok(layer.kept <= width);
        assert.equal(layer.generated, layer.unique + layer.equivalentMerged);
        assert.equal(layer.unique, layer.kept + layer.discarded);
      }
    }
  }
});

test("algorithms neither mutate inputs nor depend on locale or ambient randomness", () => {
  const items = structuredClone(byScenario("mixed-classroom")), before = JSON.stringify(items);
  for (const item of items) Object.freeze(item);
  Object.freeze(items);
  const previous = Math.random;
  Math.random = () => { throw new Error("Ambient randomness forbidden"); };
  try {
    for (const method of E.METHODS) assert.deepEqual(E.pack(items, cap, method), E.pack(items, cap, method));
  } finally { Math.random = previous; }
  assert.equal(JSON.stringify(items), before);
});
