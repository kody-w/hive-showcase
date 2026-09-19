import { analyzeAgenda, applyRepair, validateAgenda, verifySchedule, LIMITS } from "./engine.mjs";
import { PRESET_INFO, getPreset } from "./presets.mjs";
import { formatMinute, parseMinute, formatWindows, parseWindows, parseImport, createExport, timelineSegments } from "./editor.mjs";

const byElementId = id => document.getElementById(id);
const makeElement = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
let currentAnalysis = null;
let editorRevision = 0;
let running = false;
let rerunRequested = false;
let nextTaskNumber = 1;

function showError(message) {
  byElementId("error-box").textContent = message;
  byElementId("error-box").hidden = false;
  byElementId("error-box").focus();
}

function clearError() {
  byElementId("error-box").hidden = true;
  byElementId("error-box").textContent = "";
}

function updateCount() {
  const count = byElementId("task-list").children.length;
  byElementId("task-count").textContent = `${count} / ${LIMITS.maxTasks}`;
  byElementId("add-task").disabled = count >= LIMITS.maxTasks;
}

function clearResults() {
  byElementId("conflict-panel").hidden = true;
  byElementId("repair-panel").hidden = true;
  byElementId("repair-choices").replaceChildren();
  byElementId("timeline-track").replaceChildren();
  byElementId("timeline-content").replaceChildren(makeElement("p", "No current verified schedule. Check the edited constraints first.", "empty-state"));
  for (const id of ["metric-commitments", "metric-available", "metric-tasks", "timeline-start", "timeline-end"])
    byElementId(id).textContent = "—";
  byElementId("timeline-state").textContent = "";
  byElementId("proof-note").textContent = "";
}

function invalidate() {
  editorRevision++;
  currentAnalysis = null;
  byElementId("export-analysis").disabled = true;
  byElementId("result-card").dataset.status = "stale";
  byElementId("result-badge").textContent = "EDITS NOT CHECKED";
  byElementId("result-title").textContent = "New constraints. New check.";
  byElementId("result-message").textContent = "The previous result and repair choices are stale. No schedule is assumed until you check again.";
  clearError();
  clearResults();
  updateCount();
}

function taskField(row, parent, key, labelText, value, options = {}) {
  const label = makeElement("label", labelText);
  const id = `${row.dataset.taskId}-${key}`;
  label.htmlFor = id;
  const input = document.createElement(options.choices ? "select" : "input");
  input.id = id;
  input.dataset.field = key;
  if (options.choices) {
    for (const option of options.choices) {
      const element = makeElement("option", option);
      element.value = option;
      input.append(element);
    }
  } else {
    input.type = options.type ?? "text";
    if (input.type === "number") { input.min = "1"; input.max = "1440"; input.step = "1"; }
    if (options.placeholder) input.placeholder = options.placeholder;
  }
  input.value = String(value);
  label.append(input);
  parent.append(label);
  return input;
}

function createTaskRow(task, floor) {
  const row = makeElement("article", undefined, "task-row");
  row.dataset.taskId = task.id;
  const main = makeElement("div", undefined, "task-main");
  const name = taskField(row, main, "label", "Commitment", task.label);
  name.maxLength = 120;
  taskField(row, main, "duration", "Minutes", task.duration, { type: "number" });
  const remove = makeElement("button", "×", "remove-task");
  remove.type = "button";
  remove.dataset.remove = task.id;
  remove.setAttribute("aria-label", `Remove commitment ${task.id} from my input`);
  main.append(remove);
  row.append(main);
  const details = makeElement("details");
  details.append(makeElement("summary", "Availability · dependencies · repair floor"));
  details.append(makeElement("p", `ID: ${task.id} · mandatory, uninterrupted`, "task-id"));
  taskField(row, details, "availability", "Task availability", formatWindows(task.availability), { placeholder: "09:00–10:00" });
  taskField(row, details, "dependsOn", "Must follow IDs (comma-separated)", task.dependsOn.join(", "), { placeholder: "check-in, round-one" });
  const grid = makeElement("div", undefined, "field-grid two");
  taskField(row, grid, "fixedStart", "Fixed start (blank = flexible)", task.fixedStart === null ? "" : formatMinute(task.fixedStart), { placeholder: "HH:MM or blank" });
  taskField(row, grid, "floor", "Negotiable duration floor", floor, { type: "number" });
  taskField(row, grid, "kind", "Display category", task.kind, { choices: ["task", "break", "event"] });
  details.append(grid);
  row.append(details);
  return row;
}

function loadEditor(agenda, note) {
  const validation = validateAgenda(agenda);
  if (validation.status !== "valid") throw new TypeError("Only validated, supported inputs can replace the editor.");
  const data = validation.agenda;
  byElementId("agenda-title").value = data.title;
  byElementId("day-start").value = formatMinute(data.day.start);
  byElementId("day-end").value = formatMinute(data.day.end);
  byElementId("day-windows").value = formatWindows(data.day.availability);
  byElementId("step").value = String(data.day.stepMinutes);
  byElementId("latest-end").value = formatMinute(data.repairs.latestEnd);
  byElementId("classification").value = data.classification;
  byElementId("task-list").replaceChildren(...data.tasks.map(task => createTaskRow(task,
    Object.hasOwn(data.repairs.durationFloors, task.id) ? data.repairs.durationFloors[task.id] : task.duration)));
  byElementId("json-input").value = JSON.stringify(data, null, 2);
  if (note) byElementId("scenario-note").textContent = note;
  invalidate();
}

function readWhole(value, label) {
  if (!/^\d+$/.test(value.trim())) throw new TypeError(`${label} must be a whole number, not "${value}".`);
  return Number(value);
}

function readEditor() {
  const durationFloors = {};
  const tasks = [...byElementId("task-list").children].map(row => {
    const value = field => row.querySelector(`[data-field="${field}"]`).value;
    const id = row.dataset.taskId;
    const duration = readWhole(value("duration"), `${id}: duration`);
    const floor = readWhole(value("floor"), `${id}: duration floor`);
    if (floor !== duration) durationFloors[id] = floor;
    return {
      id, label: value("label"), duration,
      availability: parseWindows(value("availability")),
      dependsOn: value("dependsOn").trim() ? value("dependsOn").split(",").map(id => id.trim()) : [],
      fixedStart: value("fixedStart").trim() ? parseMinute(value("fixedStart")) : null,
      kind: value("kind"),
    };
  });
  return {
    schema: "agenda-planner/1", title: byElementId("agenda-title").value,
    classification: byElementId("classification").value,
    day: {
      start: parseMinute(byElementId("day-start").value),
      end: parseMinute(byElementId("day-end").value),
      stepMinutes: Number(byElementId("step").value),
      availability: parseWindows(byElementId("day-windows").value),
    },
    tasks, repairs: { latestEnd: parseMinute(byElementId("latest-end").value), durationFloors },
  };
}

function describeChange(change, agenda) {
  if (change.type === "extend-day")
    return `Move cutoff ${formatMinute(change.from)} → ${formatMinute(change.to)} (+${change.to - change.from} minutes within already declared availability).`;
  const task = agenda.tasks.find(task => task.id === change.taskId);
  return `${task.label}: ${change.from} → ${change.to} minutes (explicitly renegotiate ${change.from - change.to} minutes of scope/time budget).`;
}

function renderTimeline(agenda, schedule) {
  const content = byElementId("timeline-content");
  const track = byElementId("timeline-track");
  const span = agenda.day.end - agenda.day.start;
  byElementId("timeline-start").textContent = formatMinute(agenda.day.start);
  byElementId("timeline-end").textContent = formatMinute(agenda.day.end);
  track.replaceChildren();
  if (!schedule) {
    content.replaceChildren(makeElement("p", "No feasible agenda is being displayed. A proof of conflict or an unknown result is not a partial schedule.", "empty-state"));
    byElementId("timeline-state").textContent = "NO SCHEDULE CLAIMED";
    return;
  }
  if (!verifySchedule(agenda, schedule).valid) throw new Error("Internal witness verification failed; schedule withheld.");
  const list = makeElement("ol", undefined, "schedule-list");
  const taskMap = new Map(agenda.tasks.map((task, index) => [task.id, { ...task, color: index }]));
  for (const segment of timelineSegments(agenda, schedule)) {
    const task = taskMap.get(segment.taskId);
    const duration = segment.end - segment.start;
    const label = task?.label ?? (segment.type === "slack" ? "Available, unallocated time" : "Unavailable — not usable slack");
    const block = makeElement("div", task ? String(task.color + 1) : "", "timeline-block");
    block.style.flex = `0 0 ${duration / span * 100}%`;
    block.dataset.type = segment.type;
    if (task) block.dataset.color = String(task.color);
    block.title = `${formatMinute(segment.start)}–${formatMinute(segment.end)} · ${label}`;
    block.setAttribute("aria-label", block.title);
    track.append(block);
    const row = makeElement("li", undefined, task ? "schedule-row" : "schedule-row gap-row");
    if (task) row.dataset.color = String(task.color);
    row.append(makeElement("span", `${formatMinute(segment.start)}–${formatMinute(segment.end)}`, "schedule-time"));
    const marker = makeElement("span", "", "schedule-marker");
    marker.setAttribute("aria-hidden", "true");
    row.append(marker);
    const description = makeElement("span", label, "schedule-name");
    if (task) description.append(makeElement("span",
      `${task.id} · ${task.kind}${task.fixedStart !== null ? " · fixed start" : ""}${task.dependsOn.length ? ` · after ${task.dependsOn.join(", ")}` : ""}`,
      "schedule-subtitle"));
    row.append(description, makeElement("span", `${duration} min`, "schedule-duration"));
    list.append(row);
  }
  content.replaceChildren(list);
  byElementId("timeline-state").textContent = `${schedule.length}/${agenda.tasks.length} TASKS VERIFIED`;
}

function renderConflict(analysis) {
  const core = analysis.conflict;
  byElementId("conflict-panel").hidden = analysis.feasibility.status !== "infeasible";
  if (analysis.feasibility.status !== "infeasible") return;
  byElementId("conflict-title").textContent = core.minimumCardinalityProven
    ? `${core.taskIds.length} commitment${core.taskIds.length === 1 ? "" : "s"} form the smallest task conflict.`
    : "Proven conflict. Core minimum not yet proven.";
  byElementId("conflict-message").textContent = core.explanation;
  const list = byElementId("conflict-list");
  list.replaceChildren();
  const agenda = analysis.agenda;
  for (const id of core.taskIds) {
    const task = core.constraints.find(constraint => constraint.type === "task" && constraint.id === id);
    const item = makeElement("li", `${task.label} · ${task.duration} min`);
    item.append(makeElement("small", `Window: ${formatWindows(task.availability) || "none"}${task.fixedStart !== null ? ` · fixed ${formatMinute(task.fixedStart)}` : ""}${task.dependsOn.length ? ` · after ${task.dependsOn.join(", ")}` : ""}`));
    list.append(item);
  }
  byElementId("core-proof").textContent = `Unchanged day: ${formatMinute(agenda.day.start)}–${formatMinute(agenda.day.end)}; availability ${formatWindows(agenda.day.availability) || "none"}. Single track. ${core.subsetsChecked} subsets checked, ${core.nodesVisited} nodes. ${core.scope ?? "The full set is a valid conflict, not a claimed smallest core."} Core subsets are diagnostics only; no task has been removed from your agenda.`;
  byElementId("constraint-json").textContent = JSON.stringify(core.constraints, null, 2);
}

function renderRepairs(analysis) {
  const repairs = analysis.repairs;
  const show = analysis.feasibility.status === "infeasible" || analysis.feasibility.status === "unproven";
  byElementId("repair-panel").hidden = !show;
  if (!show) return;
  byElementId("repair-title").textContent = repairs.status === "minimum-proven" ? "Smallest changes, proved."
    : repairs.status === "none-within-policy" ? "No permitted repair works." : "No minimum is claimed.";
  byElementId("repair-message").textContent = repairs.message;
  const choices = byElementId("repair-choices");
  choices.replaceChildren();
  for (const choice of repairs.choices) {
    const card = makeElement("article", undefined, "repair-choice");
    card.append(makeElement("h3", `Option ${choice.id.split("-")[1]} · keep all ${analysis.agenda.tasks.length} commitments`));
    card.append(makeElement("span", `PROVEN COST: ${choice.cost.changedFields} FIELD${choice.cost.changedFields === 1 ? "" : "S"} / ${choice.cost.totalMinutes} MINUTES`, "repair-cost"));
    const changes = makeElement("ul");
    for (const change of choice.changes) changes.append(makeElement("li", describeChange(change, analysis.agenda)));
    card.append(changes);
    card.append(makeElement("p", "A complete schedule has been verified for this proposed input. Original availability, dependencies and fixed events are unchanged.", "field-help"));
    const button = makeElement("button", "Approve this change & show the schedule");
    button.type = "button";
    button.addEventListener("click", () => {
      if (currentAnalysis !== analysis) return;
      try {
        const repaired = applyRepair(analysis.agenda, choice);
        loadEditor(repaired, `Locally approved proposal: ${choice.changes.map(change => describeChange(change, analysis.agenda)).join(" ")} No calendar event was booked.`);
        runAnalysis();
      } catch (error) { showError(error.message); }
    });
    card.append(button);
    choices.append(card);
  }
  const proof = repairs.proof;
  byElementId("repair-proof").textContent = proof
    ? `${proof.candidatesChecked} candidate checks / ${proof.candidateSpaceSize} permitted nonzero vectors. ${proof.nodesVisited} search nodes. ${repairs.minimumProven ? `${proof.lowerCostCandidatesChecked} strictly cheaper candidates conclusively excluded. ${proof.tiesComplete ? "All tied optima shown." : "Additional tied optima may exist; the displayed costs are still proven minimum."}` : "No global minimality statement outside the declared repair family."}`
    : "Increase the search bound or simplify the declared model. A stopped search is not impossibility.";
}

function renderAnalysis(analysis) {
  const { feasibility, agenda } = analysis;
  const titles = {
    feasible: "Every commitment has a place.",
    infeasible: "This agenda cannot fit as written.",
    unproven: "The answer is not proven yet.",
    invalid: "Let's fix the input first.",
    unsupported: "This model cannot assess that input.",
  };
  const badges = { feasible: "FEASIBLE · WITNESS VERIFIED", infeasible: "INFEASIBLE · PROVEN", unproven: "UNKNOWN · SEARCH BOUND", invalid: "INVALID INPUT", unsupported: "UNSUPPORTED MODEL" };
  byElementId("result-card").dataset.status = feasibility.status;
  byElementId("result-badge").textContent = badges[feasibility.status];
  byElementId("result-title").textContent = titles[feasibility.status];
  byElementId("result-message").textContent = feasibility.message;
  byElementId("proof-note").textContent = `Proof type: ${feasibility.proof.kind}. ${feasibility.stats.nodesVisited} feasibility nodes visited. No task is optional to the solver.`;
  if (!agenda) {
    byElementId("export-analysis").disabled = true;
    showError(feasibility.issues.map(item => `${item.path}: ${item.message}`).join("\n"));
    return;
  }
  byElementId("metric-commitments").textContent = String(agenda.tasks.reduce((sum, task) => sum + task.duration, 0));
  byElementId("metric-available").textContent = String(agenda.day.availability.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(end, agenda.day.end) - Math.max(start, agenda.day.start)), 0));
  byElementId("metric-tasks").textContent = `${agenda.tasks.length}/${agenda.tasks.length}`;
  renderTimeline(agenda, feasibility.schedule);
  renderConflict(analysis);
  renderRepairs(analysis);
  byElementId("export-analysis").disabled = false;
}

function runAnalysis() {
  if (running) { rerunRequested = true; return; }
  clearError();
  let input;
  try { input = readEditor(); }
  catch (error) { showError(error.message); return; }
  const revision = editorRevision;
  running = true;
  byElementId("solve").disabled = true;
  byElementId("result-message").textContent = "Checking the bounded exact model…";
  const maxNodes = Number(byElementId("search-budget").value);
  setTimeout(() => {
    try {
      if (revision !== editorRevision) return;
      const analysis = analyzeAgenda(input, { maxNodes });
      currentAnalysis = analysis.agenda ? analysis : null;
      renderAnalysis(analysis);
    } catch (error) {
      currentAnalysis = null;
      clearResults();
      byElementId("export-analysis").disabled = true;
      byElementId("result-badge").textContent = "NO RESULT";
      byElementId("result-message").textContent = "The calculation did not complete; no schedule or impossibility is claimed.";
      showError(error.message);
    } finally {
      running = false;
      byElementId("solve").disabled = false;
      if (rerunRequested) { rerunRequested = false; runAnalysis(); }
    }
  }, 30);
}

function downloadJson(content, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2) + "\n"], { type: "application/json" }));
  const link = makeElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importText(text) {
  const parsed = parseImport(text);
  if (!parsed.ok) { showError(parsed.message); return; }
  loadEditor(parsed.agenda, "Explicitly imported local JSON. Classification and availability are declarations, not externally verified facts.");
}

byElementId("agenda-form").addEventListener("submit", event => { event.preventDefault(); runAnalysis(); });
byElementId("agenda-form").addEventListener("input", invalidate);
byElementId("agenda-form").addEventListener("change", invalidate);
byElementId("task-list").addEventListener("click", event => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  button.closest(".task-row").remove();
  invalidate();
  byElementId("add-task").focus();
});
byElementId("add-task").addEventListener("click", () => {
  if (byElementId("task-list").children.length >= LIMITS.maxTasks) return;
  const ids = new Set([...byElementId("task-list").children].map(row => row.dataset.taskId));
  while (ids.has(`task-${nextTaskNumber}`)) nextTaskNumber++;
  const id = `task-${nextTaskNumber++}`;
  let windows;
  try { windows = parseWindows(byElementId("day-windows").value); }
  catch (error) { showError(error.message); return; }
  const duration = Number(byElementId("step").value) * 2;
  const row = createTaskRow({ id, label: "New commitment", duration, availability: windows, dependsOn: [], fixedStart: null, kind: "task" }, duration);
  byElementId("task-list").append(row);
  invalidate();
  row.querySelector("input").focus();
});
byElementId("load-preset").addEventListener("click", () => {
  const id = byElementId("preset").value;
  loadEditor(getPreset(id), PRESET_INFO.find(preset => preset.id === id).detail);
  runAnalysis();
});
byElementId("import-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  const revision = editorRevision;
  try {
    if (file.size > 65536) throw new RangeError("Choose a JSON file no larger than 64 KiB.");
    const text = await file.text();
    if (revision !== editorRevision) throw new Error("The editor changed while the file was read. Import again to avoid replacing those edits.");
    importText(text);
  } catch (error) { showError(error.message); }
  finally { event.target.value = ""; }
});
byElementId("apply-json").addEventListener("click", () => importText(byElementId("json-input").value));
byElementId("refresh-json").addEventListener("click", () => {
  try { byElementId("json-input").value = JSON.stringify(readEditor(), null, 2); }
  catch (error) { showError(error.message); }
});
byElementId("export-input").addEventListener("click", () => {
  try { downloadJson(createExport(readEditor(), null), "agenda-pocket-input.json"); }
  catch (error) { showError(error.message); }
});
byElementId("export-analysis").addEventListener("click", () => {
  if (!currentAnalysis) return;
  try { downloadJson(createExport(readEditor(), currentAnalysis), "agenda-pocket-analysis.json"); }
  catch (error) { showError(error.message); }
});

loadEditor(getPreset("library"), PRESET_INFO[0].detail);
runAnalysis();
