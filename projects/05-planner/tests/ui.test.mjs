import test from "node:test";
import assert from "node:assert/strict";
import { makeUiDouble } from "./dom-double.mjs";
import { getPreset } from "../presets.mjs";
import { verifySchedule } from "../engine.mjs";

test("DOM-double: original bundle boots to an honest overload, not a partial schedule", () => {
  const ui = makeUiDouble();
  ui.flush();
  assert.match(ui.get("result-badge").textContent, /INFEASIBLE.*PROVEN/);
  assert.equal(ui.get("metric-commitments").textContent, "73");
  assert.equal(ui.get("metric-available").textContent, "60");
  assert.equal(ui.get("metric-tasks").textContent, "7/7");
  assert.equal(ui.get("timeline-track").children.length, 0);
  assert.equal(ui.get("repair-choices").children.length, 2);
  assert.equal(ui.get("export-analysis").disabled, false);
  assert.equal(ui.get("error-box").hidden, true);
});

test("DOM-double: Pocket Arcade approval produces and exports a valid complete schedule", async () => {
  const ui = makeUiDouble();
  ui.flush();
  ui.get("preset").value = "arcade";
  await ui.get("load-preset").click();
  ui.flush();
  assert.equal(ui.get("metric-commitments").textContent, "85");
  assert.equal(ui.get("metric-available").textContent, "75");
  assert.equal(ui.get("repair-choices").children.length, 4);
  await ui.get("repair-choices").children[0].querySelector("button").click();
  ui.flush();
  assert.match(ui.get("result-badge").textContent, /^FEASIBLE/);
  assert.equal(ui.get("task-list").children.length, 7);
  assert.equal(ui.get("day-end").value, "15:25");
  await ui.get("export-analysis").click();
  const report = await ui.latestDownload();
  assert.equal(report.status, "feasible");
  assert.equal(report.analysis.feasibility.schedule.length, 7);
  assert.equal(verifySchedule(report.agenda, report.analysis.feasibility.schedule).valid, true);
  assert.equal(report.agenda.tasks.filter(task => task.kind === "break").length, 2);
});

test("DOM-double: edits invalidate old timeline, repair buttons and analysis export", async () => {
  const ui = makeUiDouble();
  ui.flush();
  const duration = ui.get("task-list").children[0].querySelector('[data-field="duration"]');
  duration.value = "6";
  await duration.fire("input");
  assert.equal(ui.get("export-analysis").disabled, true);
  assert.equal(ui.get("repair-choices").children.length, 0);
  assert.equal(ui.get("repair-panel").hidden, true);
  assert.match(ui.get("result-badge").textContent, /NOT CHECKED/);
  await ui.get("export-analysis").click();
  assert.equal(ui.document.downloads.length, 0);
  await ui.get("agenda-form").fire("submit");
  ui.flush();
  assert.equal(ui.get("metric-commitments").textContent, "74");
});

test("DOM-double: failed malformed/unsupported imports preserve editor and current analysis", async () => {
  const ui = makeUiDouble();
  ui.flush();
  const rows = [...ui.get("task-list").children];
  for (const text of ["{ malformed", JSON.stringify({ ...getPreset("arcade"), rooms: 2 })]) {
    ui.get("json-input").value = text;
    await ui.get("apply-json").click();
    assert.equal(ui.get("error-box").hidden, false);
    assert.equal(ui.document.activeElement.id, "error-box");
    assert.deepEqual(ui.get("task-list").children, rows);
    assert.equal(ui.get("agenda-title").value, getPreset("library").title);
    assert.equal(ui.get("export-analysis").disabled, false);
    assert.match(ui.get("result-badge").textContent, /^INFEASIBLE/);
  }
});

test("DOM-double: bounded search says unknown and exports no schedule", async () => {
  const ui = makeUiDouble();
  ui.flush();
  ui.get("preset").value = "boundary";
  await ui.get("load-preset").click();
  ui.flush();
  ui.get("search-budget").value = "1";
  await ui.get("search-budget").fire("change");
  await ui.get("agenda-form").fire("submit");
  ui.flush();
  assert.match(ui.get("result-badge").textContent, /^UNKNOWN/);
  assert.equal(ui.get("timeline-track").children.length, 0);
  assert.equal(ui.get("repair-choices").children.length, 0);
  await ui.get("export-analysis").click();
  const report = await ui.latestDownload();
  assert.equal(report.status, "unproven");
  assert.equal(report.analysis.feasibility.schedule, null);
});

test("DOM-double: imported markup-like task labels remain literal DOM text", async () => {
  const ui = makeUiDouble();
  ui.flush();
  const input = getPreset("boundary");
  input.tasks[0].label = '<img src=x onerror="alert(1)">';
  ui.get("json-input").value = JSON.stringify(input);
  await ui.get("apply-json").click();
  await ui.get("agenda-form").fire("submit");
  ui.flush();
  assert.equal(ui.get("error-box").hidden, true);
  assert.match(ui.get("timeline-content").textContent, /<img src=x onerror="alert\(1\)">/);
  assert.equal(ui.get("timeline-content").querySelector("img"), null);
});

test("DOM-double: explicit deletion does not silently remove a dangling dependency", async () => {
  const ui = makeUiDouble();
  ui.flush();
  const first = ui.get("task-list").children[0];
  await first.querySelector("button").click();
  assert.equal(ui.get("task-list").children.length, 6);
  await ui.get("agenda-form").fire("submit");
  ui.flush();
  assert.match(ui.get("result-badge").textContent, /INVALID/);
  assert.match(ui.get("error-box").textContent, /Unknown predecessor: welcome/);
  assert.equal(ui.get("export-analysis").disabled, true);
});

test("DOM-double: adding reaches the supported task limit without erasing existing rows", async () => {
  const ui = makeUiDouble();
  ui.flush();
  const originalRows = [...ui.get("task-list").children];
  await ui.get("add-task").click();
  assert.equal(ui.get("task-list").children.length, 8);
  assert.deepEqual(ui.get("task-list").children.slice(0, 7), originalRows);
  assert.equal(ui.get("add-task").disabled, true);
  await ui.get("add-task").click();
  assert.equal(ui.get("task-list").children.length, 8);
});

test("DOM-double: asynchronous file import cannot overwrite an intervening edit", async () => {
  const ui = makeUiDouble();
  ui.flush();
  let finishRead;
  const pendingText = new Promise(resolve => { finishRead = resolve; });
  ui.get("import-file").files = [{ size: 1000, text: () => pendingText }];
  const importCompletion = ui.get("import-file").fire("change");
  ui.get("agenda-title").value = "An intervening edit";
  await ui.get("agenda-title").fire("input");
  finishRead(JSON.stringify(getPreset("arcade")));
  await importCompletion;
  assert.equal(ui.get("agenda-title").value, "An intervening edit");
  assert.match(ui.get("error-box").textContent, /editor changed/);
});

test("DOM-double: rapid preset change queues a fresh check rather than displaying the previous result", async () => {
  const ui = makeUiDouble();
  ui.get("preset").value = "arcade";
  await ui.get("load-preset").click();
  ui.flush();
  assert.equal(ui.get("metric-commitments").textContent, "85");
  assert.equal(ui.get("repair-choices").children.length, 4);
  assert.equal(ui.get("solve").disabled, false);
});

test("DOM-double: legal constructor ID has no inherited floor or unexpected field value", async () => {
  const ui = makeUiDouble();
  ui.flush();
  const input = {
    schema: "agenda-planner/1", title: "Named commitment", classification: "synthetic",
    day: { start: 540, end: 560, stepMinutes: 5, availability: [[540, 560]] },
    tasks: [{ id: "constructor", label: "Constructor", duration: 20, availability: [[540, 560]], dependsOn: [] }],
  };
  ui.get("json-input").value = JSON.stringify(input);
  await ui.get("apply-json").click();
  assert.equal(ui.get("task-list").children[0].querySelector('[data-field="floor"]').value, "20");
  await ui.get("agenda-form").fire("submit");
  ui.flush();
  assert.match(ui.get("result-badge").textContent, /^FEASIBLE/);
});
