import "../builds.js";
import "../engine.js";
import test from "node:test";
import assert from "node:assert/strict";

const engine = globalThis.LittleSignalsEngine;

test("same options and semantic actions produce exactly the same state", () => {
  const one = engine.create({ version: "v1", scenario: "meadow", seed: 42 });
  const two = engine.create({ version: "v1", scenario: "meadow", seed: 42 });
  const actions = [
    { type: "teach", robot: 0, rule: "delivery", value: true },
    { type: "teach", robot: 0, rule: "safety", value: true },
    { type: "tick", count: 25 },
  ];
  assert.deepEqual(one.run(actions), two.run(actions));
  assert.deepEqual(engine.replay(one.trace()), one.snapshot());
});

test("untrusted controls are bounded and invalid actions do not change state", () => {
  const game = engine.create();
  const before = game.snapshot();
  for (const action of [
    { type: "tick", count: 26 }, { type: "tick", count: -1 }, { type: "tick", count: 1.5 },
    { type: "teach", robot: 3, rule: "delivery", value: true },
    { type: "teach", robot: 0, rule: "__proto__", value: true },
    { type: "teach", robot: 0, rule: "focus", value: "outside" },
    { type: "execute", value: "code" }, null,
  ]) {
    assert.throws(() => game.act(action));
    assert.deepEqual(game.snapshot(), before);
  }
  assert.throws(() => game.run(Array(65).fill({ type: "tick" })));
  assert.throws(() => engine.create({ seed: -1 }));
  assert.throws(() => engine.create({ scenario: "__proto__" }));
});

test("snapshots and exported traces cannot mutate a live colony", () => {
  const game = engine.create();
  const copy = game.snapshot();
  copy.robots[0].energy = 999;
  copy.walls.length = 0;
  const trace = game.trace();
  trace.final.tick = 999;
  assert.equal(game.snapshot().robots[0].energy, 24);
  assert.equal(game.snapshot().tick, 0);
});

test("sunset is a real loss, and terminal state is immutable", () => {
  const game = engine.create({ scenario: "meadow" });
  for (let i = 0; i < 6; i++) game.act({ type: "tick", count: 25 });
  const final = game.snapshot();
  assert.equal(final.tick, 150);
  assert.equal(final.status, "lost");
  assert.equal(final.delivered, 0);
  game.act({ type: "teach", robot: 0, rule: "delivery", value: true });
  assert.deepEqual(game.snapshot(), final);
});

test("every beat obeys map, energy, occupancy, and conservation invariants", () => {
  for (const scenario of Object.keys(engine.scenarios)) {
    for (const version of Object.keys(globalThis.LittleSignalsBuilds)) {
      const game = engine.create({ version, scenario, seed: 713 });
      for (let robot = 0; robot < 3; robot++) {
        game.act({ type: "teach", robot, rule: "delivery", value: true });
        game.act({ type: "teach", robot, rule: "safety", value: true });
      }
      while (game.snapshot().status === "playing") {
        const state = game.act({ type: "tick" });
        assert.equal(engine.assertInvariants(state), true);
      }
    }
  }
});

test("replay rejects altered actions, frames, and final states", () => {
  const game = engine.create({ scenario: "meadow" });
  game.act({ type: "tick", count: 4 });
  const action = game.trace();
  action.entries[0].action.count = 3;
  assert.throws(() => engine.replay(action), /diverged/);
  const frame = game.trace();
  frame.entries[0].frames[0].robots[0][0] = 99;
  assert.throws(() => engine.replay(frame), /diverged/);
  const state = game.trace();
  state.final.delivered = 99;
  assert.throws(() => engine.replay(state), /final state/);
});

test("v2 safety lesson budgets a complete meadow trip rather than stranding a courier", () => {
  const game = engine.create({ version: "v2", scenario: "meadow", seed: 42 });
  game.run([
    { type: "teach", robot: 0, rule: "delivery", value: true },
    { type: "teach", robot: 0, rule: "safety", value: true },
    { type: "teach", robot: 0, rule: "focus", value: "east" },
    { type: "teach", robot: 1, rule: "job", value: "rest" },
    { type: "teach", robot: 2, rule: "job", value: "rest" },
  ]);
  while (game.snapshot().status === "playing") game.act({ type: "tick" });
  assert.equal(game.snapshot().status, "won");
  assert.equal(game.snapshot().metrics.strandedEvents, 0);
});

test("v3 takes a real detour around walls; solo throughput is not enough to win the class mission", () => {
  const game = engine.create({ version: "v3", scenario: "switchback", seed: 42 });
  game.run([
    { type: "teach", robot: 0, rule: "delivery", value: true },
    { type: "teach", robot: 0, rule: "safety", value: true },
    { type: "teach", robot: 0, rule: "focus", value: "east" },
    { type: "teach", robot: 1, rule: "job", value: "rest" },
    { type: "teach", robot: 2, rule: "job", value: "rest" },
  ]);
  while (game.snapshot().status === "playing") game.act({ type: "tick" });
  const final = game.snapshot();
  assert.equal(final.metrics.wallBumps, 0);
  assert.equal(final.metrics.strandedEvents, 0);
  assert.ok(final.delivered > 0);
  assert.equal(final.status, "lost");
});

test("v4's trained class completes all three gardens without stranding or global deadlocks", () => {
  for (const scenario of Object.keys(engine.scenarios)) {
    for (const seed of [0, 1, 7, 42, 99, 713, 4294967295]) {
      const game = engine.create({ version: "v4", scenario, seed });
      for (let robot = 0; robot < 3; robot++) {
        game.act({ type: "teach", robot, rule: "delivery", value: true });
        game.act({ type: "teach", robot, rule: "safety", value: true });
      }
      while (game.snapshot().status === "playing") game.act({ type: "tick" });
      const state = game.snapshot();
      assert.equal(state.status, "won", `${scenario}, seed ${seed}`);
      assert.equal(state.metrics.strandedEvents, 0);
      assert.equal(state.metrics.wallBumps, 0);
      assert.equal(state.metrics.deadlockTicks, 0);
    }
  }
});

test("mixed, mid-shift player choices preserve every invariant and replay exactly", () => {
  for (let seed = 0; seed < 24; seed++) {
    let random = seed + 1;
    const next = (limit) => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random % limit;
    };
    const game = engine.create({ version: ["v1", "v2", "v3", "v4"][seed % 4], scenario: ["meadow", "switchback", "narrows"][seed % 3], seed });
    for (let index = 0; index < 300 && game.snapshot().status === "playing"; index++) {
      const state = game.snapshot();
      const robot = next(3);
      const choice = next(6);
      if (choice < 2) game.act({ type: "tick", count: 1 + next(10) });
      else if (choice === 2) game.act({ type: "teach", robot, rule: "delivery", value: Boolean(next(2)) });
      else if (choice === 3) game.act({ type: "teach", robot, rule: "safety", value: Boolean(next(2)) });
      else if (choice === 4) game.act({ type: "teach", robot, rule: "focus", value: ["nearest", "north", "east", "south"][next(4)] });
      else if (state.rescueKits && (state.robots[robot].x !== state.home.x || state.robots[robot].y !== state.home.y)) {
        game.act({ type: "rescue", robot });
      } else game.act({ type: "teach", robot, rule: "job", value: next(2) ? "collect" : "rest" });
      assert.equal(engine.assertInvariants(game.snapshot()), true);
    }
    assert.deepEqual(engine.replay(game.trace()), game.snapshot());
  }
});

test("invalid batch syntax is rejected before applying earlier valid lessons", () => {
  const game = engine.create();
  const before = game.snapshot();
  assert.throws(() => game.run([
    { type: "teach", robot: 0, rule: "delivery", value: true },
    { type: "tick", count: Infinity },
  ]));
  assert.deepEqual(game.snapshot(), before);
});
