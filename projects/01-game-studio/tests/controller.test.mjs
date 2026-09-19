import "../builds.js";
import "../engine.js";
import "../controller.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const engine = globalThis.LittleSignalsEngine;
const create = globalThis.LittleSignalsController.create;
const recording = JSON.parse(await readFile(new URL("../evidence/runs/cycle-03-after.json", import.meta.url), "utf8"));

test("the browser controller uses the same six lessons and exact winning game rules", () => {
  const observations = [];
  const controller = create((state, view) => observations.push([state.tick, view.kind]));
  controller.reset(recording.trace.options);
  for (const entry of recording.trace.entries) controller.act(entry.action);
  assert.deepEqual(controller.snapshot(), recording.trace.final);
  assert.equal(controller.score().points, 1386);
  assert.equal(controller.score().automated, null);
  assert.equal(observations.length, recording.trace.entries.length + 1);
});

test("replay verifies before display, seeks deterministically, and is read-only", () => {
  const controller = create();
  controller.replay(recording, { at: 0 });
  assert.deepEqual(controller.view(), { mode: "replay", cursor: 0, length: recording.trace.entries.length, automated: true });
  assert.throws(() => controller.act({ type: "tick" }), /read-only/);
  assert.throws(() => controller.run([]), /read-only/);
  controller.seek(30);
  const expected = engine.create(recording.trace.options);
  for (const entry of recording.trace.entries.slice(0, 30)) expected.act(entry.action);
  assert.deepEqual(controller.snapshot(), expected.snapshot());
  controller.nextReplay(5);
  for (const entry of recording.trace.entries.slice(30, 35)) expected.act(entry.action);
  assert.deepEqual(controller.snapshot(), expected.snapshot());
  controller.seek(recording.trace.entries.length);
  assert.deepEqual(controller.snapshot(), recording.trace.final);
  assert.equal(controller.score().automated, true);
  assert.throws(() => controller.seek(-1), /bounds/);
  assert.throws(() => controller.nextReplay(26), /1–25/);
  controller.reset();
  assert.equal(controller.view().mode, "live");
  assert.equal(controller.snapshot().tick, 0);
});

test("rejected replay/reset requests leave the current live session untouched", () => {
  const controller = create();
  controller.act({ type: "tick", count: 4 });
  const before = controller.snapshot();
  const altered = structuredClone(recording);
  altered.trace.final.delivered++;
  assert.throws(() => controller.replay(altered), /differs/);
  assert.throws(() => controller.replay(recording, { at: -1 }), /bounds/);
  assert.throws(() => controller.reset({ version: "v999" }), /version/);
  assert.deepEqual(controller.snapshot(), before);
  assert.equal(controller.view().mode, "live");
});

test("partial replays can be exported and verified without fabricating unplayed actions", () => {
  const controller = create();
  controller.replay(recording, { at: 45 });
  const trace = controller.trace();
  assert.equal(trace.entries.length, 45);
  assert.deepEqual(engine.replay(trace), controller.snapshot());
});

test("replay rejects duplicated terminal actions rather than accepting a repeated last frame", () => {
  const altered = structuredClone(recording.trace);
  altered.entries.push(structuredClone(altered.entries.at(-1)));
  assert.throws(() => engine.replay(altered), /after the terminal/);
});

test("rescue is a real, finite player choice with pod conservation", () => {
  const controller = create();
  controller.reset({ scenario: "meadow" });
  controller.run([
    { type: "teach", robot: 1, rule: "job", value: "rest" },
    { type: "teach", robot: 2, rule: "job", value: "rest" },
    { type: "tick", count: 12 },
  ]);
  assert.equal(controller.snapshot().robots[0].cargo, 1);
  controller.act({ type: "rescue", robot: 0 });
  const state = controller.snapshot();
  assert.equal(state.rescueKits, 1);
  assert.equal(state.lostCargo, 1);
  assert.equal(state.robots[0].energy, 24);
  assert.equal(state.robots[0].cargo, 0);
  assert.equal(state.metrics.rescues, 1);
  assert.equal(engine.assertInvariants(state), true);
  assert.throws(() => controller.act({ type: "rescue", robot: 0 }), /away from home/);
  assert.deepEqual(engine.replay(controller.trace()), state);
});

test("the global action cap also bounds lesson-only play", () => {
  const controller = create();
  for (let i = 0; i < 512; i++) controller.act({ type: "teach", robot: 0, rule: "delivery", value: Boolean(i % 2) });
  const state = controller.snapshot();
  assert.equal(state.actions, 512);
  assert.equal(state.tick, 0);
  assert.equal(state.status, "lost");
  assert.match(state.reason, /512-action/);
  assert.deepEqual(engine.replay(controller.trace()), state);
});
