export const AGENDA_SCHEMA = "agenda-planner/1";
export const ENGINE_VERSION = "1.0.0";
export const LIMITS = Object.freeze({
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
export const REPAIR_OBJECTIVE = Object.freeze({
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

export function validateAgenda(input) {
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

export function solveAgenda(input, options = {}) {
  const settings = optionsFor(options);
  const validation = validateAgenda(input);
  if (validation.status !== "valid") return rejected(validation);
  return solveValidated(validation.agenda, { used: 0, limit: settings.maxNodes });
}

export function verifySchedule(input, schedule) {
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

export function explainConflict(input, options = {}) {
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

export function findRepairs(input, options = {}) {
  const settings = optionsFor(options);
  const validation = validateAgenda(input);
  if (validation.status !== "valid") return { status: validation.status, issues: validation.issues, choices: [], minimumProven: false };
  const feasibility = solveValidated(validation.agenda, { used: 0, limit: settings.maxNodes });
  return repairsValidated(validation.agenda, settings, feasibility);
}

export function applyRepair(input, choice) {
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

export function analyzeAgenda(input, options = {}) {
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
