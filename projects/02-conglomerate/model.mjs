export const WEEKLY_MINUTES = 300;
export const SCORE_EPSILON = 1e-9;

export function initialScenario(data) {
  return {
    budgetMinutes: WEEKLY_MINUTES,
    reserveMinutes: data.initial.reserveMinutes,
    reviewMinutes: data.initial.reviewMinutes,
    maxActive: 1,
    mode: "micro",
    weights: { ...data.initial.weights },
    ventures: data.ventures.map(v => ({
      id: v.id, name: v.name, learning: v.learning, reuse: v.reuse,
      confidence: v.confidence, deliveryMinutes: v.deliveryMinutes,
      testPrepMinutes: v.testPrepMinutes, seedMinutes: v.seedHours * 60,
      ready: v.dependency.ready
    }))
  };
}

const whole = (value, minimum = 0, maximum = 10000) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;

export function validateScenario(scenario) {
  const issues = [];
  if (scenario.budgetMinutes !== WEEKLY_MINUTES) issues.push("The whole-week hard budget must remain exactly 300 minutes.");
  if (scenario.maxActive !== 1) issues.push("This one-offering extension permits exactly one active venture at most.");
  if (!whole(scenario.reserveMinutes)) issues.push("Reserve must be a nonnegative whole number of minutes.");
  if (!whole(scenario.reviewMinutes)) issues.push("Review must be a nonnegative whole number of minutes.");
  if (!["micro", "seed"].includes(scenario.mode)) issues.push("Choose micro-offer or original seed-duration scope.");
  const weights = ["learning", "reuse", "speed"].map(key => scenario.weights?.[key]);
  if (weights.some(w => !Number.isFinite(w) || w < 0 || w > 10)) issues.push("Each weight must be between 0 and 10.");
  else if (weights.reduce((sum, w) => sum + w, 0) === 0) issues.push("At least one objective weight must be positive.");
  if (!Array.isArray(scenario.ventures) || scenario.ventures.length !== 5) {
    issues.push("All five distinct ventures must remain in the comparison.");
    return issues;
  }
  const ids = new Set();
  for (const v of scenario.ventures) {
    if (typeof v.id !== "string" || !v.id || ids.has(v.id)) issues.push("Venture IDs must be nonempty and unique.");
    ids.add(v.id);
    if (!whole(v.deliveryMinutes, 1) || !whole(v.testPrepMinutes) || !whole(v.seedMinutes, 1)) issues.push(`${v.name}: use whole minutes; delivery must be positive.`);
    if (!whole(v.learning, 1, 5) || !whole(v.reuse, 1, 5)) issues.push(`${v.name}: learning and reuse must be integers from 1 to 5.`);
    if (!whole(v.confidence, 0, 100)) issues.push(`${v.name}: subjective confidence must be an integer from 0 to 100.`);
    if (typeof v.ready !== "boolean") issues.push(`${v.name}: state offline prerequisite readiness explicitly.`);
  }
  return issues;
}

export function ventureMinutes(venture, scenario) {
  return scenario.mode === "seed" ? venture.seedMinutes : venture.deliveryMinutes + venture.testPrepMinutes;
}

export function rankVentures(scenario) {
  const issues = validateScenario(scenario);
  if (issues.length) return { valid: false, issues, candidates: [], recommended: null, tiedIds: [], margin: null };
  const w = scenario.weights;
  const denominator = w.learning + w.reuse + w.speed;
  const candidates = scenario.ventures.map(v => {
    const unitMinutes = ventureMinutes(v, scenario);
    const totalMinutes = unitMinutes + scenario.reviewMinutes;
    const speed = Math.max(0, (WEEKLY_MINUTES - totalMinutes) / WEEKLY_MINUTES);
    const score = (w.learning * v.learning / 5 + w.reuse * v.reuse / 5 + w.speed * speed) / denominator * v.confidence;
    const reasons = [];
    if (!v.ready) reasons.push("Offline prerequisite marked unavailable.");
    if (totalMinutes + scenario.reserveMinutes > WEEKLY_MINUTES) {
      reasons.push(`Needs ${totalMinutes + scenario.reserveMinutes} minutes including reserve; exceeds 300 by ${totalMinutes + scenario.reserveMinutes - WEEKLY_MINUTES}.`);
    }
    return { id: v.id, name: v.name, score, unitMinutes, totalMinutes, speed, feasible: reasons.length === 0, reasons };
  });
  candidates.sort((a, b) =>
    Number(b.feasible) - Number(a.feasible) ||
    (Math.abs(b.score - a.score) > SCORE_EPSILON ? b.score - a.score : 0) ||
    a.totalMinutes - b.totalMinutes ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const feasible = candidates.filter(c => c.feasible);
  const winner = feasible[0]?.score > SCORE_EPSILON ? feasible[0] : null;
  const tiedIds = winner ? feasible.filter(c => Math.abs(c.score - winner.score) <= SCORE_EPSILON).map(c => c.id) : [];
  if (!feasible.length) issues.push("No venture fits the current capacity and offline prerequisites. Park all five; do not relax constraints silently.");
  else if (!winner) issues.push("All feasible scores are zero. The objective supplies no positive modeled reason to choose one.");
  return {
    valid: true, issues, candidates, recommended: winner?.id ?? null, tiedIds,
    margin: winner && feasible.length > 1 ? winner.score - feasible[1].score : null
  };
}

export function recommendedAllocation(scenario) {
  const ranking = rankVentures(scenario);
  return Object.fromEntries(scenario.ventures.map(v => [
    v.id, v.id === ranking.recommended ? ventureMinutes(v, scenario) : 0
  ]));
}

export function auditAllocation(scenario, allocations) {
  const issues = validateScenario(scenario);
  const ids = new Set(scenario.ventures.map(v => v.id));
  for (const id of Object.keys(allocations)) {
    if (!ids.has(id)) issues.push("Allocation contains an unknown venture.");
  }
  let allocatedMinutes = 0;
  const active = [];
  for (const v of scenario.ventures) {
    const minutes = allocations[v.id] ?? 0;
    if (!whole(minutes)) {
      issues.push(`${v.name}: allocation must be a nonnegative whole number of minutes.`);
      continue;
    }
    allocatedMinutes += minutes;
    if (minutes === 0) continue;
    active.push(v.id);
    if (!v.ready) issues.push(`${v.name}: its offline prerequisite is unavailable.`);
    const minimum = ventureMinutes(v, scenario);
    if (minutes < minimum) issues.push(`${v.name}: ${minutes} minutes cannot deliver the ${minimum}-minute minimum; partially funding it does not create an offering.`);
  }
  if (active.length > 1) issues.push(`${active.length} ventures are funded; this extension allows at most one. Choose rather than fragment the week.`);
  const reviewMinutes = active.length ? scenario.reviewMinutes : 0;
  const usedMinutes = allocatedMinutes + reviewMinutes + scenario.reserveMinutes;
  const unusedMinutes = WEEKLY_MINUTES - usedMinutes;
  if (unusedMinutes < 0) issues.push(`Over budget by ${-unusedMinutes} minutes; the cap is still 300.`);
  return {
    feasible: issues.length === 0, issues, active, allocatedMinutes, reviewMinutes,
    reserveMinutes: scenario.reserveMinutes, usedMinutes, unusedMinutes, budgetMinutes: WEEKLY_MINUTES
  };
}

export function sensitivity(scenario) {
  if (validateScenario(scenario).length) return [];
  const leader = rankVentures(scenario).recommended;
  const cases = [
    ["Current assumptions", () => {}],
    ["No speed preference", s => { s.weights.speed = 0; }],
    ["Speed weight = 4", s => { s.weights.speed = 4; }],
    ["Speed only", s => { s.weights = { learning: 0, reuse: 0, speed: 10 }; }],
    ["Leader confidence −10 points", s => {
      const v = s.ventures.find(v => v.id === leader);
      if (v) v.confidence = Math.max(0, v.confidence - 10);
    }],
    ["All delivery + preparation estimates +25%", s => {
      for (const v of s.ventures) {
        v.deliveryMinutes = Math.ceil(v.deliveryMinutes * 1.25);
        v.testPrepMinutes = Math.ceil(v.testPrepMinutes * 1.25);
        v.seedMinutes = Math.ceil(v.seedMinutes * 1.25);
      }
    }],
    ["Leader prerequisite withheld", s => {
      const v = s.ventures.find(v => v.id === leader);
      if (v) v.ready = false;
    }],
    ["Reserve +60 minutes", s => { s.reserveMinutes += 60; }]
  ];
  return cases.map(([label, modify]) => {
    const changed = structuredClone(scenario);
    modify(changed);
    const ranking = rankVentures(changed);
    const winner = ranking.candidates.find(c => c.id === ranking.recommended);
    return {
      label, recommended: ranking.recommended, name: winner?.name ?? "No recommendation",
      score: winner?.score ?? null, totalMinutes: winner?.totalMinutes ?? null,
      changed: ranking.recommended !== leader, valid: ranking.valid
    };
  });
}
