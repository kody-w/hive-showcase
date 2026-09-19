import test from "node:test";
import assert from "node:assert/strict";
import { formatMinute, parseMinute, formatWindows, parseWindows, parseImport, createExport, timelineSegments } from "../editor.mjs";
import { analyzeAgenda, validateAgenda } from "../engine.mjs";
import { getPreset } from "../presets.mjs";

test("clock parsing preserves exact boundaries and does not coerce malformed text", () => {
  for (const minute of [0, 1, 539, 540, 1439, 1440]) assert.equal(parseMinute(formatMinute(minute)), minute);
  assert.equal(formatMinute(1440), "24:00");
  for (const value of ["9:00", "24:01", "25:00", "09:60", "", "09:00junk", "Infinity", 540])
    assert.throws(() => parseMinute(value), TypeError);
  assert.equal(formatMinute(NaN), "—");
  assert.equal(formatMinute(1441), "—");
});

test("disjoint windows accept hyphen or en dash; empty does not mean unlimited", () => {
  assert.deepEqual(parseWindows("09:00–10:00, 10:30-11:00"), [[540, 600], [630, 660]]);
  assert.deepEqual(parseWindows(" "), []);
  assert.equal(formatWindows([[540, 600], [630, 660]]), "09:00–10:00, 10:30–11:00");
  assert.throws(() => parseWindows("09:00"), /availability/);
});

test("explicit analysis export/import round trip keeps the input, not untrusted imported conclusions", () => {
  for (const id of ["library", "arcade", "split", "boundary"]) {
    const agenda = getPreset(id);
    const analysis = analyzeAgenda(agenda);
    const report = createExport(agenda, analysis);
    assert.equal(report.status, analysis.feasibility.status);
    assert.equal(report.content, "current-analysis");
    const imported = parseImport(JSON.stringify(report));
    assert.equal(imported.ok, true);
    assert.deepEqual(imported.agenda, validateAgenda(agenda).agenda);
    report.analysis.feasibility.status = "FAKE";
    assert.deepEqual(parseImport(JSON.stringify(report)).agenda, imported.agenda, "import discards report assertions");
  }
});

test("exports label unknown and input-only reports without implying feasibility", () => {
  const input = getPreset("boundary");
  const unknown = analyzeAgenda(input, { maxNodes: 1 });
  const report = createExport(input, unknown);
  assert.equal(report.status, "unproven");
  assert.equal(report.analysis.feasibility.schedule, null);
  const source = createExport(input, null);
  assert.equal(source.status, "not-assessed");
  assert.equal(source.analysis, null);
});

test("stale analysis and invalid input cannot be exported as a current result", () => {
  const input = getPreset("library");
  const result = analyzeAgenda(input);
  input.title += " edited";
  assert.throws(() => createExport(input, result), /Stale/);
  input.tasks[0].duration = -1;
  assert.throws(() => createExport(input, null), /valid supported/);
});

test("failed imports have no replacement agenda and do not touch current state", () => {
  const current = getPreset("library");
  const snapshot = JSON.stringify(current);
  for (const text of ["{", "null", '{"schema":"agenda-planner/2"}', "[]"]) {
    const parsed = parseImport(text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.agenda, undefined);
    assert.equal(JSON.stringify(current), snapshot);
  }
  assert.equal(parseImport(" ".repeat(65537)).ok, false);
  assert.equal(parseImport("🙂".repeat(20000)).ok, false, "limit is UTF-8 bytes, not JS code units");
});

test("imported labels remain literal strings, including markup-like data", () => {
  const input = getPreset("boundary");
  input.tasks[0].label = '<img src=x onerror="alert(1)">';
  const imported = parseImport(JSON.stringify(input));
  assert.equal(imported.ok, true);
  assert.equal(imported.agenda.tasks[0].label, input.tasks[0].label);
});

test("the timeline accounts for tasks, usable slack and unavailable minutes separately", () => {
  const input = getPreset("split");
  input.tasks[0].duration = 25;
  const result = analyzeAgenda(input);
  assert.equal(result.feasibility.status, "feasible");
  const segments = timelineSegments(result.agenda, result.feasibility.schedule);
  assert.deepEqual(segments.map(segment => [segment.type, segment.start, segment.end]), [
    ["slack", 540, 555], ["unavailable", 555, 575], ["task", 575, 600],
  ]);
  assert.equal(segments.reduce((sum, segment) => sum + segment.end - segment.start, 0), 60);
});

test("empty agenda rendering still distinguishes unavailable time from slack", () => {
  const input = getPreset("split");
  input.tasks = [];
  input.repairs.durationFloors = {};
  const segments = timelineSegments(input, []);
  assert.deepEqual(segments.map(segment => segment.type), ["slack", "unavailable", "slack"]);
});
