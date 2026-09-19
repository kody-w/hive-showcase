"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const project = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(project, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const html = read("index.html");
const app = read("app.js");
const bundle = read("replay-data.js");
const plain = (value) => JSON.parse(JSON.stringify(value));

class Element {
  constructor(tag = "div") {
    this.tagName = tag;
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.children = [];
    this.attributes = {};
    this.listeners = new Map();
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(event, action) { this.listeners.set(event, action); }
  emit(event) { this.listeners.get(event)?.({ target: this }); }
}

function browser({ reducedMotion = false, missingData = false } = {}) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  const timers = new Map();
  let nextTimer = 0;
  const window = {
    matchMedia: () => ({ matches: reducedMotion }),
    setInterval: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearInterval: (id) => timers.delete(id),
  };
  const document = {
    getElementById: (id) => {
      assert.ok(elements.has(id), `HTML contains #${id}`);
      return elements.get(id);
    },
    createElement: (tag) => new Element(tag),
  };
  const context = vm.createContext({ window, document });
  if (!missingData) vm.runInContext(bundle, context, { filename: "replay-data.js" });
  vm.runInContext(app, context, { filename: "app.js" });
  return {
    get: (id) => elements.get(id),
    click: (id) => elements.get(id).emit("click"),
    tick: () => [...timers.values()].forEach((callback) => callback()),
    timers,
    window,
  };
}

test("bundle contains the exact observed frames, not a second reducer", () => {
  const { window } = browser();
  const before = json("evidence/before.json");
  const after = json("evidence/after.json");
  for (const original of before.replays) {
    const repaired = after.replays.find((item) => item.id === original.id);
    const paired = window.HANDOFF_REPLAY.cases[original.id];
    assert.deepEqual(plain(paired.before), original.frames);
    assert.deepEqual(plain(paired.after), repaired.frames);
    assert.deepEqual(plain(paired.records), original.records);
    assert.equal(paired.input_sha256, repaired.input_sha256);
    assert.deepEqual(plain(paired.expected), repaired.expected);
  }
  assert.equal(window.HANDOFF_REPLAY.mode, "recorded-python-execution-not-browser-python");
});

test("initial view shows the actual 4-to-3 final defect outcome without autoplay", () => {
  const page = browser();
  assert.equal(page.get("before-count").textContent, "4");
  assert.equal(page.get("after-count").textContent, "3");
  assert.match(page.get("before-verdict").textContent, /^FAIL/);
  assert.match(page.get("after-verdict").textContent, /^PASS/);
  assert.equal(page.get("step").disabled, true);
  assert.equal(page.timers.size, 0);
  assert.equal(page.get("receipts").children.length, 4);
});

test("reset and stepping expose the repeated receipt without changing the records", () => {
  const page = browser();
  const original = JSON.stringify(page.window.HANDOFF_REPLAY);
  page.click("reset");
  assert.equal(page.get("before-count").textContent, "0");
  assert.equal(page.get("after-count").textContent, "0");
  assert.match(page.get("before-verdict").textContent, /Partial/);
  page.click("step");
  page.click("step");
  assert.equal(page.get("before-count").textContent, "2");
  assert.equal(page.get("after-count").textContent, "1");
  assert.match(page.get("frame-status").textContent, /only in the unfinished version/);
  assert.equal(page.get("receipts").children[1].children[4].textContent, "IDENTICAL REPLAY");
  assert.equal(JSON.stringify(page.window.HANDOFF_REPLAY), original);
});

test("replay pauses, resumes, and clears its timer at the final receipt", () => {
  const page = browser();
  page.click("play");
  assert.equal(page.timers.size, 1);
  assert.equal(page.get("play").attributes["aria-pressed"], "true");
  page.tick();
  assert.equal(page.get("after-count").textContent, "1");
  page.click("play");
  assert.equal(page.timers.size, 0);
  page.click("play");
  for (let n = 0; n < 3; n += 1) page.tick();
  assert.equal(page.get("progress").value, 4);
  assert.equal(page.get("after-count").textContent, "3");
  assert.equal(page.timers.size, 0);
  assert.equal(page.get("play").attributes["aria-pressed"], "false");
});

test("case switching stops playback and preserves the already-passing ordering case", () => {
  const page = browser();
  page.click("play");
  page.get("case-select").value = "out-of-order";
  page.get("case-select").emit("change");
  assert.equal(page.timers.size, 0);
  assert.equal(page.get("before-count").textContent, "3");
  assert.equal(page.get("after-count").textContent, "3");
  assert.match(page.get("before-verdict").textContent, /already worked/);
  assert.equal(page.get("receipts").children[0].children[3].textContent, "19");
});

test("unknown case values fall back to the recorded duplicate case", () => {
  const page = browser();
  page.get("case-select").value = "__proto__";
  page.get("case-select").emit("change");
  assert.equal(page.get("case-select").value, "duplicate");
  assert.equal(page.get("before-count").textContent, "4");
});

test("reduced-motion preference displays the final record without animation", () => {
  const page = browser({ reducedMotion: true });
  page.click("reset");
  page.click("play");
  assert.equal(page.get("progress").value, 4);
  assert.equal(page.timers.size, 0);
});

test("missing local data disables controls and does not invent an execution", () => {
  const page = browser({ missingData: true });
  assert.match(page.get("frame-status").textContent, /unavailable/);
  for (const id of ["play", "step", "reset", "case-select"]) {
    assert.equal(page.get(id).disabled, true);
  }
});

test("maintenance export is the real CLI shape bound to the tested input", () => {
  const report = json("artifacts/pocket-arcade-maintenance.json");
  const after = json("evidence/after.json").replays.find((item) => item.id === "duplicate");
  const { input_sha256, ...withoutHash } = report;
  assert.equal(input_sha256, createHash("sha256").update(read("fixtures/duplicate.jsonl")).digest("hex"));
  assert.deepEqual(withoutHash, after.maintenance);
  assert.equal(report.input_records, 4);
  assert.equal(report.replayed_records, 1);
  assert.equal(report.summary.event_count, 3);
  assert.deepEqual(report.open_queue, ["arcade-input"]);
  assert.equal(report.release_authority, false);
  assert.equal(report.schema, json("artifacts/maintenance-contract.json").output_schema);
});

test("presentation has semantic controls, labels, local resources and no network APIs", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<label for="case-select">/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /<noscript>/);
  for (const id of ["play", "step", "reset"]) {
    assert.match(html, new RegExp(`<button id="${id}" type="button"`));
  }
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(match[1], /^(?:https?:|\/\/|data:|javascript:)/i);
  }
  for (const match of html.matchAll(/(?:<script src|<link rel="stylesheet" href)="([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.resolve(project, match[1])), match[1]);
  }
  assert.doesNotMatch(app, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|eval)\b/);
  assert.match(html, /recorded Python execution frames/);
  assert.match(html, /not an upstream patch/);
});

test("the page and replay distinguish historical hashes from withheld private identity", () => {
  const run = json("evidence/historical-continuation.json");
  const page = browser();
  for (const value of [run.midpoint_commit, run.fix_commit]) {
    assert.ok(html.includes(value), value);
  }
  assert.equal(page.window.HANDOFF_REPLAY.schema, "handoff-browser-replay/2");
  assert.equal(page.window.HANDOFF_REPLAY.historical_midpoint_commit, run.midpoint_commit);
  assert.equal(page.window.HANDOFF_REPLAY.historical_fix_commit, run.fix_commit);
  assert.equal(Object.hasOwn(page.window.HANDOFF_REPLAY, "agent_id"), false);
  assert.equal(page.window.HANDOFF_REPLAY.evidence_kind, "redacted-derived-historical-records");
  assert.equal(run.continuation_count, 1);
  assert.match(html, /private invocation metadata is withheld/);
  assert.match(html, /Missing at the original handoff/);
  assert.doesNotMatch(html, /Missing—and still honestly absent/);
});

test("reset cancels active playback and both displayed summaries are machine-readable", () => {
  const page = browser();
  page.click("play");
  page.tick();
  page.click("reset");
  assert.equal(page.timers.size, 0);
  const frame = JSON.parse(page.get("frame-json").textContent);
  assert.equal(frame.records_applied, 0);
  assert.equal(frame.before.event_count, 0);
  assert.equal(frame.after.event_count, 0);
  assert.equal(frame.final_acceptance_target.event_count, 3);
});
