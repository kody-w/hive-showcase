// GENERATED ONLY FROM ORIGINAL LOCAL ES MODULES. Rebuild: node projects/05-planner/tools/build.mjs
// Classic-script packaging permits direct file:// use; no downloaded starter code is included.
(() => {
"use strict";
// engine.mjs sha256:66a9abbcc9c3a0c00dc7841ed5b36c78a3d3349a74bf80178202818d791974cf
const AGENDA_SCHEMA = "agenda-planner/1";
const ENGINE_VERSION = "1.0.0";
const LIMITS = Object.freeze({
  maxTasks: 8,
  maxSlots: 120,
  maxWindows: 16,
  steps: Object.freeze([1, 5, 10, 15, 30, 60]),
  defaultNodes: 20000,
  defaultCoreNodes: 20000,
  defaultRepairNodes: 60000,
  defaultRepairCandidates: 2500,
  hardNodes: 1000000,
  hardRepairCandidates: 100000,
});
const REPAIR_OBJECTIVE = Object.freeze({
  id: "fewest-fields-then-minutes/1",
  order: Object.freeze(["changedFields", "totalMinutes"]),
  scope: "Extend the day cutoff within declared availability, or shorten explicitly negotiable, unfixed task time budgets. Keep every task, dependency, window and fixed start.",
});

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const integer = value => Number.isSafeInteger(value);
const copyData = value => JSON.parse(JSON.stringify(value));
const taskIdPattern = /^[a-z][a-z0-9-]{0,31}$/;

function mergeWindows(windows) {
  const result = [];
  for (const [start, end] of windows.map(pair => [...pair]).sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}

function covers(windows, start, end) {
  return windows.some(([left, right]) => left <= start && end <= right);
}

function availableMinutes(day) {
  return day.availability.reduce((sum, [start, end]) =>
    sum + Math.max(0, Math.min(end, day.end) - Math.max(start, day.start)), 0);
}

function validateAgenda(input) {
  const issues = [];
  const issue = (path, message, code = "invalid") => issues.push({ path, message, code });
  const keys = (value, allowed, path) => {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) issue(`${path}.${key}`, "This field/constraint is not supported; it will not be ignored.", "unsupported");
    }
  };
  const text = (value, path, max) => {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      issue(path, `Use nonempty text of at most ${max} characters.`);
  };
  const minute = (value, path, upper = 1440) => {
    if (!integer(value) || value < 0 || value > upper)
      issue(path, `Use an integer minute between 0 and ${upper}.`);
  };
  const finish = agenda => {
    const status = issues.some(item => item.code === "invalid") ? "invalid"
      : issues.length ? "unsupported" : "valid";
    return { status, issues, agenda: status === "valid" ? agenda : null };
  };
  if (!isRecord(input)) {
    issue("$", "The agenda must be a JSON object.");
    return finish();
  }
  keys(input, ["schema", "title", "classification", "day", "tasks", "repairs"], "$");
  if (typeof input.schema !== "string") issue("$.schema", `A schema string is required: ${AGENDA_SCHEMA}.`);
  else if (input.schema !== AGENDA_SCHEMA) issue("$.schema", `Supported schema: ${AGENDA_SCHEMA}.`, "unsupported");
  text(input.title, "$.title", 120);
  if (!["synthetic", "user-entered"].includes(input.classification))
    issue("$.classification", 'Use "synthetic" or "user-entered"; no research/traction claim is inferred.');
  if (!isRecord(input.day) || !Array.isArray(input.tasks)) {
    issue("$", "A day object and tasks array are required.");
    return finish();
  }
  const day = input.day;
  keys(day, ["start", "end", "stepMinutes", "availability"], "$.day");
  minute(day.start, "$.day.start", 1439);
  minute(day.end, "$.day.end");
  if (integer(day.start) && integer(day.end) && day.end <= day.start)
    issue("$.day.end", "End must follow start within one day; overnight schedules are unsupported.");
  if (!integer(day.stepMinutes) || day.stepMinutes <= 0)
    issue("$.day.stepMinutes", "The time grid must be a positive integer.");
  else if (!LIMITS.steps.includes(day.stepMinutes))
    issue("$.day.stepMinutes", `Supported grids: ${LIMITS.steps.join(", ")} minutes.`, "unsupported");
  const step = LIMITS.steps.includes(day.stepMinutes) ? day.stepMinutes : 1;
  const aligned = (value, path) => {
    if (integer(value) && value % step !== 0) issue(path, `Must align to the ${step}-minute midnight-anchored grid.`);
  };
  aligned(day.start, "$.day.start");
  aligned(day.end, "$.day.end");
  const windows = (value, path) => {
    if (!Array.isArray(value)) {
      issue(path, "Provide an array of [start, end] availability intervals; [] explicitly means no availability.");
      return [];
    }
    if (value.length > LIMITS.maxWindows) issue(path, `At most ${LIMITS.maxWindows} intervals are supported.`, "unsupported");
    const result = [];
    value.forEach((pair, index) => {
      const location = `${path}[${index}]`;
      if (!Array.isArray(pair) || pair.length !== 2) {
        issue(location, "An interval must have exactly two endpoints.");
        return;
      }
      minute(pair[0], `${location}[0]`, 1439);
      minute(pair[1], `${location}[1]`);
      aligned(pair[0], `${location}[0]`);
      aligned(pair[1], `${location}[1]`);
      if (integer(pair[0]) && integer(pair[1]) && pair[0] >= pair[1])
        issue(location, "Availability intervals must have positive length.");
      if (pair.every(integer) && pair[0] >= 0 && pair[0] < pair[1] && pair[1] <= 1440)
        result.push([...pair]);
    });
    return mergeWindows(result);
  };
  const dayWindows = windows(day.availability, "$.day.availability");
  if (input.tasks.length > LIMITS.maxTasks)
    issue("$.tasks", `Exact model supports at most ${LIMITS.maxTasks} mandatory tasks.`, "unsupported");
  const ids = new Set();
  const tasks = input.tasks.map((task, index) => {
    const path = `$.tasks[${index}]`;
    if (!isRecord(task)) {
      issue(path, "Each task must be an object.");
      return null;
    }
    keys(task, ["id", "label", "duration", "availability", "dependsOn", "fixedStart", "kind"], path);
    if (typeof task.id !== "string" || !taskIdPattern.test(task.id))
      issue(`${path}.id`, "Use a lowercase letter followed by up to 31 lowercase letters, digits or hyphens.");
    if (ids.has(task.id)) issue(`${path}.id`, "Task IDs must be unique.");
    ids.add(task.id);
    text(task.label, `${path}.label`, 120);
    if (!integer(task.duration) || task.duration <= 0 || task.duration > 1440)
      issue(`${path}.duration`, "Duration must be a positive integer of at most 1440 minutes.");
    aligned(task.duration, `${path}.duration`);
    const taskWindows = windows(task.availability, `${path}.availability`);
    if (!Array.isArray(task.dependsOn) || task.dependsOn.some(id => typeof id !== "string"))
      issue(`${path}.dependsOn`, "dependsOn must be an array of task IDs.");
    else if (new Set(task.dependsOn).size !== task.dependsOn.length)
      issue(`${path}.dependsOn`, "Do not repeat dependency IDs.");
    const fixedStart = task.fixedStart ?? null;
    if (fixedStart !== null) {
      minute(fixedStart, `${path}.fixedStart`, 1439);
      aligned(fixedStart, `${path}.fixedStart`);
    }
    const kind = task.kind ?? "task";
    if (!["task", "break", "event"].includes(kind))
      issue(`${path}.kind`, "kind is a display label: task, break or event.");
    return {
      id: task.id, label: task.label, duration: task.duration, availability: taskWindows,
      dependsOn: Array.isArray(task.dependsOn) ? [...task.dependsOn] : [], fixedStart, kind,
    };
  });
  for (const [index, task] of tasks.entries()) {
    if (task) for (const id of task.dependsOn) {
      if (!ids.has(id)) issue(`$.tasks[${index}].dependsOn`, `Unknown predecessor: ${id}.`);
    }
  }
  const policy = input.repairs === undefined ? {} : input.repairs;
  let latestEnd = day.end;
  let durationFloors = {};
  if (!isRecord(policy)) issue("$.repairs", "repairs must be an object, or omitted for no permitted changes.");
  else {
    keys(policy, ["latestEnd", "durationFloors"], "$.repairs");
    latestEnd = policy.latestEnd === undefined ? day.end : policy.latestEnd;
    minute(latestEnd, "$.repairs.latestEnd");
    aligned(latestEnd, "$.repairs.latestEnd");
    if (integer(latestEnd) && integer(day.end) && latestEnd < day.end)
      issue("$.repairs.latestEnd", "Latest permitted cutoff cannot precede the current cutoff.");
    const floors = policy.durationFloors ?? {};
    if (!isRecord(floors)) issue("$.repairs.durationFloors", "Use an object mapping task IDs to minimum negotiated minutes.");
    else {
      durationFloors = { ...floors };
      for (const [id, floor] of Object.entries(floors)) {
        const task = tasks.find(item => item?.id === id);
        const path = `$.repairs.durationFloors.${id}`;
        if (!task) issue(path, "Duration floor refers to an unknown task.");
        if (!integer(floor) || floor <= 0 || (task && floor > task.duration))
          issue(path, "A floor must be positive and no greater than the current duration.");
        aligned(floor, path);
        if (task && task.fixedStart !== null && floor !== task.duration)
          issue(path, "Fixed events cannot be shortened by this repair policy.");
      }
    }
  }
  if (integer(latestEnd) && integer(day.start) && (latestEnd - day.start) / step > LIMITS.maxSlots)
    issue("$.day", `The full day/repair envelope may span at most ${LIMITS.maxSlots} grid slots.`, "unsupported");
  return finish({
    schema: AGENDA_SCHEMA, title: input.title, classification: input.classification,
    day: { start: day.start, end: day.end, stepMinutes: day.stepMinutes, availability: dayWindows },
    tasks, repairs: { latestEnd, durationFloors },
  });
}

function optionsFor(options = {}) {
  if (!isRecord(options)) throw new TypeError("Engine options must be an object.");
  const defaults = {
    maxNodes: LIMITS.defaultNodes,
    maxCoreNodes: LIMITS.defaultCoreNodes,
    maxCoreChecks: 255,
    maxRepairNodes: LIMITS.defaultRepairNodes,
    maxRepairCandidates: LIMITS.defaultRepairCandidates,
    maxChoices: 4,
  };
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(defaults, key)) throw new TypeError(`Unknown engine option: ${key}`);
    const max = key === "maxChoices" ? 20 : key === "maxCoreChecks" ? 255
      : key === "maxRepairCandidates" ? LIMITS.hardRepairCandidates : LIMITS.hardNodes;
    if (!integer(value) || value < (key === "maxChoices" ? 1 : 0) || value > max)
      throw new RangeError(`${key} must be an integer in ${key === "maxChoices" ? 1 : 0}..${max}.`);
    defaults[key] = value;
  }
  return defaults;
}

function findCycle(tasks) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const colors = new Map();
  const stack = [];
  function visit(id) {
    if (colors.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    if (colors.get(id) === 2) return null;
    colors.set(id, 1);
    stack.push(id);
    for (const predecessor of byId.get(id).dependsOn) {
      const cycle = visit(predecessor);
      if (cycle) return cycle;
    }
    stack.pop();
    colors.set(id, 2);
    return null;
  }
  for (const task of tasks) {
    const cycle = visit(task.id);
    if (cycle) return cycle;
  }
  return null;
}

function solveValidated(agenda, budget) {
  const before = budget.used;
  const { day, tasks } = agenda;
  const result = (status, message, proof, schedule = null) => ({
    schema: "agenda-planner-solution/1", status, message, schedule, proof,
    stats: { nodesVisited: budget.used - before, nodeLimit: budget.limit, totalNodesVisited: budget.used },
  });
  const cycle = findCycle(tasks);
  if (cycle) return result("infeasible", "Positive-duration tasks form a dependency cycle; each cannot finish before the next starts.",
    { kind: "dependency-cycle", taskIds: cycle, complete: true });
  const required = tasks.reduce((sum, task) => sum + task.duration, 0);
  const available = availableMinutes(day);
  if (required > available) return result("infeasible",
    `${required} committed minutes exceed ${available} declared available minutes by ${required - available}.`,
    { kind: "capacity", requiredMinutes: required, availableMinutes: available, excessMinutes: required - available, complete: true });
  const domains = tasks.map(task => {
    const positions = [];
    for (let start = day.start; start + task.duration <= day.end; start += day.stepMinutes) {
      const end = start + task.duration;
      if (task.fixedStart !== null && task.fixedStart !== start) continue;
      if (!covers(day.availability, start, end) || !covers(task.availability, start, end)) continue;
      const slot = (start - day.start) / day.stepMinutes;
      const length = task.duration / day.stepMinutes;
      positions.push({ taskId: task.id, start, end, duration: task.duration,
        mask: ((1n << BigInt(length)) - 1n) << BigInt(slot) });
    }
    return positions;
  });
  const empty = domains.findIndex(domain => domain.length === 0);
  if (empty !== -1) return result("infeasible",
    `"${tasks[empty].label}" has no contiguous placement satisfying its duration, windows, fixed start and the day bounds.`,
    { kind: "empty-domain", taskIds: [tasks[empty].id], complete: true });
  for (let a = 0; a < tasks.length; a++) for (let b = a + 1; b < tasks.length; b++) {
    if (tasks[a].fixedStart !== null && tasks[b].fixedStart !== null && (domains[a][0].mask & domains[b][0].mask) !== 0n)
      return result("infeasible", "Two fixed events overlap on the single agenda track.",
        { kind: "fixed-collision", taskIds: [tasks[a].id, tasks[b].id], complete: true });
  }
  if (!tasks.length) return result("feasible", "The empty agenda satisfies all constraints.", { kind: "witness", complete: true }, []);
  const indices = new Map(tasks.map((task, index) => [task.id, index]));
  const predecessors = tasks.map(task => task.dependsOn.map(id => indices.get(id)));
  const successors = tasks.map((_, index) => tasks.flatMap((task, other) => predecessors[other].includes(index) ? [other] : []));
  const assigned = Array(tasks.length).fill(null);
  let witness = null;
  function visit(occupied, count) {
    if (budget.used >= budget.limit) return "unproven";
    budget.used++;
    if (count === tasks.length) {
      witness = assigned.map(({ mask, ...entry }) => entry).sort((a, b) => a.start - b.start || a.taskId.localeCompare(b.taskId));
      return "feasible";
    }
    let chosen = -1;
    let candidates = null;
    for (let index = 0; index < tasks.length; index++) {
      if (assigned[index]) continue;
      const possible = domains[index].filter(position =>
        (position.mask & occupied) === 0n
        && predecessors[index].every(other => !assigned[other] || assigned[other].end <= position.start)
        && successors[index].every(other => !assigned[other] || position.end <= assigned[other].start));
      if (!possible.length) return "infeasible";
      if (candidates === null || possible.length < candidates.length) {
        candidates = possible;
        chosen = index;
      }
    }
    for (const position of candidates) {
      assigned[chosen] = position;
      const outcome = visit(occupied | position.mask, count + 1);
      assigned[chosen] = null;
      if (outcome !== "infeasible") return outcome;
    }
    return "infeasible";
  }
  const status = visit(0n, 0);
  if (status === "feasible") return result(status, "Every commitment fits; the complete schedule is a checkable witness.",
    { kind: "witness", complete: true }, witness);
  if (status === "unproven") return result(status, "Search bound reached. Feasibility is unknown; this is not a proof of impossibility.",
    { kind: "search-bound", complete: false });
  return result(status, "Every legal placement was excluded by exhaustive search. No schedule exists in the declared discrete model.",
    { kind: "exhaustive-search", complete: true });
}

function rejected(validation) {
  return {
    schema: "agenda-planner-solution/1", status: validation.status, schedule: null,
    message: validation.status === "unsupported" ? "This input is outside the supported model; feasibility was not assessed."
      : "Input is malformed; feasibility was not assessed.",
    issues: validation.issues, proof: { kind: "not-assessed", complete: false },
    stats: { nodesVisited: 0, nodeLimit: 0, totalNodesVisited: 0 },
  };
}

function solveAgenda(input, options = {}) {
  const settings = optionsFor(options);
  const validation = validateAgenda(input);
  if (validation.status !== "valid") return rejected(validation);
  return solveValidated(validation.agenda, { used: 0, limit: settings.maxNodes });
}

function verifySchedule(input, schedule) {
  const validation = validateAgenda(input);
  if (validation.status !== "valid") return { valid: false, issues: validation.issues };
  const agenda = validation.agenda;
  const issues = [];
  const error = message => issues.push(message);
  if (!Array.isArray(schedule)) return { valid: false, issues: ["A schedule array is required."] };
  if (schedule.length !== agenda.tasks.length) error("Schedule must contain every task exactly once.");
  const tasks = new Map(agenda.tasks.map(task => [task.id, task]));
  const entries = new Map();
  for (const entry of schedule) {
    if (!isRecord(entry)) { error("Malformed schedule entry."); continue; }
    const task = tasks.get(entry.taskId);
    if (!task) { error(`Unknown scheduled task: ${entry.taskId}`); continue; }
    if (entries.has(task.id)) error(`Repeated task: ${task.id}`);
    entries.set(task.id, entry);
    if (![entry.start, entry.end, entry.duration].every(integer)) {
      error(`Noninteger time: ${task.id}`);
      continue;
    }
    if (entry.duration !== task.duration || entry.end - entry.start !== task.duration) error(`Duration mismatch: ${task.id}`);
    if (entry.start % agenda.day.stepMinutes || entry.end % agenda.day.stepMinutes) error(`Off-grid placement: ${task.id}`);
    if (entry.start < agenda.day.start || entry.end > agenda.day.end) error(`Outside day bounds: ${task.id}`);
    if (!covers(agenda.day.availability, entry.start, entry.end) || !covers(task.availability, entry.start, entry.end))
      error(`Outside declared availability: ${task.id}`);
    if (task.fixedStart !== null && entry.start !== task.fixedStart) error(`Moved fixed event: ${task.id}`);
  }
  for (const task of agenda.tasks) {
    if (!entries.has(task.id)) error(`Missing task: ${task.id}`);
    for (const id of task.dependsOn) {
      if (entries.has(id) && entries.has(task.id) && entries.get(id).end > entries.get(task.id).start)
        error(`Dependency violated: ${id} must finish before ${task.id}.`);
    }
  }
  const ordered = [...entries.values()].sort((a, b) => a.start - b.start);
  for (let index = 1; index < ordered.length; index++) {
    if (ordered[index - 1].end > ordered[index].start)
      error(`Overlap: ${ordered[index - 1].taskId} and ${ordered[index].taskId}.`);
  }
  return { valid: !issues.length, issues };
}

function* combinations(length, size, start = 0, prefix = []) {
  if (!size) { yield prefix; return; }
  for (let index = start; index <= length - size; index++)
    yield* combinations(length, size - 1, index + 1, [...prefix, index]);
}

function taskSubset(agenda, selected) {
  const ids = new Set(selected.map(index => agenda.tasks[index].id));
  return {
    ...agenda,
    tasks: selected.map(index => ({ ...agenda.tasks[index], dependsOn: agenda.tasks[index].dependsOn.filter(id => ids.has(id)) })),
  };
}

function coreConstraints(agenda, ids) {
  const selected = new Set(ids);
  return [
    { type: "day-bounds", start: agenda.day.start, end: agenda.day.end },
    { type: "day-availability", windows: copyData(agenda.day.availability) },
    { type: "single-track", nonPreemptive: true, allSelectedTasksMandatory: true },
    ...agenda.tasks.filter(task => selected.has(task.id)).map(task => ({
      type: "task", ...copyData(task), dependsOn: task.dependsOn.filter(id => selected.has(id)),
    })),
  ];
}

function conflictValidated(agenda, settings, feasibility) {
  if (feasibility.status !== "infeasible") return {
    status: feasibility.status === "unproven" ? "unproven" : "not-applicable",
    taskIds: [], minimumCardinalityProven: false,
    explanation: feasibility.status === "unproven" ? "Feasibility is unknown; no conflict or smallest core is claimed." : "A feasible witness exists; no conflict core is needed.",
  };
  const budget = { used: 0, limit: settings.maxCoreNodes };
  let checked = 0;
  const fallback = () => ({
    status: "unproven-minimum", taskIds: agenda.tasks.map(task => task.id),
    constraints: coreConstraints(agenda, agenda.tasks.map(task => task.id)),
    minimumCardinalityProven: false, proof: feasibility.proof,
    explanation: "The full task set is proven conflicting, but the bounded search did not prove a smallest task core.",
    subsetsChecked: checked, nodesVisited: budget.used,
  });
  for (let size = 1; size <= agenda.tasks.length; size++) {
    for (const selected of combinations(agenda.tasks.length, size)) {
      if (checked >= settings.maxCoreChecks) return fallback();
      checked++;
      const subset = taskSubset(agenda, selected);
      const outcome = solveValidated(subset, budget);
      if (outcome.status === "unproven") return fallback();
      if (outcome.status === "infeasible") return {
        status: "minimum-proven", taskIds: subset.tasks.map(task => task.id),
        constraints: coreConstraints(agenda, subset.tasks.map(task => task.id)),
        minimumCardinalityProven: true, proof: outcome.proof, explanation: outcome.message,
        scope: "One minimum-cardinality task subset, with induced dependencies and unchanged day constraints. Not a minimum atomic-constraint set.",
        subsetsChecked: checked, nodesVisited: budget.used,
      };
    }
  }
  throw new Error("Internal contradiction: the original infeasible task set must be a conflicting subset.");
}

function explainConflict(input, options = {}) {
  const settings = optionsFor(options);
  const validation = validateAgenda(input);
  if (validation.status !== "valid") return { status: validation.status, issues: validation.issues };
  const feasibility = solveValidated(validation.agenda, { used: 0, limit: settings.maxNodes });
  return conflictValidated(validation.agenda, settings, feasibility);
}

function repairVariables(agenda) {
  const step = agenda.day.stepMinutes;
  const variables = [];
  if (agenda.repairs.latestEnd > agenda.day.end)
    variables.push({ type: "extend-day", from: agenda.day.end, cap: (agenda.repairs.latestEnd - agenda.day.end) / step });
  for (const task of agenda.tasks) {
    const floor = Object.hasOwn(agenda.repairs.durationFloors, task.id) ? agenda.repairs.durationFloors[task.id] : task.duration;
    if (floor < task.duration) variables.push({ type: "shorten-task", taskId: task.id, from: task.duration, cap: (task.duration - floor) / step });
  }
  return variables;
}

function* compositions(variables, remaining, index = 0, prefix = []) {
  if (index === variables.length) {
    if (remaining === 0) yield prefix;
    return;
  }
  const rest = variables.slice(index + 1);
  const restMax = rest.reduce((sum, variable) => sum + variable.cap, 0);
  const low = Math.max(1, remaining - restMax);
  const high = Math.min(variables[index].cap, remaining - rest.length);
  for (let value = low; value <= high; value++)
    yield* compositions(variables, remaining - value, index + 1, [...prefix, value]);
}

function candidateFromChanges(agenda, changes) {
  const next = copyData(agenda);
  for (const change of changes) {
    if (change.type === "extend-day") next.day.end = change.to;
    else next.tasks.find(task => task.id === change.taskId).duration = change.to;
  }
  return next;
}

function repairsValidated(agenda, settings, feasibility) {
  const common = { objective: REPAIR_OBJECTIVE, choices: [] };
  if (feasibility.status === "feasible") return { ...common, status: "not-needed" };
  if (feasibility.status !== "infeasible") return {
    ...common, status: "unproven", message: "Original feasibility is unknown; no minimality claim is made.",
    minimumProven: false,
  };
  const variables = repairVariables(agenda);
  const candidateSpaceSize = (variables.reduce((product, variable) => product * BigInt(variable.cap + 1), 1n) - 1n).toString();
  const budget = { used: 0, limit: settings.maxRepairNodes };
  let checked = 0;
  let optimum = null;
  let lowerCostCandidatesChecked = null;
  const choices = [];
  const finish = (status, tiesComplete, message) => ({
    ...common, status, message, choices, minimumProven: optimum !== null, optimum,
    proof: {
      method: "Cost-ordered exhaustive finite repair enumeration plus exact feasibility checks",
      cheaperCandidatesComplete: optimum !== null,
      allCandidatesComplete: status === "none-within-policy",
      lowerCostCandidatesChecked, candidatesChecked: checked, candidateSpaceSize,
      tiesComplete, nodesVisited: budget.used, nodeLimit: budget.limit, candidateLimit: settings.maxRepairCandidates,
      originalInfeasibility: feasibility.proof,
    },
  });
  const cut = reason => finish(optimum ? "minimum-proven" : "unproven", false, optimum
    ? `The minimum cost is proven; additional tied choices were not fully enumerated (${reason}).`
    : `Repair search stopped (${reason}). A repair may exist; neither minimality nor absence is proven.`);
  for (let fields = 1; fields <= variables.length; fields++) {
    const maxUnits = variables.map(variable => variable.cap).sort((a, b) => b - a).slice(0, fields).reduce((a, b) => a + b, 0);
    for (let units = fields; units <= maxUnits; units++) {
      const beforeGroup = checked;
      for (const selected of combinations(variables.length, fields)) {
        const active = selected.map(index => variables[index]);
        if (active.reduce((sum, variable) => sum + variable.cap, 0) < units) continue;
        for (const amounts of compositions(active, units)) {
          if (checked >= settings.maxRepairCandidates) return cut("candidate bound");
          const changes = active.map((variable, index) => ({
            type: variable.type, ...(variable.taskId ? { taskId: variable.taskId } : {}),
            from: variable.from,
            to: variable.from + (variable.type === "extend-day" ? 1 : -1) * amounts[index] * agenda.day.stepMinutes,
          }));
          const candidate = candidateFromChanges(agenda, changes);
          checked++;
          const outcome = solveValidated(candidate, budget);
          if (outcome.status === "unproven") return cut("node bound");
          if (outcome.status === "feasible") {
            if (!optimum) {
              optimum = { changedFields: fields, totalMinutes: units * agenda.day.stepMinutes };
              lowerCostCandidatesChecked = beforeGroup;
            }
            choices.push({
              id: `repair-${choices.length + 1}`, cost: { ...optimum }, changes,
              agenda: candidate, schedule: outcome.schedule,
            });
            if (choices.length >= settings.maxChoices) return cut("display-choice bound");
          }
        }
      }
      if (optimum) return finish("minimum-proven", true, "Every cheaper allowed repair is proven infeasible. These are the minimum-cost choices.");
    }
  }
  return finish("none-within-policy", true,
    "Every allowed repair was ruled out. No repair exists within this policy; this is not a claim about changes outside it.");
}

function findRepairs(input, options = {}) {
  const settings = optionsFor(options);
  const validation = validateAgenda(input);
  if (validation.status !== "valid") return { status: validation.status, issues: validation.issues, choices: [], minimumProven: false };
  const feasibility = solveValidated(validation.agenda, { used: 0, limit: settings.maxNodes });
  return repairsValidated(validation.agenda, settings, feasibility);
}

function applyRepair(input, choice) {
  const validation = validateAgenda(input);
  if (validation.status !== "valid") throw new TypeError("Cannot repair an invalid or unsupported agenda.");
  if (!isRecord(choice) || !Array.isArray(choice.changes) || !choice.changes.length)
    throw new TypeError("A repair choice with explicit changes and a witness schedule is required.");
  const agenda = validation.agenda;
  const seen = new Set();
  for (const change of choice.changes) {
    if (!isRecord(change) || !["extend-day", "shorten-task"].includes(change.type))
      throw new TypeError("Unknown repair operation.");
    const field = change.type === "extend-day" ? "day" : `task:${change.taskId}`;
    if (seen.has(field)) throw new TypeError("A field cannot be changed twice.");
    seen.add(field);
    if (!integer(change.to) || change.to % agenda.day.stepMinutes) throw new RangeError("Repair must use the declared grid.");
    if (change.type === "extend-day") {
      if (change.from !== agenda.day.end || change.to <= change.from || change.to > agenda.repairs.latestEnd)
        throw new RangeError("Day extension is stale or outside the declared policy.");
    } else {
      const task = agenda.tasks.find(task => task.id === change.taskId);
      const floor = task && Object.hasOwn(agenda.repairs.durationFloors, task.id) ? agenda.repairs.durationFloors[task.id] : task?.duration;
      if (!task || task.fixedStart !== null || change.from !== task.duration || change.to >= change.from || change.to < floor)
        throw new RangeError("Duration change is stale, fixed, or outside the declared policy.");
    }
  }
  const next = candidateFromChanges(agenda, choice.changes);
  if (!verifySchedule(next, choice.schedule).valid)
    throw new RangeError("The proposed repair has no valid complete witness schedule.");
  return next;
}

function analyzeAgenda(input, options = {}) {
  const settings = optionsFor(options);
  const validation = validateAgenda(input);
  if (validation.status !== "valid") return {
    schema: "agenda-planner-analysis/1", engineVersion: ENGINE_VERSION,
    agenda: null, feasibility: rejected(validation), conflict: { status: "not-assessed" },
    repairs: { status: "not-assessed", choices: [] }, limits: { ...LIMITS }, settings,
  };
  const agenda = validation.agenda;
  const feasibility = solveValidated(agenda, { used: 0, limit: settings.maxNodes });
  return {
    schema: "agenda-planner-analysis/1", engineVersion: ENGINE_VERSION, agenda,
    feasibility, conflict: conflictValidated(agenda, settings, feasibility),
    repairs: repairsValidated(agenda, settings, feasibility), limits: { ...LIMITS }, settings,
  };
}

// presets.mjs sha256:d34d05e0d6ad0a82ee05e44aa0093cc298e7070d8d083f1ebe139bac73e5c3e8
const libraryPreset = {
  schema: "agenda-planner/1",
  title: "Library kit • every topic committed",
  classification: "synthetic",
  day: { start: 540, end: 600, stepMinutes: 1, availability: [[540, 630]] },
  tasks: [
    { id: "welcome", label: "Confirm the decision to make", duration: 5, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "stock-review", label: "Review fictional kit stock", duration: 10, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "decision", label: "Choose the sample kit scope", duration: 20, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "template-demo", label: "Optional template demonstration", duration: 15, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "risk-check", label: "Check assumptions and open questions", duration: 10, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "roundup", label: "Collect optional follow-up ideas", duration: 8, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "wrap", label: "Wrap & next steps", duration: 5, availability: [[540, 630]], dependsOn: ["welcome", "stock-review", "decision", "template-demo", "risk-check", "roundup"], fixedStart: null, kind: "break" },
  ],
  repairs: { latestEnd: 630, durationFloors: { "template-demo": 2 } },
};

const arcadePreset = {
  schema: "agenda-planner/1",
  title: "Pocket Arcade tournament",
  classification: "synthetic",
  day: { start: 840, end: 915, stepMinutes: 5, availability: [[840, 930]] },
  tasks: [
    { id: "check-in", label: "Player check-in & rules", duration: 10, availability: [[840, 850]], dependsOn: [], fixedStart: 840, kind: "event" },
    { id: "round-one", label: "Pocket Arcade • qualifying round", duration: 20, availability: [[850, 930]], dependsOn: ["check-in"], fixedStart: null, kind: "task" },
    { id: "break-one", label: "Screen break & score check", duration: 5, availability: [[850, 930]], dependsOn: ["round-one"], fixedStart: null, kind: "break" },
    { id: "round-two", label: "Pocket Arcade • semifinal", duration: 20, availability: [[850, 930]], dependsOn: ["break-one"], fixedStart: null, kind: "task" },
    { id: "break-two", label: "Reset & rest", duration: 5, availability: [[850, 930]], dependsOn: ["round-two"], fixedStart: null, kind: "break" },
    { id: "final", label: "Pocket Arcade • final", duration: 20, availability: [[850, 930]], dependsOn: ["break-two"], fixedStart: null, kind: "task" },
    { id: "results", label: "Results & thank-you", duration: 5, availability: [[850, 930]], dependsOn: ["final"], fixedStart: null, kind: "task" },
  ],
  repairs: { latestEnd: 930, durationFloors: { "round-one": 10, "round-two": 10, final: 10 } },
};

const splitPreset = {
  schema: "agenda-planner/1",
  title: "Enough minutes, nowhere to put them",
  classification: "synthetic",
  day: { start: 540, end: 600, stepMinutes: 5, availability: [[540, 555], [575, 600]] },
  tasks: [
    { id: "deep-work", label: "One uninterrupted design session", duration: 30, availability: [[540, 600]], dependsOn: [], fixedStart: null, kind: "task" },
  ],
  repairs: { latestEnd: 600, durationFloors: { "deep-work": 25 } },
};

const boundaryPreset = {
  schema: "agenda-planner/1",
  title: "An exact midnight finish",
  classification: "synthetic",
  day: { start: 1380, end: 1440, stepMinutes: 5, availability: [[1380, 1440]] },
  tasks: [
    { id: "setup", label: "Setup at 23:00", duration: 30, availability: [[1380, 1440]], dependsOn: [], fixedStart: 1380, kind: "event" },
    { id: "round", label: "Final round", duration: 25, availability: [[1380, 1440]], dependsOn: ["setup"], fixedStart: null, kind: "task" },
    { id: "close", label: "Close before midnight", duration: 5, availability: [[1380, 1440]], dependsOn: ["round"], fixedStart: null, kind: "break" },
  ],
  repairs: { latestEnd: 1440, durationFloors: {} },
};

const PRESET_INFO = Object.freeze([
  { id: "library", title: "Library kit • overloaded", detail: "Adapted MIT seed data. All six topics are now mandatory, plus wrap. The after-10:00 availability and negotiation floor are new synthetic assumptions, not source facts. The old “optional” words are labels, not permission to omit." },
  { id: "arcade", title: "Pocket Arcade tournament", detail: "Federation demonstration only. Seven commitments, two preserved breaks, one fixed check-in. 85 minutes cannot fit a 75-minute cutoff. Venue availability through 15:30 and shorter round budgets are explicitly synthetic." },
  { id: "split", title: "Disjoint availability", detail: "40 available minutes do not contain a 30-minute contiguous window. Tasks cannot be split across unavailable time." },
  { id: "boundary", title: "Boundary-valid • midnight", detail: "Half-open intervals may meet at a boundary. The last task ends at 24:00; no minute is invented." },
]);

function getPreset(id) {
  const sources = { library: libraryPreset, arcade: arcadePreset, split: splitPreset, boundary: boundaryPreset };
  if (!Object.hasOwn(sources, id)) throw new RangeError("Unknown preset.");
  return JSON.parse(JSON.stringify(sources[id]));
}

// editor.mjs sha256:4fc41b34deb74fb30d983eef286bb938c98c26eb1f3323ecf822aa3405a195f6

function formatMinute(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1440) return "—";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function parseMinute(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value.trim()))
    throw new TypeError(`Use HH:MM between 00:00 and 24:00, not "${value}".`);
  const [hour, minute] = value.trim().split(":").map(Number);
  return hour * 60 + minute;
}

function formatWindows(windows) {
  return windows.map(([start, end]) => `${formatMinute(start)}–${formatMinute(end)}`).join(", ");
}

function parseWindows(value) {
  if (!value.trim()) return [];
  return value.split(",").map(part => {
    const pair = part.trim().split(/\s*[-–]\s*/);
    if (pair.length !== 2) throw new TypeError("Use availability like 09:00–10:00, 10:30–11:00.");
    return pair.map(parseMinute);
  });
}

function parseImport(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > 65536)
    return { ok: false, message: "Choose a JSON file no larger than 64 KiB." };
  let data;
  try { data = JSON.parse(text); }
  catch { return { ok: false, message: "That file is not valid JSON. The current editor has not changed." }; }
  if (data?.schema === "agenda-planner-export/1") data = data.agenda;
  const validation = validateAgenda(data);
  if (validation.status !== "valid") return {
    ok: false, status: validation.status,
    message: validation.issues.map(item => `${item.path}: ${item.message}`).join("\n"),
  };
  return { ok: true, agenda: validation.agenda };
}

function createExport(agenda, analysis) {
  const validation = validateAgenda(agenda);
  if (validation.status !== "valid") throw new TypeError("Export requires a valid supported input, not malformed editor text.");
  if (analysis && JSON.stringify(validation.agenda) !== JSON.stringify(analysis.agenda))
    throw new RangeError("Stale analysis cannot be exported with a changed agenda.");
  return {
    schema: "agenda-planner-export/1", engineVersion: ENGINE_VERSION,
    agendaSchema: AGENDA_SCHEMA,
    content: analysis ? "current-analysis" : "input-only",
    status: analysis?.feasibility.status ?? "not-assessed",
    agenda: validation.agenda, analysis: analysis ?? null,
    notice: "Local model output, not a calendar booking, user study, or public launch. A repair changes explicit time budgets only after approval.",
  };
}

function timelineSegments(agenda, schedule) {
  const segments = [];
  let cursor = agenda.day.start;
  const ordered = [...schedule].sort((a, b) => a.start - b.start);
  const appendGap = end => {
    const cuts = new Set([cursor, end]);
    for (const [start, stop] of agenda.day.availability) {
      if (cursor < start && start < end) cuts.add(start);
      if (cursor < stop && stop < end) cuts.add(stop);
    }
    const points = [...cuts].sort((a, b) => a - b);
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1];
      const stop = points[index];
      if (start === stop) continue;
      const available = agenda.day.availability.some(([left, right]) => left <= start && stop <= right);
      segments.push({ type: available ? "slack" : "unavailable", start, end: stop });
    }
  };
  for (const entry of ordered) {
    appendGap(entry.start);
    segments.push({ type: "task", ...entry });
    cursor = entry.end;
  }
  appendGap(agenda.day.end);
  return segments;
}

// app.mjs sha256:20683e1cb376ac07d6d20a3f68c331af3eb6afbeb6bac186ea75c0feb449c823

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

})();
