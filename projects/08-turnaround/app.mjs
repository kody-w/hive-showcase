import { INPUTS, EXPERIMENTS, STUDY } from "./data.mjs";
import { simulate, dateForDay } from "./model.mjs";
import { escapeHtml, formatMoney, dayLabel, aggregateTimeline, cashChartSvg } from "./view-model.mjs";

const uiElement = id => document.getElementById(id);
const uiBaseline = simulate(INPUTS);
const uiStarts = { ...EXPERIMENTS.search.schedules[0].starts };
const uiState = {
  mode: "recovery", selected: new Set(STUDY.candidate.plan.map(row => row.id)),
  starts: { ...uiStarts }, assumptions: { ...INPUTS.model.defaults },
  inspectDay: STUDY.candidate.firstFloorDay ?? 0, timelineMode: "weekly"
};
const uiRanges = [
  ["delay", "receiptDelayDays", 1, " days"],
  ["demand", "demandBps", 100, "%"],
  ["advance", "acceleratedBps", 100, "%"],
  ["support", "supportSliceMinutes", 1, " min"],
  ["review", "reviewCapacityMinutes", 1, " min"],
  ["warning-lead", "warningLeadDays", 1, " days"]
];
const uiConsents = [
  ["contractor-consent", "contractorConsent"], ["hosting-consent", "hostingValidated"],
  ["receipt-consent", "receiptConsent"], ["deferral-consent", "deferralConsent"]
];
let uiCurrentResult = null;

function uiMetric(label, value, note, isFailure = false) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong class="${isFailure ? "failure" : ""}">${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
}

function uiMoneyCell(cents) {
  return `<td class="money ${cents < 0 ? "negative" : ""}">${formatMoney(cents)}</td>`;
}

function uiCreateControls() {
  uiElement("scenario-controls").innerHTML = EXPERIMENTS.scenarios.map(scenario =>
    `<button type="button" id="scenario-${scenario.id}" aria-pressed="false">${escapeHtml(scenario.title)}</button>`
  ).join("");
  uiElement("action-controls").innerHTML = INPUTS.model.actions.map(action => `
    <div class="action-card" id="card-${action.id}">
      <label for="action-${action.id}"><input type="checkbox" id="action-${action.id}"><span>${escapeHtml(action.title)}</span></label>
      <p>${escapeHtml(action.description)}</p>
      <span class="action-meta">${formatMoney(action.costCents)} sunk · ${action.leadDays}d lead · ${action.workdays} workdays</span>
      <div class="start-row"><label for="start-${action.id}">Request D</label><input type="number" id="start-${action.id}" min="1" max="90" step="1" value="${uiStarts[action.id]}" aria-label="${escapeHtml(action.title)} requested start day"><span class="action-status" id="status-${action.id}">Not selected</span></div>
    </div>`).join("");
  for (const scenario of EXPERIMENTS.scenarios) {
    uiElement(`scenario-${scenario.id}`).addEventListener("click", () => uiLoadScenario(scenario.id));
  }
  for (const action of INPUTS.model.actions) {
    uiElement(`action-${action.id}`).addEventListener("change", event => {
      if (event.target.checked) uiState.selected.add(action.id);
      else uiState.selected.delete(action.id);
      uiState.mode = "custom";
      uiRender();
    });
    uiElement(`start-${action.id}`).addEventListener("input", event => {
      uiState.starts[action.id] = Number(event.target.value);
      uiState.mode = "custom";
      uiRender();
    });
  }
  for (const [id, key, scale] of uiRanges) {
    uiElement(id).addEventListener("input", event => {
      uiState.assumptions[key] = Number(event.target.value) * scale;
      uiState.mode = "custom";
      uiRender();
    });
  }
  for (const [id, key] of uiConsents) {
    uiElement(id).addEventListener("change", event => {
      uiState.assumptions[key] = event.target.checked;
      uiState.mode = "custom";
      uiRender();
    });
  }
  uiElement("reset").addEventListener("click", () => uiLoadScenario("recovery"));
  uiElement("inspect-day").addEventListener("input", event => {
    uiState.inspectDay = Number(event.target.value);
    if (uiCurrentResult) uiRenderChart(uiCurrentResult);
  });
  uiElement("timeline-mode").addEventListener("change", event => {
    uiState.timelineMode = event.target.value;
    if (uiCurrentResult) uiRenderTimeline(uiCurrentResult);
  });
}

function uiLoadScenario(id) {
  const scenario = EXPERIMENTS.scenarios.find(row => row.id === id);
  const plan = scenario.useCandidate ? STUDY.candidate.plan : [];
  uiState.mode = id;
  uiState.selected = new Set(plan.map(row => row.id));
  uiState.starts = { ...uiStarts, ...Object.fromEntries(plan.map(row => [row.id, row.startDay])) };
  uiState.assumptions = { ...INPUTS.model.defaults, ...scenario.assumptions };
  uiState.inspectDay = STUDY.scenarios.find(row => row.id === id).summary.firstFloorDay ?? 0;
  uiRender();
}

function uiSyncControls() {
  for (const scenario of EXPERIMENTS.scenarios) {
    uiElement(`scenario-${scenario.id}`).setAttribute("aria-pressed", String(uiState.mode === scenario.id));
  }
  for (const action of INPUTS.model.actions) {
    const selected = uiState.selected.has(action.id);
    uiElement(`action-${action.id}`).checked = selected;
    uiElement(`start-${action.id}`).disabled = !selected;
    const start = uiElement(`start-${action.id}`);
    if (Number(start.value) !== uiState.starts[action.id]) start.value = uiState.starts[action.id];
    uiElement(`card-${action.id}`).classList.toggle("active", selected);
  }
  for (const [id, key, scale, suffix] of uiRanges) {
    uiElement(id).value = uiState.assumptions[key] / scale;
    uiElement(`${id}-output`).textContent = `${uiState.assumptions[key] / scale}${suffix}`;
  }
  for (const [id, key] of uiConsents) uiElement(id).checked = uiState.assumptions[key];
}

function uiRenderChart(result) {
  uiElement("cash-chart").innerHTML = cashChartSvg(result, uiBaseline, INPUTS.case.cashFloorCents, uiState.inspectDay);
  uiElement("inspect-day").value = uiState.inspectDay;
  uiElement("inspect-day-output").textContent = `${uiState.inspectDay} · ${dateForDay(INPUTS, uiState.inspectDay)}`;
  const row = result.daily[uiState.inspectDay];
  const events = result.events.filter(event => event.day === row.day);
  uiElement("day-detail").innerHTML = `
    <p><strong>D${row.day} · ${row.date}</strong> · ${row.counterfactual ? "<span class=\"failure\">After an unfunded payment: counterfactual</span>" : "Conditional executable-prefix arithmetic"}</p>
    <p>Lowest available: <strong>${formatMoney(row.troughAvailableCents)}</strong> · Closing available: <strong>${formatMoney(row.availableCents)}</strong> · Reserve remaining: ${formatMoney(row.reserveCents)}</p>
    ${events.length ? `<ul>${events.map(event =>
      `<li>${escapeHtml(event.id)}: ${event.deltaCents < 0 ? "−" : "+"}${formatMoney(event.amountCents)} → scheduled bank ${formatMoney(event.cashAfterCents)}</li>`
    ).join("")}</ul>` : "<p>No scheduled cash event. Resource work may still consume the one-time budget.</p>"}`;
}

function uiRenderTimeline(result) {
  const rows = aggregateTimeline(result.daily, uiState.timelineMode);
  uiElement("timeline-table").innerHTML = `<table><caption class="sr-only">Scheduled cash timeline; negative amounts are funding requirements</caption>
    <thead><tr><th scope="col">Period</th><th scope="col" class="money">Receipts</th><th scope="col" class="money">Outflows</th><th scope="col" class="money">Closing bank</th><th scope="col" class="money">Reserved</th><th scope="col" class="money">Lowest available</th><th scope="col">Interpretation</th></tr></thead>
    <tbody>${rows.map(row => `<tr class="${row.counterfactual ? "counterfactual-row" : ""}"><th scope="row">${escapeHtml(row.label)}<small>${row.date}</small></th>${uiMoneyCell(row.receiptsCents)}${uiMoneyCell(row.outflowsCents)}${uiMoneyCell(row.cashCents)}${uiMoneyCell(row.reserveCents)}${uiMoneyCell(row.troughAvailableCents)}<td>${row.counterfactual ? "Includes counterfactual events" : "Conditional schedule"}</td></tr>`).join("")}</tbody></table>`;
}

function uiRenderWarnings(result) {
  const floor = result.firstFloorBreach;
  const failed = result.firstUnfundedPayment;
  uiElement("warning-detail").innerHTML = `<div class="warning-box">
    <p><strong>Earliest forecast warning: ${dayLabel(result.warning.earliestForecastDay)}.</strong> All scheduled risks are visible at the outset. Do not wait for a rolling alert.</p>
    <p>${floor ? `Strict floor breach: <strong>D${floor.day} · ${floor.date}</strong>, at ${formatMoney(floor.availableCents)} available after <code>${escapeHtml(floor.eventId)}</code>.` : "No strict floor breach in this bounded window. That is not a guarantee beyond it."}</p>
    <p>${failed ? `First unfunded bill: <strong>D${failed.day} · ${failed.date}</strong>. ${formatMoney(failed.availableBeforeCents)} cannot fund ${formatMoney(failed.requiredCents)}; shortfall ${formatMoney(failed.shortfallCents)}.` : "No unfunded payment within the modeled window."}</p>
    <p class="small muted">Separate ${result.warning.leadDays}-day policy alerts: floor ${dayLabel(result.warning.floorEscalationDay)}, funding ${dayLabel(result.warning.fundingEscalationDay)}. Equality with the $12,000 floor is not a breach.</p>
    </div>`;
  const chain = [
    `<strong>Start with the ledger, not new money.</strong> ${formatMoney(uiBaseline.daily[0].cashCents)} cash less ${formatMoney(uiBaseline.daily[0].reserveCents)} prior obligations leaves ${formatMoney(uiBaseline.daily[0].availableCents)}. The smoothed 49.7-day floor estimate hides dated payments.`
  ];
  if (!result.resources.feasible) {
    chain.push("<strong>The proposed action set is infeasible.</strong> Its benefits and fees are not applied. The displayed cash path is explicitly the no-action diagnostic under these receipt stresses.");
  } else {
    for (const action of result.resources.actions) {
      let effect = "";
      if (!action.consentAssumed) effect = "Consent/validation is not assumed: there is no benefit, but work and any start fee stay consumed.";
      else if (action.id === "contractor-cut") effect = "Only complete billing cycles beginning after readiness can use the $1,500 contractor rate. The first $3,000 invoice is not magically cancelled.";
      else if (action.id === "hosting-cut") effect = "Only later full cycles may use $1,600 hosting. Engineering minutes used here cannot also repair the queue.";
      else if (action.id === "receipt-pull") effect = `${result.assumptions.acceleratedBps / 100}% of eligible existing receipts moves ten days earlier. Each dollar is removed from the regular receipt, then the stress delay applies to both pieces.`;
      else if (action.id === "defer-payable") effect = "The $2,500 principal remains reserved until day 40. A $125 added fee is reserved too; 120 support minutes are lost. This is not a saving.";
      else if (action.id === "queue-repair") effect = "The seed's 360 engineering minutes are reserved for a review/repair sequence. No new receipts, retention or completed deployment are credited.";
      else effect = `${result.supportSlice.selected.length} tickets (${result.supportSlice.usedMinutes} minutes) are prospectively selected only. Blocked and deferred work stays visible; no revenue is attached.`;
      chain.push(`<strong>${escapeHtml(action.title)}: D${action.startDay} → ready D${action.readyDay}.</strong> ${effect} Sunk start fee: ${formatMoney(action.costCents)}.`);
    }
  }
  chain.push(`<strong>The recurring deficit survives.</strong> Final-cycle outflows exceed its demand-adjusted assumed receipts by ${formatMoney(result.summary.endingCycleRecurringBurnCents)} per 30 modeled days. ${result.summary.recoveryExistsWithinHorizon ? "No failure in this window does not prove sustainability." : "This is containment, not a sustainable rescue."}`);
  if (failed && result.summary.finalScheduledCashCents >= 0) {
    chain.push(`<strong>A positive endpoint can still fail.</strong> The ${formatMoney(result.summary.finalScheduledCashCents)} scheduled endpoint arrives after an unfunded bill on D${failed.day}. Later receipts cannot retroactively meet the deadline.`);
  }
  uiElement("causal-chain").innerHTML = chain.map(text => `<li>${text}</li>`).join("");
  const c = result.receiptConservation;
  uiElement("conservation").innerHTML = `<strong>Two conservation checks</strong>
    <p class="equation">${formatMoney(uiBaseline.daily[0].cashCents)} + ${formatMoney(result.summary.receiptsWithinHorizonCents)} − ${formatMoney(result.summary.outflowsWithinHorizonCents)} = ${formatMoney(result.summary.finalScheduledCashCents)}</p>
    <small>Opening bank + within-window receipts − required within-window outflows = scheduled endpoint. Counterfactual after failure; not a realized cash balance.</small>
    <p class="equation">${formatMoney(c.scheduledWithinHorizonCents)} in-window + ${formatMoney(c.scheduledAfterHorizonCents)} later = ${formatMoney(c.assumedCyclePoolCents)}</p>
    <small>Same demand-adjusted receipt pool. Timing-created revenue: ${formatMoney(c.timingCreatedReceiptsCents)}. Beyond-window money is not spent inside this window.</small>`;
}

function uiRenderResources(result) {
  const r = result.resources;
  uiElement("resource-bars").innerHTML = ["engineering", "support", "review"].map(bucket => {
    const over = r.used[bucket] > r.capacity[bucket];
    const width = r.capacity[bucket] ? Math.min(100, r.used[bucket] / r.capacity[bucket] * 100) : r.used[bucket] ? 100 : 0;
    return `<div class="resource"><div><strong>${bucket}</strong><span class="${over ? "failure" : ""}">${r.used[bucket]} / ${r.capacity[bucket]} min</span></div><div class="meter ${over ? "over" : ""}"><span style="width:${width}%"></span></div><small>${bucket === "review" ? "Added one-time budget" : "Seed one-time budget"}${bucket === "support" && r.lostSupportMinutes ? `, reduced by ${r.lostSupportMinutes}` : ""}</small></div>`;
  }).join("");
  uiElement("resource-issues").innerHTML = r.issues.length ?
    `<p class="small failure"><strong>Rejected before execution.</strong> Resource bars show the invalid proposal, not resources actually consumed.</p><ul class="issue-list">${r.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` :
    `<p class="small muted">Conditional planned use, never actual work performed. No weekly replenishment. Daily caps: ${r.dailyCapacity.engineering} engineering / ${r.dailyCapacity.support} support / ${r.dailyCapacity.review} review minutes.</p>`;
  uiElement("support-detail").innerHTML = `<p class="small"><strong>${result.supportSlice.selected.length} prospective selections, ${result.supportSlice.usedMinutes} support minutes.</strong> ${result.supportSlice.blocked.length} blocked / ${result.supportSlice.deferred.length} capacity-deferred. Overlapping affected accounts are not added together.</p>
    <div class="ticket-chips">${result.supportSlice.selected.map(id => `<span>${escapeHtml(id)} · planned</span>`).join("") || "<span>No support allocation</span>"}</div>
    <p class="small muted">Blocked: ${result.supportSlice.blocked.map(escapeHtml).join(", ") || "none"}. Deferred: ${result.supportSlice.deferred.map(escapeHtml).join(", ") || "none"}. No ticket is marked completed.</p>`;
  uiElement("action-timing").innerHTML = `<table><caption class="sr-only">Proposed action lead times and sunk costs</caption><thead><tr><th scope="col">Action</th><th scope="col">Requested / actual start</th><th scope="col">Ready</th><th scope="col" class="money">Sunk fee</th><th scope="col">Outcome assumption</th></tr></thead><tbody>${r.actions.map(action => `<tr><th scope="row">${escapeHtml(action.title)}</th><td>D${action.requestedStartDay} / D${action.startDay}</td><td>D${action.readyDay}</td>${uiMoneyCell(action.costCents)}<td>${!r.feasible ? "Plan rejected" : action.consentAssumed ? "Conditional; unverified" : "Fails; fee is lost"}</td></tr>`).join("") || "<tr><td colspan=\"5\">No intervention selected.</td></tr>"}</tbody></table>`;
  uiElement("daily-capacity").innerHTML = `<table><caption class="sr-only">Daily working-minute allocation, not replenished capacity</caption><thead><tr><th scope="col">Day</th><th scope="col">Engineering</th><th scope="col">Support</th><th scope="col">Review</th><th scope="col">Work</th></tr></thead><tbody>${r.dailyAllocation.map(row => `<tr><th scope="row">D${row.day}</th><td>${row.engineering}</td><td>${row.support}</td><td>${row.review}</td><td>${row.actionIds.map(escapeHtml).join(", ")}</td></tr>`).join("") || "<tr><td colspan=\"5\">No action resource reservations.</td></tr>"}</tbody></table>`;
  for (const action of INPUTS.model.actions) {
    const planned = r.actions.find(row => row.id === action.id);
    uiElement(`status-${action.id}`).textContent = planned ?
      (!r.feasible ? "Plan rejected" : !planned.consentAssumed ? "Fee, no benefit" : `Ready D${planned.readyDay}`) : "Not selected";
  }
}

function uiRenderCommitments(result) {
  const bills = [...result.events, ...result.afterHorizon].filter(event => event.kind !== "receipt").sort((a, b) => a.day - b.day);
  uiElement("commitments").innerHTML = `<table><caption class="sr-only">All modeled payment commitments, including beyond-window obligations</caption>
    <thead><tr><th scope="col">Due</th><th scope="col">Commitment & cause</th><th scope="col" class="money">Required</th><th scope="col">Status</th></tr></thead><tbody>${bills.map(event =>
      `<tr class="${event.status?.startsWith("counterfactual") ? "counterfactual-row" : ""}"><th scope="row">D${event.day}<small>${event.date}</small></th><td><span class="commitment-name">${escapeHtml(event.id)}</span><small>${escapeHtml(event.cause)}${event.day !== event.originalDay ? ` Original due D${event.originalDay}.` : ""}</small></td>${uiMoneyCell(event.amountCents)}<td>${event.day > result.horizonDays ? "Outside window, still due" : event.status.startsWith("counterfactual") ? "Unfunded path; not paid" : "Conditional schedule, not actual payment"}</td></tr>`
    ).join("")}</tbody></table>`;
  uiElement("outside-window").innerHTML = `<p class="small muted"><strong>Beyond-window receipt pool:</strong> ${formatMoney(result.receiptConservation.scheduledAfterHorizonCents)}. <strong>Prior-payable reserve at window end:</strong> ${formatMoney(result.summary.finalPriorPayableReserveCents)}.</p>`;
}

function uiRender() {
  uiSyncControls();
  try {
    const plan = INPUTS.model.actions.filter(action => uiState.selected.has(action.id)).map(action => ({
      id: action.id, startDay: uiState.starts[action.id]
    }));
    const result = simulate(INPUTS, plan, uiState.assumptions);
    uiCurrentResult = result;
    const s = result.summary;
    uiElement("boot-message").hidden = true;
    uiElement("scenario-label").textContent = uiState.mode === "custom" ? "Custom · conditional plan" :
      EXPERIMENTS.scenarios.find(row => row.id === uiState.mode).title;
    uiElement("decision").innerHTML = !s.actionPlanFeasible ?
      "<h3>That action set does not fit.</h3><p>Prerequisites or resource constraints are violated. No selected intervention is applied below: this is the no-action exposure under the selected receipt stresses. Fix the red resource/sequence issues.</p>" :
      s.recoveryExistsWithinHorizon ?
        "<h3>No modeled failure inside this window.</h3><p>This is a bounded conditional result, not a guarantee of rescue or future sustainability. Physical feasibility and all action outcomes remain unverified.</p>" :
        `<h3>No feasible rescue in this 90-day schedule.</h3><p>${s.firstFloorDay === null ? "The floor holds within the window." : `The floor fails at D${s.firstFloorDay}.`} ${s.firstUnfundedDay === null ? "Scheduled bills are fundable within the window, but the guardrail is not protected." : `A required payment cannot be funded at D${s.firstUnfundedDay}.`} A later positive endpoint does not erase a missed deadline.</p>`;
    uiElement("metrics").innerHTML =
      uiMetric("First floor breach", dayLabel(s.firstFloorDay), s.firstFloorDay === null ? "Strictly below $12,000" : dateForDay(INPUTS, s.firstFloorDay), s.firstFloorDay !== null) +
      uiMetric("First unfunded bill", dayLabel(s.firstUnfundedDay), s.firstUnfundedDay === null ? "Not observed in window" : dateForDay(INPUTS, s.firstUnfundedDay), s.firstUnfundedDay !== null) +
      uiMetric("Earliest forecast alert", dayLabel(s.earliestWarningDay), "Full-information warning, not the rolling escalation") +
      uiMetric("Irreversible start fees", formatMoney(s.scheduledActionCostsCents), "Modeled costs; not actual spending");
    uiRenderChart(result);
    uiRenderTimeline(result);
    uiRenderWarnings(result);
    uiRenderResources(result);
    uiRenderCommitments(result);
    uiElement("announcer").textContent = `${uiElement("scenario-label").textContent}. ${s.actionPlanFeasible ? "Action resources fit." : "Action plan rejected."} Floor ${dayLabel(s.firstFloorDay)}. Unfunded payment ${dayLabel(s.firstUnfundedDay)}. Earliest forecast alert ${dayLabel(s.earliestWarningDay)}.`;
  } catch (error) {
    uiCurrentResult = null;
    uiElement("decision").innerHTML = `<h3>Invalid model input</h3><p>${escapeHtml(error.message)}. Results are cleared rather than showing a stale success.</p>`;
    uiElement("scenario-label").textContent = "Invalid input";
    for (const id of ["metrics", "cash-chart", "day-detail", "timeline-table", "warning-detail", "causal-chain", "conservation", "resource-bars", "resource-issues", "support-detail", "action-timing", "daily-capacity", "commitments", "outside-window"]) {
      uiElement(id).innerHTML = "";
    }
    uiElement("announcer").textContent = `Invalid input: ${error.message}`;
  }
}

function uiRenderFrozenStudy() {
  uiElement("scenario-comparison").innerHTML = `<table><caption class="sr-only">Frozen scenarios, not recomputed by custom controls</caption><thead><tr><th scope="col">Scenario</th><th scope="col">Floor day</th><th scope="col">Unfunded day</th><th scope="col">First warning</th><th scope="col" class="money">Lowest bank requirement</th><th scope="col" class="money">Scheduled endpoint</th><th scope="col">Recovery?</th></tr></thead><tbody>${STUDY.scenarios.map(row =>
    `<tr><th scope="row" class="scenario-name">${escapeHtml(row.title)}</th><td>${dayLabel(row.summary.firstFloorDay)}</td><td>${dayLabel(row.summary.firstUnfundedDay)}</td><td>${dayLabel(row.summary.earliestWarningDay)}</td>${uiMoneyCell(row.summary.minimumCashCents)}${uiMoneyCell(row.summary.finalScheduledCashCents)}<td>${row.summary.recoveryExistsWithinHorizon ? "Within-window only" : "No"}</td></tr>`
  ).join("")}</tbody></table>`;
  uiElement("search-note").innerHTML = `<div><b>${STUDY.evaluatedCount} strategies</b>64 action subsets × 2 fixed start schedules. ${STUDY.validCount} resource/sequence-valid, ${STUDY.rejectedCount} rejected.</div><div><b>${STUDY.floorAndFundingSurvivors} complete escapes</b>None protects both floor and funding for the full window in this finite grid. Not a universal impossibility proof.</div><div><b>${escapeHtml(STUDY.candidate.id)}</b>Rank: later floor, later funding failure, more prospective urgent tickets, higher endpoint, lower fees, stable ID.</div>`;
  const grid = EXPERIMENTS.search.thresholdScan;
  uiElement("threshold-table").innerHTML = `<table><caption class="sr-only">Discrete sensitivity scan; cells show floor day / unfunded day</caption><thead><tr><th scope="col">Demand retained ↓ / delay →</th>${grid.receiptDelayDays.map(day => `<th scope="col">+${day}d</th>`).join("")}</tr></thead><tbody>${grid.demandBps.map(demand => `<tr><th scope="row">${demand / 100}%</th>${grid.receiptDelayDays.map(delay => {
    const row = STUDY.thresholds.find(cell => cell.demandBps === demand && cell.receiptDelayDays === delay);
    return `<td class="threshold-cell">${dayLabel(row.firstFloorDay)} / ${dayLabel(row.firstUnfundedDay)}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table>`;
  uiElement("assumption-notes").innerHTML = INPUTS.model.definitions.map(note => `<div class="assumption-note"><strong>ASSUMPTION / ${escapeHtml(note.id)}</strong><p>${escapeHtml(note.text)}</p></div>`).join("");
}

uiCreateControls();
uiRenderFrozenStudy();
uiRender();
