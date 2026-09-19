// Generated file:// fallback from ORIGINAL project modules only. No downloaded code.
(() => {
"use strict";
const DAY_MS = 86400000;
const BUCKETS = ["engineering", "support", "review"];
const SEVERITY = { urgent: 0, normal: 1, low: 2 };
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const total = (rows, key) => rows.reduce((n, row) => n + row[key], 0);

function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function unique(rows, key, label) {
  const seen = new Set();
  for (const row of rows) {
    if (typeof row[key] !== "string" || !row[key] || seen.has(row[key])) {
      throw new Error(`${label}: missing or duplicate ${key}: ${row[key]}`);
    }
    seen.add(row[key]);
  }
}

function dateStamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}`);
  const stamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
  return stamp;
}

function dollarsToCents(value) {
  if (typeof value !== "string" || !/^\d+\.\d{2}$/.test(value)) {
    throw new Error(`Expected nonnegative decimal dollars with two places: ${value}`);
  }
  return integer(Number(value.replace(".", "")), "money cents");
}

function dateForDay(inputs, day) {
  integer(day, "day", 0, 1000);
  return new Date(dateStamp(inputs.case.asOf) + day * DAY_MS).toISOString().slice(0, 10);
}

function dayForDate(inputs, date) {
  return (dateStamp(date) - dateStamp(inputs.case.asOf)) / DAY_MS;
}

function isWorkingDay(inputs, day) {
  const weekday = new Date(`${dateForDay(inputs, day)}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

function workingDays(inputs, requested, count) {
  const days = [];
  for (let day = requested; days.length < count; day++) {
    if (isWorkingDay(inputs, day)) days.push(day);
  }
  return days;
}

function reconcile(inputs) {
  unique(inputs.ledger, "id", "ledger");
  unique(inputs.payables, "id", "payables");
  unique(inputs.subscriptions, "id", "subscriptions");
  integer(inputs.case.openingCashCents, "opening cash");
  integer(inputs.case.cashFloorCents, "cash floor");
  const months = inputs.case.months.map(month => ({
    month, receiptsCents: 0, paymentsCents: 0, billedCents: 0, netCents: 0
  }));
  for (const row of inputs.ledger) {
    dateStamp(row.date);
    integer(row.amountCents, `${row.id} amount`);
    if (!["in", "out"].includes(row.direction)) throw new Error(`Invalid direction: ${row.id}`);
    const month = months.find(m => m.month === row.date.slice(0, 7));
    if (!month) throw new Error(`Unscoped ledger date: ${row.date}`);
    month[row.direction === "in" ? "receiptsCents" : "paymentsCents"] += row.amountCents;
  }
  for (const row of inputs.subscriptions) {
    integer(row.accounts, "accounts");
    integer(row.priceCents, "price");
    const month = months.find(m => m.month === row.month);
    if (!month) throw new Error(`Unscoped subscription month: ${row.month}`);
    month.billedCents += row.accounts * row.priceCents;
  }
  let cash = inputs.case.openingCashCents;
  for (const month of months) {
    if (month.billedCents !== month.receiptsCents) {
      throw new Error(`Subscription/receipt mismatch: ${month.month}`);
    }
    month.netCents = month.receiptsCents - month.paymentsCents;
    month.openingCashCents = cash;
    month.closingCashCents = cash += month.netCents;
  }
  for (const row of inputs.payables) {
    integer(row.amountCents, `${row.id} amount`);
    if (dayForDate(inputs, row.dueOn) < 1) throw new Error(`Payable not after as-of: ${row.id}`);
  }
  const reserveCents = total(inputs.payables, "amountCents");
  const burnCents = -months.at(-1).netCents;
  const availableCents = cash - reserveCents;
  return {
    classification: "SYNTHETIC arithmetic; not an audited financial statement",
    assumption: inputs.case.accountingAssumption,
    ledgerRows: inputs.ledger.length,
    openingCashCents: inputs.case.openingCashCents,
    receiptsCents: total(months, "receiptsCents"),
    paymentsCents: total(months, "paymentsCents"),
    closingCashCents: cash,
    reserveCents,
    availableCents,
    floorCents: inputs.case.cashFloorCents,
    headroomCents: availableCents - inputs.case.cashFloorCents,
    months,
    smoothedComparison: {
      burnCentsPer30Days: burnCents,
      daysToZeroAfterReserve: burnCents > 0 ? availableCents / burnCents * inputs.case.daysPerMonth : null,
      daysToFloorAfterReserve: burnCents > 0 ? (availableCents - inputs.case.cashFloorCents) / burnCents * inputs.case.daysPerMonth : null,
      limitation: "Continuous-average comparison only. Date-lumped obligations cause earlier event-level failures."
    }
  };
}

function selectSupport(tickets, budgetMinutes) {
  integer(budgetMinutes, "support budget", 0, 420);
  unique(tickets, "id", "tickets");
  for (const ticket of tickets) {
    if (!Object.hasOwn(SEVERITY, ticket.priority)) throw new Error(`Unknown severity: ${ticket.priority}`);
    integer(ticket.minutes, `${ticket.id} minutes`, 1);
    integer(ticket.affectedAccounts, `${ticket.id} affected accounts`);
    dateStamp(ticket.openedOn);
  }
  const eligible = tickets.filter(t => t.state === "open" && !t.blockedBy).sort((a, b) =>
    SEVERITY[a.priority] - SEVERITY[b.priority] ||
    compareText(a.openedOn, b.openedOn) || compareText(a.id, b.id)
  );
  let usedMinutes = 0;
  const selected = [];
  const deferred = [];
  for (const ticket of eligible) {
    if (usedMinutes + ticket.minutes <= budgetMinutes) {
      usedMinutes += ticket.minutes;
      selected.push(ticket.id);
    } else {
      deferred.push(ticket.id);
    }
  }
  return {
    requestedMinutes: budgetMinutes,
    usedMinutes,
    unusedMinutes: budgetMinutes - usedMinutes,
    selected,
    deferred,
    blocked: tickets.filter(t => t.state === "open" && t.blockedBy).map(t => t.id).sort(compareText),
    excluded: tickets.filter(t => t.state !== "open").map(t => t.id).sort(compareText),
    urgentSelected: selected.filter(id => tickets.find(t => t.id === id).priority === "urgent").length,
    policy: "Eligible urgent, normal, low; oldest first, then ID; non-preemptive fit, retain skipped work.",
    execution: "Prospective allocation only; no ticket is completed or sent."
  };
}

function backlogImpact(inputs) {
  selectSupport(inputs.tickets, 0);
  return {
    classification: "SYNTHETIC authored support risk",
    openTickets: inputs.tickets.filter(t => t.state === "open").length,
    urgentTickets: inputs.tickets.filter(t => t.state === "open" && t.priority === "urgent").length,
    blockedUrgentTickets: inputs.tickets.filter(t => t.state === "open" && t.priority === "urgent" && t.blockedBy).length,
    affectedAccountsNotSummed: true,
    receiptRecoveryCreditedCents: 0,
    tickets: inputs.tickets.map(t => ({
      ...t,
      ageDays: (dateStamp(inputs.case.asOf) - dateStamp(t.openedOn)) / DAY_MS,
      interpretation: t.blockedBy ? "Blocked: needs evidence, not dispatch." :
        t.priority === "urgent" ? "Eligible urgent work; no causal churn estimate." : "Retain when capacity-deferred."
    })),
    fullSeedCapacityPlan: selectSupport(inputs.tickets, inputs.case.supportCapacityMinutes)
  };
}

function resolveAssumptions(inputs, overrides = {}) {
  for (const key of Object.keys(overrides)) {
    if (!Object.hasOwn(inputs.model.defaults, key)) throw new Error(`Unknown assumption: ${key}`);
  }
  const a = { ...inputs.model.defaults, ...overrides };
  const ranges = {
    horizonDays: [1, 90], receiptDelayDays: [0, 30], demandBps: [0, 10000],
    acceleratedBps: [0, 8000], supportSliceMinutes: [0, 420],
    reviewCapacityMinutes: [0, 360], warningLeadDays: [0, 30]
  };
  for (const [key, [min, max]] of Object.entries(ranges)) integer(a[key], key, min, max);
  for (const key of ["contractorConsent", "hostingValidated", "receiptConsent", "deferralConsent"]) {
    if (typeof a[key] !== "boolean") throw new Error(`${key} must be boolean`);
  }
  return a;
}

function compilePlan(inputs, plan, overrides = {}) {
  if (!Array.isArray(plan)) throw new Error("Plan must be an array");
  unique(plan, "id", "actions");
  const a = resolveAssumptions(inputs, overrides);
  const requestedSlice = selectSupport(inputs.tickets, a.supportSliceMinutes);
  const actions = plan.map(p => {
    const spec = inputs.model.actions.find(action => action.id === p.id);
    if (!spec) throw new Error(`Unknown action: ${p.id}`);
    integer(p.startDay, `${p.id} startDay`, 1, a.horizonDays);
    const workDays = workingDays(inputs, p.startDay, spec.workdays);
    return {
      ...spec,
      requestedStartDay: p.startDay,
      startDay: workDays[0],
      workDays,
      readyDay: Math.max(workDays[0] + spec.leadDays, workDays.at(-1) + 1),
      consentAssumed: !spec.consentKey || a[spec.consentKey],
      resources: {
        ...spec.resources,
        support: spec.resources.support === "selected-ticket-minutes" ? requestedSlice.usedMinutes : spec.resources.support
      }
    };
  }).sort((x, y) => x.startDay - y.startDay || compareText(x.id, y.id));
  const issues = [];
  for (const action of actions) {
    for (const prerequisite of action.prerequisites) {
      const preceding = actions.find(x => x.id === prerequisite);
      if (!preceding || preceding.readyDay > action.startDay) {
        issues.push(`${action.id} needs ${prerequisite} ready before its work starts on day ${action.startDay}.`);
      }
    }
  }
  const deferral = actions.find(x => x.id === "defer-payable");
  const targetPayable = inputs.payables.find(p => p.id === inputs.model.deferral.payableId);
  if (deferral && deferral.readyDay > dayForDate(inputs, targetPayable.dueOn)) {
    issues.push(`defer-payable is too late: ready day ${deferral.readyDay}, original due day ${dayForDate(inputs, targetPayable.dueOn)}.`);
  }
  const lostSupport = deferral?.consentAssumed ? inputs.model.deferral.lostSupportMinutes : 0;
  const capacity = {
    engineering: inputs.case.engineeringCapacityMinutes,
    support: inputs.case.supportCapacityMinutes - lostSupport,
    review: a.reviewCapacityMinutes
  };
  const used = Object.fromEntries(BUCKETS.map(bucket => [bucket, actions.reduce((n, x) => n + x.resources[bucket], 0)]));
  for (const bucket of BUCKETS) {
    if (used[bucket] > capacity[bucket]) issues.push(`${bucket} total ${used[bucket]} exceeds one-time budget ${capacity[bucket]} minutes.`);
  }
  const allocation = new Map();
  for (const action of actions) {
    action.workDays.forEach((day, index) => {
      if (!allocation.has(day)) allocation.set(day, { day, engineering: 0, support: 0, review: 0, actionIds: [] });
      const row = allocation.get(day);
      row.actionIds.push(action.id);
      for (const bucket of BUCKETS) {
        const minutes = action.resources[bucket];
        row[bucket] += Math.floor(minutes / action.workDays.length) + (index < minutes % action.workDays.length ? 1 : 0);
      }
    });
  }
  const dailyAllocation = [...allocation.values()].sort((x, y) => x.day - y.day);
  for (const day of dailyAllocation) {
    for (const bucket of BUCKETS) {
      if (day[bucket] > inputs.model.dailyCapacity[bucket]) {
        issues.push(`Day ${day.day} ${bucket} load ${day[bucket]} exceeds daily cap ${inputs.model.dailyCapacity[bucket]} minutes.`);
      }
    }
  }
  return {
    feasible: issues.length === 0,
    issues,
    actions,
    capacity,
    used,
    lostSupportMinutes: lostSupport,
    dailyCapacity: inputs.model.dailyCapacity,
    dailyAllocation,
    proposedSunkCostsCents: total(actions, "costCents"),
    supportSlice: actions.some(x => x.id === "support-slice") ? requestedSlice : selectSupport(inputs.tickets, 0),
    policy: "Reject an infeasible proposed action set before execution; diagnostic cash then shows the no-action schedule. No hidden partial plan."
  };
}

function eventOrder(event) {
  return { payable: 0, "action-cost": 1, payroll: 2, contractors: 3, hosting: 4, refunds: 5, receipt: 6 }[event.kind];
}

function buildSchedule(inputs, plan = [], overrides = {}) {
  const a = resolveAssumptions(inputs, overrides);
  const baseline = reconcile(inputs);
  const compiled = compilePlan(inputs, plan, a);
  const effectiveActions = compiled.feasible ? compiled.actions : [];
  const readyAction = id => effectiveActions.find(x => x.id === id && x.consentAssumed);
  const repeat = inputs.rates.find(x => x.id === "repeat-september");
  const containment = inputs.rates.find(x => x.id === "bounded-containment");
  const events = [];
  const add = event => events.push({
    ...event,
    date: dateForDay(inputs, event.day),
    deltaCents: event.kind === "receipt" ? event.amountCents : -event.amountCents,
    reserveReleaseCents: event.reserveReleaseCents ?? 0
  });
  for (const action of effectiveActions) {
    if (action.costCents) add({
      id: `fee-${action.id}`, day: action.startDay, kind: "action-cost", amountCents: action.costCents,
      originalDay: action.startDay, cause: `${action.title}: irreversible assumed start fee, even if outcome fails.`
    });
  }
  const deferral = readyAction("defer-payable");
  let initialReserveCents = baseline.reserveCents;
  for (const payable of inputs.payables) {
    const moved = Boolean(deferral && payable.id === inputs.model.deferral.payableId);
    const feeCents = moved ? inputs.model.deferral.feeCents : 0;
    const amountCents = payable.amountCents + feeCents;
    initialReserveCents += feeCents;
    const originalDay = dayForDate(inputs, payable.dueOn);
    add({
      id: payable.id, kind: "payable",
      day: originalDay + (moved ? inputs.model.deferral.days : 0),
      originalDay, amountCents, principalCents: payable.amountCents, deferralFeeCents: feeCents,
      reserveReleaseCents: amountCents,
      cause: moved ? "Assumed consent shifts an existing liability, keeps its reserve, adds a fee and loses support capacity." :
        "Incremental prior-period obligation; not already included in ledger payments or recurring bills."
    });
  }
  const cycles = [];
  const cycleDays = inputs.case.daysPerMonth;
  for (let offset = 0, index = 1; offset < a.horizonDays; offset += cycleDays, index++) {
    const cycleStartDay = offset + 1;
    const contractor = readyAction("contractor-cut");
    const hosting = readyAction("hosting-cut");
    const costs = {
      payroll: repeat.payrollCents,
      contractors: contractor?.readyDay <= cycleStartDay ? containment.contractorsCents : repeat.contractorsCents,
      hosting: hosting?.readyDay <= cycleStartDay ? containment.hostingCents : repeat.hostingCents,
      refunds: repeat.refundsCents
    };
    for (const [kind, amountCents] of Object.entries(costs)) {
      const dueDay = offset + ({ payroll: 28, contractors: 29, hosting: 30, refunds: 30 }[kind]);
      const reduced = (kind === "contractors" && costs.contractors < repeat.contractorsCents) ||
        (kind === "hosting" && costs.hosting < repeat.hostingCents);
      add({
        id: `${kind}-cycle-${index}`, day: dueDay, originalDay: dueDay, kind, amountCents, cycle: index,
        cause: reduced ? "Conditional lower seed rate: action ready before this complete cycle began." :
          "Repeat-September amount. Existing-cycle commitment survives any mid-cycle action."
      });
    }
    const receiptPoolCents = Math.round(repeat.receiptsCents * a.demandBps / 10000);
    const nominalDay = offset + cycleDays;
    const earlyDay = nominalDay - inputs.model.receiptAdvanceDays;
    const pull = readyAction("receipt-pull");
    const earlyCents = pull?.readyDay <= earlyDay ? Math.floor(receiptPoolCents * a.acceleratedBps / 10000) : 0;
    for (const [part, amountCents, plannedDay] of [
      ["early", earlyCents, earlyDay], ["regular", receiptPoolCents - earlyCents, nominalDay]
    ]) {
      if (amountCents) add({
        id: `receipts-cycle-${index}-${part}`, kind: "receipt",
        day: plannedDay + a.receiptDelayDays,
        originalDay: nominalDay, preStressDay: plannedDay,
        amountCents, cycle: index,
        cause: part === "early" ?
          "Timing transfer from this cycle's same receipt pool, not additional revenue; then apply receipt delay." :
          "Remainder of this cycle's demand-adjusted existing receipt assumption; then apply receipt delay."
      });
    }
    cycles.push({
      cycle: index, startDay: cycleStartDay, endDay: offset + cycleDays,
      costs, receiptPoolCents, earlyReceiptCents: earlyCents,
      regularReceiptCents: receiptPoolCents - earlyCents,
      recurringBurnCents: Object.values(costs).reduce((n, x) => n + x, 0) - receiptPoolCents
    });
  }
  unique(events, "id", "schedule");
  events.sort((x, y) => x.day - y.day || eventOrder(x) - eventOrder(y) || compareText(x.id, y.id));
  const receipts = events.filter(x => x.kind === "receipt");
  const receiptConservation = {
    assumedCyclePoolCents: total(cycles, "receiptPoolCents"),
    scheduledWithinHorizonCents: total(receipts.filter(x => x.day <= a.horizonDays), "amountCents"),
    scheduledAfterHorizonCents: total(receipts.filter(x => x.day > a.horizonDays), "amountCents"),
    timingCreatedReceiptsCents: 0
  };
  if (receiptConservation.assumedCyclePoolCents !== receiptConservation.scheduledWithinHorizonCents + receiptConservation.scheduledAfterHorizonCents) {
    throw new Error("Receipt conservation failure");
  }
  return { assumptions: a, baseline, compiled, cycles, events, initialReserveCents, receiptConservation };
}

function simulate(inputs, plan = [], overrides = {}) {
  const schedule = buildSchedule(inputs, plan, overrides);
  const { assumptions: a, baseline, compiled } = schedule;
  const within = schedule.events.filter(event => event.day <= a.horizonDays);
  const outside = schedule.events.filter(event => event.day > a.horizonDays);
  let cash = baseline.closingCashCents;
  let reserve = schedule.initialReserveCents;
  const floor = baseline.floorCents;
  let firstFloor = cash - reserve < floor ? {
    day: 0, date: dateForDay(inputs, 0), eventId: "opening-reserve",
    cause: "Opening cash net of committed prior-period reserves.", availableCents: cash - reserve, cashCents: cash
  } : null;
  let firstUnfunded = null;
  let executablePrefixCashCents = cash;
  const daily = [{
    day: 0, date: dateForDay(inputs, 0), cashCents: cash, reserveCents: reserve,
    availableCents: cash - reserve, troughCashCents: cash, troughAvailableCents: cash - reserve,
    receiptsCents: 0, outflowsCents: 0, counterfactual: false, eventIds: []
  }];
  const ledger = [];
  for (let day = 1; day <= a.horizonDays; day++) {
    const row = {
      day, date: dateForDay(inputs, day), troughCashCents: cash,
      troughAvailableCents: cash - reserve, receiptsCents: 0, outflowsCents: 0, eventIds: []
    };
    for (const event of within.filter(x => x.day === day)) {
      const cashBeforeCents = cash;
      cash += event.deltaCents;
      reserve -= event.reserveReleaseCents;
      if (reserve < 0) throw new Error("Reserve released more than once");
      if (!firstUnfunded && event.kind !== "receipt" && cash < 0) {
        firstUnfunded = {
          day, date: row.date, eventId: event.id, cause: event.cause,
          requiredCents: event.amountCents, availableBeforeCents: cashBeforeCents, shortfallCents: -cash
        };
        executablePrefixCashCents = cashBeforeCents;
      }
      if (!firstUnfunded) executablePrefixCashCents = cash;
      if (!firstFloor && cash - reserve < floor) {
        firstFloor = { day, date: row.date, eventId: event.id, cause: event.cause, availableCents: cash - reserve, cashCents: cash };
      }
      row.troughCashCents = Math.min(row.troughCashCents, cash);
      row.troughAvailableCents = Math.min(row.troughAvailableCents, cash - reserve);
      row[event.kind === "receipt" ? "receiptsCents" : "outflowsCents"] += event.amountCents;
      row.eventIds.push(event.id);
      ledger.push({
        ...event, cashBeforeCents, cashAfterCents: cash,
        reserveAfterCents: reserve, availableAfterCents: cash - reserve,
        status: firstUnfunded ? "counterfactual-after-unfunded-payment" : "within-executable-prefix"
      });
    }
    daily.push({
      ...row, cashCents: cash, reserveCents: reserve, availableCents: cash - reserve,
      counterfactual: Boolean(firstUnfunded)
    });
  }
  const receiptsCents = total(daily, "receiptsCents");
  const outflowsCents = total(daily, "outflowsCents");
  if (cash !== baseline.closingCashCents + receiptsCents - outflowsCents) throw new Error("Cash reconciliation failure");
  const minimumCashCents = Math.min(...daily.map(row => row.troughCashCents));
  const minimumAvailableCents = Math.min(...daily.map(row => row.troughAvailableCents));
  const warning = {
    earliestForecastDay: firstFloor || firstUnfunded || !compiled.feasible ? 0 : null,
    floorEscalationDay: firstFloor ? Math.max(0, firstFloor.day - a.warningLeadDays) : null,
    fundingEscalationDay: firstUnfunded ? Math.max(0, firstUnfunded.day - a.warningLeadDays) : null,
    leadDays: a.warningLeadDays,
    explanation: "Full schedule is known at day 0. Rolling lead-time alerts are separate from the earliest forecast warning."
  };
  const supportSlice = compiled.feasible ? compiled.supportSlice : selectSupport(inputs.tickets, 0);
  const summary = {
    actionPlanFeasible: compiled.feasible,
    floorMaintained: !firstFloor,
    cashFundedThroughHorizon: !firstUnfunded,
    recoveryExistsWithinHorizon: compiled.feasible && !firstFloor && !firstUnfunded,
    firstFloorDay: firstFloor?.day ?? null,
    firstUnfundedDay: firstUnfunded?.day ?? null,
    earliestWarningDay: warning.earliestForecastDay,
    floorEscalationDay: warning.floorEscalationDay,
    fundingEscalationDay: warning.fundingEscalationDay,
    finalScheduledCashCents: cash,
    finalAvailableCents: cash - reserve,
    finalPriorPayableReserveCents: reserve,
    minimumCashCents,
    minimumAvailableCents,
    minimumFloorHeadroomCents: minimumAvailableCents - floor,
    receiptsWithinHorizonCents: receiptsCents,
    outflowsWithinHorizonCents: outflowsCents,
    scheduledActionCostsCents: total(ledger.filter(x => x.kind === "action-cost"), "amountCents"),
    endingCycleRecurringBurnCents: schedule.cycles.at(-1).recurringBurnCents,
    urgentTicketsProspectivelySelected: supportSlice.urgentSelected,
    supportMinutes: supportSlice.usedMinutes
  };
  const flags = [];
  if (!compiled.feasible) flags.push({ severity: "failure", code: "RESOURCE_OR_SEQUENCE", text: "Action set rejected. Cash trace is a no-action diagnostic, not the requested recovery." });
  if (firstFloor) flags.push({ severity: "failure", code: "CASH_FLOOR", text: `Reserved-cash floor first breached on day ${firstFloor.day} by ${firstFloor.eventId}.` });
  if (firstUnfunded) flags.push({ severity: "failure", code: "UNFUNDED_PAYMENT", text: `Cannot fund ${firstUnfunded.eventId} on day ${firstUnfunded.day}. All subsequent schedule amounts are counterfactual; no implicit bridge loan.` });
  if (firstUnfunded && cash >= 0) flags.push({ severity: "warning", code: "ENDING_CASH_IS_NOT_SOLVENCY", text: "Positive horizon cash does not erase an earlier missed payment; later receipts cannot retroactively meet a due date." });
  if (schedule.receiptConservation.scheduledAfterHorizonCents) flags.push({ severity: "warning", code: "RECEIPTS_OUTSIDE_WINDOW", text: "Receipt delay leaves part of the same assumed pool outside the horizon, not lost or counted twice." });
  if (compiled.actions.some(x => !x.consentAssumed)) flags.push({ severity: "warning", code: "FAILED_ASSUMED_OUTCOME", text: "Consent or validation is off: no benefit for that action, but validly started work and fees remain consumed." });
  if (compiled.actions.some(x => x.id === "defer-payable" && x.consentAssumed) && compiled.feasible) flags.push({ severity: "warning", code: "DEFERRAL_IS_NOT_SAVINGS", text: "Original principal remains reserved, a $125 fee is added, and 120 support minutes are lost. Consent is only an assumption." });
  flags.push({ severity: "note", code: "UNRESOLVED_SUPPORT", text: `${supportSlice.blocked.length} blocked and ${supportSlice.deferred.length} capacity-deferred tickets remain prospective/unexecuted; no receipt gain is assigned.` });
  return {
    schema: "turnaround-model-run/1", classification: "SYNTHETIC conditional model, not realized outcomes",
    accounting: "Scheduled cash is a signed funding requirement. At the first unfunded payment the executable prefix ends; later events and reserve releases are counterfactual, not paid bills.",
    horizonDays: a.horizonDays, startDate: dateForDay(inputs, 1), endDate: dateForDay(inputs, a.horizonDays),
    assumptions: a, plan: plan.map(row => ({ ...row })), resources: compiled, summary,
    firstFloorBreach: firstFloor, firstUnfundedPayment: firstUnfunded,
    executablePrefixCashCents, warning, flags, cycles: schedule.cycles,
    receiptConservation: schedule.receiptConservation,
    daily, events: ledger, afterHorizon: outside, supportSlice,
    authority: { externalEffects: [], nativeInitialized: false, referenceWorkAccepted: false, realRecoveryClaimed: false }
  };
}

function searchStrategies(inputs, experiments) {
  const actions = inputs.model.actions;
  const evaluated = [];
  for (const schedule of experiments.search.schedules) {
    for (let mask = 0; mask < 2 ** actions.length; mask++) {
      const plan = actions.filter((_, index) => mask & (1 << index)).map(action => ({
        id: action.id, startDay: schedule.starts[action.id]
      }));
      const result = simulate(inputs, plan);
      evaluated.push({
        id: `${schedule.id}-${mask.toString(2).padStart(actions.length, "0")}`,
        plan, ...result.summary, issues: result.resources.issues
      });
    }
  }
  const valid = evaluated.filter(row => row.actionPlanFeasible);
  const horizon = inputs.model.defaults.horizonDays;
  valid.sort((x, y) =>
    (y.firstFloorDay ?? horizon + 1) - (x.firstFloorDay ?? horizon + 1) ||
    (y.firstUnfundedDay ?? horizon + 1) - (x.firstUnfundedDay ?? horizon + 1) ||
    y.urgentTicketsProspectivelySelected - x.urgentTicketsProspectivelySelected ||
    y.finalScheduledCashCents - x.finalScheduledCashCents ||
    x.scheduledActionCostsCents - y.scheduledActionCostsCents ||
    compareText(x.id, y.id)
  );
  return {
    schema: "turnaround-strategy-search/1",
    classification: "Finite deterministic experiment; not a global optimum or owner approval",
    specification: experiments.search,
    evaluatedCount: evaluated.length,
    validCount: valid.length,
    rejectedCount: evaluated.length - valid.length,
    floorAndFundingSurvivors: valid.filter(row => row.recoveryExistsWithinHorizon).length,
    fundedSurvivors: valid.filter(row => row.cashFundedThroughHorizon).length,
    candidate: valid[0] ?? null,
    rankedValidIds: valid.map(row => row.id),
    evaluated
  };
}

function runExperiments(inputs, experiments) {
  const search = searchStrategies(inputs, experiments);
  const candidate = search.candidate?.plan ?? [];
  const scenarios = experiments.scenarios.map(scenario => ({
    id: scenario.id, title: scenario.title, description: scenario.description,
    result: simulate(inputs, scenario.useCandidate ? candidate : [], scenario.assumptions)
  }));
  const thresholds = [];
  for (const demandBps of experiments.search.thresholdScan.demandBps) {
    for (const receiptDelayDays of experiments.search.thresholdScan.receiptDelayDays) {
      const result = simulate(inputs, candidate, { demandBps, receiptDelayDays });
      thresholds.push({ demandBps, receiptDelayDays, ...result.summary });
    }
  }
  return {
    search, scenarios,
    thresholds: {
      classification: "Discrete sensitivity scan, no interpolated or universal safety threshold",
      candidateId: search.candidate?.id ?? null,
      floorSafeCells: thresholds.filter(row => row.recoveryExistsWithinHorizon).length,
      grid: thresholds
    }
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function formatMoney(cents) {
  if (!Number.isSafeInteger(cents)) throw new Error("Display money must be integer cents");
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0
  }).format(cents / 100);
}

function dayLabel(day) {
  return day === null ? "Beyond window" : `D${day}`;
}

function aggregateTimeline(daily, mode = "weekly") {
  if (!["weekly", "daily"].includes(mode)) throw new Error("Unknown timeline mode");
  const groups = [[daily[0]]];
  const width = mode === "weekly" ? 7 : 1;
  for (let start = 1; start < daily.length; start += width) groups.push(daily.slice(start, start + width));
  return groups.map((rows, index) => ({
    label: index === 0 ? "Opening" : mode === "weekly" ?
      `W${index} · D${rows[0].day}–${rows.at(-1).day}` : `D${rows[0].day}`,
    startDay: rows[0].day, endDay: rows.at(-1).day,
    date: rows.at(-1).date,
    receiptsCents: rows.reduce((n, row) => n + row.receiptsCents, 0),
    outflowsCents: rows.reduce((n, row) => n + row.outflowsCents, 0),
    cashCents: rows.at(-1).cashCents,
    availableCents: rows.at(-1).availableCents,
    reserveCents: rows.at(-1).reserveCents,
    troughAvailableCents: Math.min(...rows.map(row => row.troughAvailableCents)),
    counterfactual: rows.some(row => row.counterfactual)
  }));
}

function cashChartSvg(result, baseline, floorCents, inspectDay) {
  const points = result.daily;
  const low = Math.floor((Math.min(0, result.summary.minimumAvailableCents, baseline.summary.minimumAvailableCents) - 100000) / 500000) * 500000;
  const high = Math.ceil((Math.max(...points.map(row => row.availableCents), floorCents) + 200000) / 500000) * 500000;
  const x = day => 74 + day / result.horizonDays * 922;
  const y = cents => 24 + (high - cents) / (high - low) * 244;
  const line = (rows, key) => rows.map((row, index) =>
    `${index ? "L" : "M"}${x(row.day).toFixed(2)},${y(row[key]).toFixed(2)}`
  ).join(" ");
  const ticks = [];
  for (let cents = low; cents <= high; cents += 1000000) {
    ticks.push(`<g><line x1="74" x2="996" y1="${y(cents)}" y2="${y(cents)}" class="chart-grid"/><text x="62" y="${y(cents) + 4}" text-anchor="end">${escapeHtml(formatMoney(cents))}</text></g>`);
  }
  const labels = [0, 15, 30, 45, 60, 75, 90].filter(day => day <= result.horizonDays).map(day =>
    `<text x="${x(day)}" y="298" text-anchor="middle">D${day}</text>`
  ).join("");
  const floorDay = result.summary.firstFloorDay;
  const fundingDay = result.summary.firstUnfundedDay;
  const shaded = fundingDay === null ? "" :
    `<rect x="${x(fundingDay)}" y="24" width="${Math.max(2, 996 - x(fundingDay))}" height="244" class="chart-counterfactual"/><line x1="${x(fundingDay)}" x2="${x(fundingDay)}" y1="24" y2="268" class="chart-default"/><text x="992" y="15" text-anchor="end">Counterfactual from D${fundingDay}</text>`;
  const point = points.find(row => row.day === inspectDay) ?? points[0];
  const floorMarker = floorDay === null ? "" :
    `<circle cx="${x(floorDay)}" cy="${y(result.firstFloorBreach.availableCents)}" r="5" class="chart-breach"/>`;
  return `<svg viewBox="0 0 1040 316" role="img" aria-labelledby="cash-chart-title cash-chart-desc">
    <title id="cash-chart-title">Reserved-cash runway and intraday troughs</title>
    <desc id="cash-chart-desc">Cash net of unpaid prior-period reserves. The floor is ${escapeHtml(formatMoney(floorCents))}. First floor breach ${dayLabel(floorDay)}; first unfunded payment ${dayLabel(fundingDay)}. Negative values are funding requirements, not actual overdrafts. A table provides the same data.</desc>
    ${ticks.join("")}${shaded}
    <line x1="74" x2="996" y1="${y(0)}" y2="${y(0)}" class="chart-zero"/>
    <line x1="74" x2="996" y1="${y(floorCents)}" y2="${y(floorCents)}" class="chart-floor"/>
    <text x="80" y="${y(floorCents) - 8}" class="chart-floor-label">$12k reserved-cash floor</text>
    <path d="${line(baseline.daily, "availableCents")}" class="chart-baseline"/>
    <path d="${line(points, "availableCents")}" class="chart-cash"/>
    <path d="${line(points, "troughAvailableCents")}" class="chart-trough"/>
    ${floorMarker}
    <line x1="${x(point.day)}" x2="${x(point.day)}" y1="24" y2="268" class="chart-cursor"/>
    <circle cx="${x(point.day)}" cy="${y(point.troughAvailableCents)}" r="5" class="chart-inspect"/>
    ${labels}
  </svg>`;
}

// Generated from reviewed inert data and original model; reproduce with scripts/build.mjs.
const INPUTS = {
  "schema": "turnaround-frozen-inputs/1",
  "classification": "Synthetic seed facts plus explicitly separated added assumptions",
  "case": {
    "id": "cedarline-five-day-recovery",
    "business": "Cedarline Desk",
    "asOf": "2026-09-30",
    "months": [
      "2026-07",
      "2026-08",
      "2026-09"
    ],
    "openingCashCents": 5200000,
    "cashFloorCents": 1200000,
    "daysPerMonth": 30,
    "sprintWorkingDays": 5,
    "engineeringCapacityMinutes": 360,
    "supportCapacityMinutes": 420,
    "accountingAssumption": "All included plan billings are collected in the same month; ledger is cash-only and not a complete financial statement.",
    "payableTreatment": "Incremental unpaid prior-period catch-up obligations, not already paid in the ledger or included in recurring scenario outflows.",
    "approvedExternalEffects": [],
    "realizedRecoveryResults": null
  },
  "ledger": [
    {
      "id": "cash-jul-receipts",
      "date": "2026-07-31",
      "category": "subscription-receipts",
      "direction": "in",
      "amountCents": 1800000
    },
    {
      "id": "cash-jul-payroll",
      "date": "2026-07-28",
      "category": "payroll",
      "direction": "out",
      "amountCents": 1700000
    },
    {
      "id": "cash-jul-contractors",
      "date": "2026-07-29",
      "category": "contractors",
      "direction": "out",
      "amountCents": 300000
    },
    {
      "id": "cash-jul-hosting",
      "date": "2026-07-30",
      "category": "hosting",
      "direction": "out",
      "amountCents": 120000
    },
    {
      "id": "cash-jul-refunds",
      "date": "2026-07-31",
      "category": "refunds",
      "direction": "out",
      "amountCents": 80000
    },
    {
      "id": "cash-aug-receipts",
      "date": "2026-08-31",
      "category": "subscription-receipts",
      "direction": "in",
      "amountCents": 1600000
    },
    {
      "id": "cash-aug-payroll",
      "date": "2026-08-28",
      "category": "payroll",
      "direction": "out",
      "amountCents": 1700000
    },
    {
      "id": "cash-aug-contractors",
      "date": "2026-08-29",
      "category": "contractors",
      "direction": "out",
      "amountCents": 300000
    },
    {
      "id": "cash-aug-hosting",
      "date": "2026-08-30",
      "category": "hosting",
      "direction": "out",
      "amountCents": 140000
    },
    {
      "id": "cash-aug-refunds",
      "date": "2026-08-31",
      "category": "refunds",
      "direction": "out",
      "amountCents": 120000
    },
    {
      "id": "cash-sep-receipts",
      "date": "2026-09-30",
      "category": "subscription-receipts",
      "direction": "in",
      "amountCents": 1450000
    },
    {
      "id": "cash-sep-payroll",
      "date": "2026-09-28",
      "category": "payroll",
      "direction": "out",
      "amountCents": 1700000
    },
    {
      "id": "cash-sep-contractors",
      "date": "2026-09-29",
      "category": "contractors",
      "direction": "out",
      "amountCents": 300000
    },
    {
      "id": "cash-sep-hosting",
      "date": "2026-09-30",
      "category": "hosting",
      "direction": "out",
      "amountCents": 180000
    },
    {
      "id": "cash-sep-refunds",
      "date": "2026-09-30",
      "category": "refunds",
      "direction": "out",
      "amountCents": 170000
    }
  ],
  "subscriptions": [
    {
      "id": "2026-07-starter",
      "month": "2026-07",
      "plan": "starter",
      "accounts": 100,
      "priceCents": 10000
    },
    {
      "id": "2026-07-team",
      "month": "2026-07",
      "plan": "team",
      "accounts": 16,
      "priceCents": 50000
    },
    {
      "id": "2026-08-starter",
      "month": "2026-08",
      "plan": "starter",
      "accounts": 90,
      "priceCents": 10000
    },
    {
      "id": "2026-08-team",
      "month": "2026-08",
      "plan": "team",
      "accounts": 14,
      "priceCents": 50000
    },
    {
      "id": "2026-09-starter",
      "month": "2026-09",
      "plan": "starter",
      "accounts": 80,
      "priceCents": 10000
    },
    {
      "id": "2026-09-team",
      "month": "2026-09",
      "plan": "team",
      "accounts": 13,
      "priceCents": 50000
    }
  ],
  "payables": [
    {
      "id": "arrears-support",
      "dueOn": "2026-10-10",
      "amountCents": 250000,
      "basis": "Prior-period support catch-up obligation not in cash ledger",
      "treatment": "incremental-prior-period-reserve"
    },
    {
      "id": "arrears-hosting",
      "dueOn": "2026-10-05",
      "amountCents": 180000,
      "basis": "Prior-period hosting catch-up obligation not in cash ledger",
      "treatment": "incremental-prior-period-reserve"
    },
    {
      "id": "arrears-refunds",
      "dueOn": "2026-10-02",
      "amountCents": 120000,
      "basis": "Prior-period approved-in-fiction unpaid refunds not in cash ledger",
      "treatment": "incremental-prior-period-reserve"
    }
  ],
  "rates": [
    {
      "id": "repeat-september",
      "receiptsCents": 1450000,
      "payrollCents": 1700000,
      "contractorsCents": 300000,
      "hostingCents": 180000,
      "refundsCents": 170000,
      "precondition": "Mechanical repeat of September cash pattern; not a forecast commitment"
    },
    {
      "id": "bounded-containment",
      "receiptsCents": 1450000,
      "payrollCents": 1700000,
      "contractorsCents": 150000,
      "hostingCents": 160000,
      "refundsCents": 170000,
      "precondition": "Unapproved contractor allocation and hosting changes; evidence and owner review required"
    }
  ],
  "tickets": [
    {
      "id": "ticket-001",
      "openedOn": "2026-09-10",
      "priority": "urgent",
      "state": "open",
      "minutes": 90,
      "affectedAccounts": 7,
      "blockedBy": "",
      "issue": "Duplicate export acknowledgment in batch retry"
    },
    {
      "id": "ticket-002",
      "openedOn": "2026-09-06",
      "priority": "low",
      "state": "open",
      "minutes": 20,
      "affectedAccounts": 1,
      "blockedBy": "",
      "issue": "Misaligned export title in wide layout"
    },
    {
      "id": "ticket-003",
      "openedOn": "2026-09-15",
      "priority": "normal",
      "state": "open",
      "minutes": 60,
      "affectedAccounts": 3,
      "blockedBy": "",
      "issue": "Saved view sort resets on reopen"
    },
    {
      "id": "ticket-004",
      "openedOn": "2026-09-21",
      "priority": "urgent",
      "state": "open",
      "minutes": 120,
      "affectedAccounts": 5,
      "blockedBy": "needs-synthetic-reproduction",
      "issue": "Intermittent retry log cannot yet be reproduced"
    },
    {
      "id": "ticket-005",
      "openedOn": "2026-09-12",
      "priority": "normal",
      "state": "open",
      "minutes": 75,
      "affectedAccounts": 4,
      "blockedBy": "",
      "issue": "Bulk tag operation drops the visible selection"
    },
    {
      "id": "ticket-006",
      "openedOn": "2026-09-20",
      "priority": "low",
      "state": "open",
      "minutes": 25,
      "affectedAccounts": 1,
      "blockedBy": "",
      "issue": "Secondary button caption is unclear"
    },
    {
      "id": "ticket-007",
      "openedOn": "2026-09-25",
      "priority": "urgent",
      "state": "open",
      "minutes": 90,
      "affectedAccounts": 6,
      "blockedBy": "",
      "issue": "Retry status remains pending after acknowledged completion"
    },
    {
      "id": "ticket-008",
      "openedOn": "2026-09-27",
      "priority": "normal",
      "state": "open",
      "minutes": 45,
      "affectedAccounts": 2,
      "blockedBy": "",
      "issue": "Empty-list state omits a recovery hint"
    },
    {
      "id": "ticket-009",
      "openedOn": "2026-09-01",
      "priority": "low",
      "state": "open",
      "minutes": 15,
      "affectedAccounts": 1,
      "blockedBy": "",
      "issue": "Help icon baseline differs between two pages"
    },
    {
      "id": "ticket-010",
      "openedOn": "2026-09-18",
      "priority": "urgent",
      "state": "open",
      "minutes": 60,
      "affectedAccounts": 8,
      "blockedBy": "",
      "issue": "Urgent queue view shows no reason for skipped items"
    },
    {
      "id": "ticket-011",
      "openedOn": "2026-09-09",
      "priority": "normal",
      "state": "open",
      "minutes": 60,
      "affectedAccounts": 4,
      "blockedBy": "",
      "issue": "Filter summary disappears on back navigation"
    },
    {
      "id": "ticket-012",
      "openedOn": "2026-09-23",
      "priority": "low",
      "state": "open",
      "minutes": 30,
      "affectedAccounts": 1,
      "blockedBy": "",
      "issue": "Printed legend has an unnecessary blank row"
    }
  ],
  "sprint": [
    {
      "id": "sprint-reproduce",
      "owner": "engineering",
      "bucket": "engineering",
      "minutes": 60,
      "dependsOn": "",
      "entryGate": "Authored baseline and reviewed defect scope",
      "exitEvidence": "Minimal failing-policy reproduction"
    },
    {
      "id": "sprint-patch",
      "owner": "engineering",
      "bucket": "engineering",
      "minutes": 180,
      "dependsOn": "sprint-reproduce",
      "entryGate": "Agreed severity and exclusion rule",
      "exitEvidence": "Candidate module and narrow tests"
    },
    {
      "id": "sprint-regression",
      "owner": "operations",
      "bucket": "engineering",
      "minutes": 90,
      "dependsOn": "sprint-patch",
      "entryGate": "Candidate source available",
      "exitEvidence": "Actually run regression results"
    },
    {
      "id": "sprint-rollback",
      "owner": "operations",
      "bucket": "engineering",
      "minutes": 30,
      "dependsOn": "sprint-regression",
      "entryGate": "Regression findings reviewed",
      "exitEvidence": "Documented hold/rollback boundary"
    },
    {
      "id": "sprint-support",
      "owner": "operations",
      "bucket": "support",
      "minutes": 420,
      "dependsOn": "sprint-rollback",
      "entryGate": "Owner approval required before actual account work",
      "exitEvidence": "Prospective support slice; no completion implied"
    },
    {
      "id": "sprint-customer-review",
      "owner": "customer-success",
      "bucket": "review",
      "minutes": 60,
      "dependsOn": "sprint-regression",
      "entryGate": "Truthful drafts and commitment review",
      "exitEvidence": "Unsent reviewed message drafts"
    },
    {
      "id": "sprint-cash-review",
      "owner": "finance",
      "bucket": "review",
      "minutes": 60,
      "dependsOn": "",
      "entryGate": "Reconciled ledger and incremental reserve",
      "exitEvidence": "Conditional scenario review"
    }
  ],
  "approvalGates": {
    "classification": "SYNTHETIC",
    "default": "planning-only",
    "gates": [
      {
        "effect": "production-deployment",
        "required": [
          "candidate regression evidence",
          "rollback/hold procedure",
          "explicit owner approval"
        ],
        "approved": false
      },
      {
        "effect": "support-work-against-accounts",
        "required": [
          "reviewed ticket scope",
          "capacity and data-access review",
          "explicit owner approval"
        ],
        "approved": false
      },
      {
        "effect": "customer-message-or-refund-promise",
        "required": [
          "truthful draft",
          "financial commitment review",
          "explicit owner approval"
        ],
        "approved": false
      },
      {
        "effect": "contractor-or-hosting-cost-change",
        "required": [
          "service continuity review",
          "contract/cost evidence",
          "explicit owner approval"
        ],
        "approved": false
      },
      {
        "effect": "payment-trade-or-financing",
        "required": [
          "separate qualified review",
          "explicit owner authority"
        ],
        "approved": false
      }
    ],
    "reference_utility_effects": [],
    "warning": "A simulation or passing local test is not a financial instruction, completed support action, or approval."
  },
  "model": {
    "schema": "turnaround-assumptions/1",
    "classification": "ADDED MODEL ASSUMPTIONS, NOT SEED FACTS",
    "defaults": {
      "horizonDays": 90,
      "receiptDelayDays": 0,
      "demandBps": 10000,
      "acceleratedBps": 6500,
      "supportSliceMinutes": 300,
      "reviewCapacityMinutes": 180,
      "warningLeadDays": 7,
      "contractorConsent": true,
      "hostingValidated": true,
      "receiptConsent": true,
      "deferralConsent": true
    },
    "definitions": [
      {
        "id": "calendar",
        "text": "Day 1 is 2026-10-01. Horizon is 90 calendar days. Three normalized 30-day billing cycles are used, NOT actual calendar months. Work is Monday-Friday, no holidays; lead times are calendar days and start after the actual work start."
      },
      {
        "id": "billing",
        "text": "Repeat September's receipts and expenses, rather than extrapolating growth. Every cycle's payroll is due on offset 28, contractors on 29, and hosting/refunds/receipts on 30, using the seed posting pattern as a timing assumption. Outflows are due before same-day receipts."
      },
      {
        "id": "accounting",
        "text": "All money is integer cents. Scheduled cash equals opening bank cash plus scheduled receipts less required outflows. Negative scheduled cash is an unfunded requirement, never an authorized overdraft. The executable prefix ends at the first unfunded payment; all later events are explicitly counterfactual schedule arithmetic."
      },
      {
        "id": "reserve",
        "text": "Outstanding incremental prior-period payables stay reserved until their scheduled payment, even when deferred beyond the horizon. Cash-floor tests use scheduled cash less these reserves. A reserve release is not a receipt. Agreed deferral fees are also reserved immediately."
      },
      {
        "id": "floor",
        "text": "A strict value below $12,000 breaches the floor. Exactly $12,000 is not a breach; exactly zero bank cash can fund the preceding payment. Test every event including the trough before same-day receipts, not only daily closing cash."
      },
      {
        "id": "capacity",
        "text": "The seed's 360 engineering and 420 support minutes are single total budgets, never replenished weekly. Added daily caps are 120 engineering, 210 support and 90 review minutes. Review has an added 180-minute total budget. Splitting work evenly over an action's working days is a scheduling simplification, not a staff availability fact."
      },
      {
        "id": "action-outcomes",
        "text": "All actions are conditional and unapproved. Their one-time fees are paid at actual start and remain lost if consent/validation fails. Work time is consumed either way. No repair or support work automatically creates sales, retention or refund savings."
      },
      {
        "id": "cost-changes",
        "text": "Contractor and hosting levels come from the seed containment scenario. They apply only to a complete 30-day cycle starting on or after action readiness. Existing-cycle invoices are not reduced retrospectively."
      },
      {
        "id": "receipts",
        "text": "Collection coordination can move 65% of already-assumed cycle receipts from day 30 to day 20, only if ready by day 20 and assumed consent holds. It never increases the cycle total. All receipts, including accelerated portions, receive the same additional delay. Weaker demand reduces each cycle's existing receipts; no replacement sales or financing are permitted."
      },
      {
        "id": "deferral",
        "text": "Negotiating the $2,500 prior support payable before its due date can move it by 30 calendar days, with a $100 sunk negotiation fee, $125 added late fee and loss of 120 support minutes from the one-time budget. These are assumed consequences, not contract facts. Consent failure keeps the original due date and spends the negotiation fee without benefit."
      },
      {
        "id": "warning",
        "text": "All inputs are known in this deterministic exercise, so the earliest forecast warning is day 0 whenever any modeled future failure exists. The separate rolling escalation starts max(0, breach day minus warningLeadDays); it is a policy clock, not a prediction that the risk was unknowable earlier."
      },
      {
        "id": "support",
        "text": "Queue repair allocates the seed's 60+180+90+30 engineering minutes across three working days. The optional support slice is prospective, non-preemptive severity/age/ID fit over two working days after repair readiness. Tickets remain unexecuted. Unselected and blocked tickets stay visible; overlapping affected-account counts are never summed."
      }
    ],
    "dailyCapacity": {
      "engineering": 120,
      "support": 210,
      "review": 90
    },
    "actions": [
      {
        "id": "queue-repair",
        "title": "Review & repair queue",
        "description": "Reserve the authored engineering sprint. Makes a modeled support slice eligible; no cash recovery is credited.",
        "workdays": 3,
        "leadDays": 3,
        "costCents": 0,
        "resources": {
          "engineering": 360,
          "support": 0,
          "review": 0
        },
        "prerequisites": [],
        "factBasis": "Engineering minutes: recovery-sprint.csv. Workday timing is an added assumption."
      },
      {
        "id": "support-slice",
        "title": "Protect the urgent queue",
        "description": "Plan a capacity-bounded support slice after queue readiness. It consumes the selected tickets' minutes, not invented money.",
        "workdays": 2,
        "leadDays": 2,
        "costCents": 0,
        "resources": {
          "engineering": 0,
          "support": "selected-ticket-minutes",
          "review": 0
        },
        "prerequisites": [
          "queue-repair"
        ],
        "factBasis": "Ticket estimates and support cap: seed data. Allocation timing and selected slice size are assumptions."
      },
      {
        "id": "contractor-cut",
        "title": "Narrow contractor scope",
        "description": "Assumed agreement lowers a future full cycle from $3,000 to $1,500. Current-cycle obligations survive.",
        "workdays": 1,
        "leadDays": 14,
        "costCents": 30000,
        "resources": {
          "engineering": 0,
          "support": 0,
          "review": 60
        },
        "prerequisites": [],
        "consentKey": "contractorConsent",
        "factBasis": "Rate levels: scenarios.csv. $300 sunk fee, 14-day lead and resource load are assumptions."
      },
      {
        "id": "hosting-cut",
        "title": "Validate smaller hosting",
        "description": "Assumed validation lowers a future full cycle from $1,800 to $1,600, competing with engineering work.",
        "workdays": 2,
        "leadDays": 10,
        "costCents": 45000,
        "resources": {
          "engineering": 120,
          "support": 0,
          "review": 30
        },
        "prerequisites": [],
        "consentKey": "hostingValidated",
        "factBasis": "Rate levels: scenarios.csv. $450 sunk fee, 10-day lead and resource load are assumptions."
      },
      {
        "id": "receipt-pull",
        "title": "Coordinate earlier receipts",
        "description": "Moves part of the same receipt pool ten days earlier; never adds revenue. Uses support and review capacity.",
        "workdays": 2,
        "leadDays": 7,
        "costCents": 15000,
        "resources": {
          "engineering": 0,
          "support": 90,
          "review": 60
        },
        "prerequisites": [],
        "consentKey": "receiptConsent",
        "factBasis": "No timing improvement is in the seed. Fee, share, lead, consent and capacity are added assumptions."
      },
      {
        "id": "defer-payable",
        "title": "Defer prior support bill",
        "description": "Moves $2,500 to day 40 if ready before day 10. Keeps the full reserve, adds a fee and removes support capacity.",
        "workdays": 1,
        "leadDays": 3,
        "costCents": 10000,
        "resources": {
          "engineering": 0,
          "support": 0,
          "review": 60
        },
        "prerequisites": [],
        "consentKey": "deferralConsent",
        "factBasis": "Original $2,500 obligation and date: payables.csv. Every deferral term is an added assumption."
      }
    ],
    "deferral": {
      "payableId": "arrears-support",
      "days": 30,
      "feeCents": 12500,
      "lostSupportMinutes": 120
    },
    "receiptAdvanceDays": 10
  },
  "provenance": {
    "attribution": "projects/08-turnaround/data/attribution.json",
    "copiedData": [
      {
        "local": "data/reference/LICENSE",
        "source": "LICENSE",
        "sha256": "3ca4ef7120c79e55fa3c113f2c6366a072b685018d2bf736ff2bcfceba57a77f"
      },
      {
        "local": "data/reference/recovery.json",
        "source": "templates/casework/work/starter/case/recovery.json",
        "sha256": "92e6b5c0763d226a71996ce9654b43c7e31e7d035d1144b1f97a6b9e37116350"
      },
      {
        "local": "data/reference/cash-ledger.csv",
        "source": "templates/casework/work/starter/data/cash-ledger.csv",
        "sha256": "17728ba9a34df12dcd0997dad08ec922babc3d6d504c2e47e1ab0ac3aad69d8e"
      },
      {
        "local": "data/reference/payables.csv",
        "source": "templates/casework/work/starter/data/payables.csv",
        "sha256": "07c963d545bc10b7a34b78065653ff4c070d8bd9ac0f61991bb7854cf0bf9f31"
      },
      {
        "local": "data/reference/subscriptions.csv",
        "source": "templates/casework/work/starter/data/subscriptions.csv",
        "sha256": "177b247ac08ada48652d2123af4066c946c89e2aeccb367c669d34912ef7ace8"
      },
      {
        "local": "data/reference/scenarios.csv",
        "source": "templates/casework/work/starter/data/scenarios.csv",
        "sha256": "e81fd022a31c2550dd0a54e754d072ad5b7ca164adf57e8bfd9c3214891e2c19"
      },
      {
        "local": "data/reference/support-backlog.csv",
        "source": "templates/casework/work/starter/data/support-backlog.csv",
        "sha256": "565b646c0dbab4567c30838950093b1bf68f3c7332933eddb49c4b40c3027031"
      },
      {
        "local": "data/reference/recovery-sprint.csv",
        "source": "templates/casework/work/starter/ops/recovery-sprint.csv",
        "sha256": "056db98cad94ab00478eb6d37e61c236883b46506c700eca2609ca6755e4c51d"
      },
      {
        "local": "data/reference/approval-gates.json",
        "source": "templates/casework/work/starter/ops/approval-gates.json",
        "sha256": "6e2e89930421dc3b1ab4b0a2b8fb80f8bb31e79e249fd77504ecbaaa6ea69fdf"
      }
    ],
    "modelAssumptionsSha256": "bd1c39b26f8c98724d458cf045b810a003455e906c1d80c8253703c65f261375",
    "scenarioSpecificationSha256": "fa0ac52ebce67adb4f38e16aaae6aa91f5c752d4ebc097f53ac58cbc7e215a90"
  }
};
const EXPERIMENTS = {
  "schema": "turnaround-scenarios/1",
  "classification": "ADDED MODEL EXPERIMENTS, NOT OBSERVATIONS",
  "scenarios": [
    {
      "id": "baseline",
      "title": "No intervention",
      "useCandidate": false,
      "assumptions": {},
      "description": "Repeated September amounts with no action, date-lumped payments and full prior-payable reserves."
    },
    {
      "id": "recovery",
      "title": "Bounded recovery candidate",
      "useCandidate": true,
      "assumptions": {},
      "description": "Best of the documented finite strategy grid, not a guarantee or a global optimum."
    },
    {
      "id": "delayed-receipts",
      "title": "Receipts +10 days",
      "useCandidate": true,
      "assumptions": {
        "receiptDelayDays": 10
      },
      "description": "Every candidate receipt moves ten days; cycle totals are conserved, including beyond-horizon receivables."
    },
    {
      "id": "weaker-demand",
      "title": "Demand −20%",
      "useCandidate": true,
      "assumptions": {
        "demandBps": 8000
      },
      "description": "Only 80% of the assumed September receipt pool remains each cycle, with unchanged payroll and refunds."
    },
    {
      "id": "combined-stress",
      "title": "Delay + weaker demand",
      "useCandidate": true,
      "assumptions": {
        "receiptDelayDays": 10,
        "demandBps": 8000
      },
      "description": "The same candidate, not re-optimized: both ten-day receipt delay and 20% lower demand."
    }
  ],
  "search": {
    "description": "All 64 subsets of six actions under each of two fixed start schedules: 128 candidates, including empty plans. Default 300-minute support request. Reject prerequisite, due-date, total-budget and daily-capacity violations before scoring. Nothing here authorizes the seed's blocked work.",
    "ranking": [
      "latest strict cash-floor breach (censored at horizon + 1)",
      "latest first unfunded payment (censored at horizon + 1)",
      "most prospective urgent tickets selected",
      "highest end scheduled cash",
      "lowest sunk fees",
      "stable strategy id"
    ],
    "schedules": [
      {
        "id": "early",
        "starts": {
          "queue-repair": 1,
          "support-slice": 6,
          "contractor-cut": 1,
          "hosting-cut": 1,
          "receipt-pull": 1,
          "defer-payable": 1
        }
      },
      {
        "id": "staged",
        "starts": {
          "queue-repair": 5,
          "support-slice": 10,
          "contractor-cut": 8,
          "hosting-cut": 8,
          "receipt-pull": 8,
          "defer-payable": 5
        }
      }
    ],
    "thresholdScan": {
      "receiptDelayDays": [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14
      ],
      "demandBps": [
        10000,
        9000,
        8000,
        7000
      ]
    },
    "limitations": [
      "Only two start schedules and six authored actions; no continuous optimization.",
      "The best-scoring policy can still fail the floor and run out of cash.",
      "Consent and physical feasibility of every modeled intervention are unverified.",
      "Delayed receipts and weaker demand do not trigger a new search or a hidden rescue."
    ]
  }
};
const STUDY = {
  "candidate": {
    "id": "early-010111",
    "plan": [
      {
        "id": "queue-repair",
        "startDay": 1
      },
      {
        "id": "support-slice",
        "startDay": 6
      },
      {
        "id": "contractor-cut",
        "startDay": 1
      },
      {
        "id": "receipt-pull",
        "startDay": 1
      }
    ],
    "actionPlanFeasible": true,
    "floorMaintained": false,
    "cashFundedThroughHorizon": false,
    "recoveryExistsWithinHorizon": false,
    "firstFloorDay": 58,
    "firstUnfundedDay": 90,
    "earliestWarningDay": 0,
    "floorEscalationDay": 51,
    "fundingEscalationDay": 83,
    "finalScheduledCashCents": 245000,
    "finalAvailableCents": 245000,
    "finalPriorPayableReserveCents": 0,
    "minimumCashCents": -262500,
    "minimumAvailableCents": -262500,
    "minimumFloorHeadroomCents": -1462500,
    "receiptsWithinHorizonCents": 4350000,
    "outflowsWithinHorizonCents": 7345000,
    "scheduledActionCostsCents": 45000,
    "endingCycleRecurringBurnCents": 750000,
    "urgentTicketsProspectivelySelected": 3,
    "supportMinutes": 300,
    "issues": []
  },
  "evaluatedCount": 128,
  "validCount": 49,
  "rejectedCount": 79,
  "floorAndFundingSurvivors": 0,
  "scenarios": [
    {
      "id": "baseline",
      "title": "No intervention",
      "summary": {
        "actionPlanFeasible": true,
        "floorMaintained": false,
        "cashFundedThroughHorizon": false,
        "recoveryExistsWithinHorizon": false,
        "firstFloorDay": 28,
        "firstUnfundedDay": 59,
        "earliestWarningDay": 0,
        "floorEscalationDay": 21,
        "fundingEscalationDay": 52,
        "finalScheduledCashCents": -10000,
        "finalAvailableCents": -10000,
        "finalPriorPayableReserveCents": 0,
        "minimumCashCents": -1460000,
        "minimumAvailableCents": -1460000,
        "minimumFloorHeadroomCents": -2660000,
        "receiptsWithinHorizonCents": 4350000,
        "outflowsWithinHorizonCents": 7600000,
        "scheduledActionCostsCents": 0,
        "endingCycleRecurringBurnCents": 900000,
        "urgentTicketsProspectivelySelected": 0,
        "supportMinutes": 0
      }
    },
    {
      "id": "recovery",
      "title": "Bounded recovery candidate",
      "summary": {
        "actionPlanFeasible": true,
        "floorMaintained": false,
        "cashFundedThroughHorizon": false,
        "recoveryExistsWithinHorizon": false,
        "firstFloorDay": 58,
        "firstUnfundedDay": 90,
        "earliestWarningDay": 0,
        "floorEscalationDay": 51,
        "fundingEscalationDay": 83,
        "finalScheduledCashCents": 245000,
        "finalAvailableCents": 245000,
        "finalPriorPayableReserveCents": 0,
        "minimumCashCents": -262500,
        "minimumAvailableCents": -262500,
        "minimumFloorHeadroomCents": -1462500,
        "receiptsWithinHorizonCents": 4350000,
        "outflowsWithinHorizonCents": 7345000,
        "scheduledActionCostsCents": 45000,
        "endingCycleRecurringBurnCents": 750000,
        "urgentTicketsProspectivelySelected": 3,
        "supportMinutes": 300
      }
    },
    {
      "id": "delayed-receipts",
      "title": "Receipts +10 days",
      "summary": {
        "actionPlanFeasible": true,
        "floorMaintained": false,
        "cashFundedThroughHorizon": false,
        "recoveryExistsWithinHorizon": false,
        "firstFloorDay": 28,
        "firstUnfundedDay": 59,
        "earliestWarningDay": 0,
        "floorEscalationDay": 21,
        "fundingEscalationDay": 52,
        "finalScheduledCashCents": -262500,
        "finalAvailableCents": -262500,
        "finalPriorPayableReserveCents": 0,
        "minimumCashCents": -1205000,
        "minimumAvailableCents": -1205000,
        "minimumFloorHeadroomCents": -2405000,
        "receiptsWithinHorizonCents": 3842500,
        "outflowsWithinHorizonCents": 7345000,
        "scheduledActionCostsCents": 45000,
        "endingCycleRecurringBurnCents": 750000,
        "urgentTicketsProspectivelySelected": 3,
        "supportMinutes": 300
      }
    },
    {
      "id": "weaker-demand",
      "title": "Demand −20%",
      "summary": {
        "actionPlanFeasible": true,
        "floorMaintained": false,
        "cashFundedThroughHorizon": false,
        "recoveryExistsWithinHorizon": false,
        "firstFloorDay": 30,
        "firstUnfundedDay": 88,
        "earliestWarningDay": 0,
        "floorEscalationDay": 23,
        "fundingEscalationDay": 81,
        "finalScheduledCashCents": -625000,
        "finalAvailableCents": -625000,
        "finalPriorPayableReserveCents": 0,
        "minimumCashCents": -1031000,
        "minimumAvailableCents": -1031000,
        "minimumFloorHeadroomCents": -2231000,
        "receiptsWithinHorizonCents": 3480000,
        "outflowsWithinHorizonCents": 7345000,
        "scheduledActionCostsCents": 45000,
        "endingCycleRecurringBurnCents": 1040000,
        "urgentTicketsProspectivelySelected": 3,
        "supportMinutes": 300
      }
    },
    {
      "id": "combined-stress",
      "title": "Delay + weaker demand",
      "summary": {
        "actionPlanFeasible": true,
        "floorMaintained": false,
        "cashFundedThroughHorizon": false,
        "recoveryExistsWithinHorizon": false,
        "firstFloorDay": 28,
        "firstUnfundedDay": 58,
        "earliestWarningDay": 0,
        "floorEscalationDay": 21,
        "fundingEscalationDay": 51,
        "finalScheduledCashCents": -1031000,
        "finalAvailableCents": -1031000,
        "finalPriorPayableReserveCents": 0,
        "minimumCashCents": -1785000,
        "minimumAvailableCents": -1785000,
        "minimumFloorHeadroomCents": -2985000,
        "receiptsWithinHorizonCents": 3074000,
        "outflowsWithinHorizonCents": 7345000,
        "scheduledActionCostsCents": 45000,
        "endingCycleRecurringBurnCents": 1040000,
        "urgentTicketsProspectivelySelected": 3,
        "supportMinutes": 300
      }
    }
  ],
  "thresholds": [
    {
      "demandBps": 10000,
      "receiptDelayDays": 0,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 58,
      "firstUnfundedDay": 90,
      "earliestWarningDay": 0,
      "floorEscalationDay": 51,
      "fundingEscalationDay": 83,
      "finalScheduledCashCents": 245000,
      "finalAvailableCents": 245000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -262500,
      "minimumAvailableCents": -262500,
      "minimumFloorHeadroomCents": -1462500,
      "receiptsWithinHorizonCents": 4350000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 1,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 58,
      "firstUnfundedDay": 90,
      "earliestWarningDay": 0,
      "floorEscalationDay": 51,
      "fundingEscalationDay": 83,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -262500,
      "minimumAvailableCents": -262500,
      "minimumFloorHeadroomCents": -1462500,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 2,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 58,
      "firstUnfundedDay": 90,
      "earliestWarningDay": 0,
      "floorEscalationDay": 51,
      "fundingEscalationDay": 83,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -262500,
      "minimumAvailableCents": -262500,
      "minimumFloorHeadroomCents": -1462500,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 3,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 58,
      "firstUnfundedDay": 90,
      "earliestWarningDay": 0,
      "floorEscalationDay": 51,
      "fundingEscalationDay": 83,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -262500,
      "minimumAvailableCents": -262500,
      "minimumFloorHeadroomCents": -1462500,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 4,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 58,
      "firstUnfundedDay": 90,
      "earliestWarningDay": 0,
      "floorEscalationDay": 51,
      "fundingEscalationDay": 83,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -262500,
      "minimumAvailableCents": -262500,
      "minimumFloorHeadroomCents": -1462500,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 5,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 58,
      "firstUnfundedDay": 90,
      "earliestWarningDay": 0,
      "floorEscalationDay": 51,
      "fundingEscalationDay": 83,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -262500,
      "minimumAvailableCents": -262500,
      "minimumFloorHeadroomCents": -1462500,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 6,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 58,
      "firstUnfundedDay": 90,
      "earliestWarningDay": 0,
      "floorEscalationDay": 51,
      "fundingEscalationDay": 83,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -262500,
      "minimumAvailableCents": -262500,
      "minimumFloorHeadroomCents": -1462500,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 7,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 58,
      "firstUnfundedDay": 90,
      "earliestWarningDay": 0,
      "floorEscalationDay": 51,
      "fundingEscalationDay": 83,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -262500,
      "minimumAvailableCents": -262500,
      "minimumFloorHeadroomCents": -1462500,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 8,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -705000,
      "minimumAvailableCents": -705000,
      "minimumFloorHeadroomCents": -1905000,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 9,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 59,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 52,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -855000,
      "minimumAvailableCents": -855000,
      "minimumFloorHeadroomCents": -2055000,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 10,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 59,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 52,
      "finalScheduledCashCents": -262500,
      "finalAvailableCents": -262500,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1205000,
      "minimumAvailableCents": -1205000,
      "minimumFloorHeadroomCents": -2405000,
      "receiptsWithinHorizonCents": 3842500,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 11,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 59,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 52,
      "finalScheduledCashCents": -1205000,
      "finalAvailableCents": -1205000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1205000,
      "minimumAvailableCents": -1205000,
      "minimumFloorHeadroomCents": -2405000,
      "receiptsWithinHorizonCents": 2900000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 12,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 59,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 52,
      "finalScheduledCashCents": -1205000,
      "finalAvailableCents": -1205000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1205000,
      "minimumAvailableCents": -1205000,
      "minimumFloorHeadroomCents": -2405000,
      "receiptsWithinHorizonCents": 2900000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 13,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 59,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 52,
      "finalScheduledCashCents": -1205000,
      "finalAvailableCents": -1205000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1205000,
      "minimumAvailableCents": -1205000,
      "minimumFloorHeadroomCents": -2405000,
      "receiptsWithinHorizonCents": 2900000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 10000,
      "receiptDelayDays": 14,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 59,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 52,
      "finalScheduledCashCents": -1205000,
      "finalAvailableCents": -1205000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1205000,
      "minimumAvailableCents": -1205000,
      "minimumFloorHeadroomCents": -2405000,
      "receiptsWithinHorizonCents": 2900000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 750000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 0,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -190000,
      "finalAvailableCents": -190000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -646750,
      "minimumAvailableCents": -646750,
      "minimumFloorHeadroomCents": -1846750,
      "receiptsWithinHorizonCents": 3915000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 1,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -646750,
      "minimumAvailableCents": -646750,
      "minimumFloorHeadroomCents": -1846750,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 2,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -646750,
      "minimumAvailableCents": -646750,
      "minimumFloorHeadroomCents": -1846750,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 3,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -646750,
      "minimumAvailableCents": -646750,
      "minimumFloorHeadroomCents": -1846750,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 4,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -646750,
      "minimumAvailableCents": -646750,
      "minimumFloorHeadroomCents": -1846750,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 5,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -646750,
      "minimumAvailableCents": -646750,
      "minimumFloorHeadroomCents": -1846750,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 6,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -646750,
      "minimumAvailableCents": -646750,
      "minimumFloorHeadroomCents": -1846750,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 7,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -646750,
      "minimumAvailableCents": -646750,
      "minimumFloorHeadroomCents": -1846750,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 8,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -995000,
      "minimumAvailableCents": -995000,
      "minimumFloorHeadroomCents": -2195000,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 9,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1145000,
      "minimumAvailableCents": -1145000,
      "minimumFloorHeadroomCents": -2345000,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 10,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -646750,
      "finalAvailableCents": -646750,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1495000,
      "minimumAvailableCents": -1495000,
      "minimumFloorHeadroomCents": -2695000,
      "receiptsWithinHorizonCents": 3458250,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 11,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1495000,
      "finalAvailableCents": -1495000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1495000,
      "minimumAvailableCents": -1495000,
      "minimumFloorHeadroomCents": -2695000,
      "receiptsWithinHorizonCents": 2610000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 12,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1495000,
      "finalAvailableCents": -1495000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1495000,
      "minimumAvailableCents": -1495000,
      "minimumFloorHeadroomCents": -2695000,
      "receiptsWithinHorizonCents": 2610000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 13,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1495000,
      "finalAvailableCents": -1495000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1495000,
      "minimumAvailableCents": -1495000,
      "minimumFloorHeadroomCents": -2695000,
      "receiptsWithinHorizonCents": 2610000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 9000,
      "receiptDelayDays": 14,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1495000,
      "finalAvailableCents": -1495000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1495000,
      "minimumAvailableCents": -1495000,
      "minimumFloorHeadroomCents": -2695000,
      "receiptsWithinHorizonCents": 2610000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 895000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 0,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -625000,
      "finalAvailableCents": -625000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1031000,
      "minimumAvailableCents": -1031000,
      "minimumFloorHeadroomCents": -2231000,
      "receiptsWithinHorizonCents": 3480000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 1,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1031000,
      "minimumAvailableCents": -1031000,
      "minimumFloorHeadroomCents": -2231000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 2,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1031000,
      "minimumAvailableCents": -1031000,
      "minimumFloorHeadroomCents": -2231000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 3,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1031000,
      "minimumAvailableCents": -1031000,
      "minimumFloorHeadroomCents": -2231000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 4,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1031000,
      "minimumAvailableCents": -1031000,
      "minimumFloorHeadroomCents": -2231000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 5,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1031000,
      "minimumAvailableCents": -1031000,
      "minimumFloorHeadroomCents": -2231000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 6,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1031000,
      "minimumAvailableCents": -1031000,
      "minimumFloorHeadroomCents": -2231000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 7,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 88,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 81,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1031000,
      "minimumAvailableCents": -1031000,
      "minimumFloorHeadroomCents": -2231000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 8,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1285000,
      "minimumAvailableCents": -1285000,
      "minimumFloorHeadroomCents": -2485000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 9,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1435000,
      "minimumAvailableCents": -1435000,
      "minimumFloorHeadroomCents": -2635000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 10,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1031000,
      "finalAvailableCents": -1031000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1785000,
      "minimumAvailableCents": -1785000,
      "minimumFloorHeadroomCents": -2985000,
      "receiptsWithinHorizonCents": 3074000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 11,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1785000,
      "finalAvailableCents": -1785000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1785000,
      "minimumAvailableCents": -1785000,
      "minimumFloorHeadroomCents": -2985000,
      "receiptsWithinHorizonCents": 2320000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 12,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1785000,
      "finalAvailableCents": -1785000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1785000,
      "minimumAvailableCents": -1785000,
      "minimumFloorHeadroomCents": -2985000,
      "receiptsWithinHorizonCents": 2320000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 13,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1785000,
      "finalAvailableCents": -1785000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1785000,
      "minimumAvailableCents": -1785000,
      "minimumFloorHeadroomCents": -2985000,
      "receiptsWithinHorizonCents": 2320000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 8000,
      "receiptDelayDays": 14,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1785000,
      "finalAvailableCents": -1785000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1785000,
      "minimumAvailableCents": -1785000,
      "minimumFloorHeadroomCents": -2985000,
      "receiptsWithinHorizonCents": 2320000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1040000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 0,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 60,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 53,
      "finalScheduledCashCents": -1060000,
      "finalAvailableCents": -1060000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1415250,
      "minimumAvailableCents": -1415250,
      "minimumFloorHeadroomCents": -2615250,
      "receiptsWithinHorizonCents": 3045000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 1,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 60,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 53,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1415250,
      "minimumAvailableCents": -1415250,
      "minimumFloorHeadroomCents": -2615250,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 2,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 60,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 53,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1415250,
      "minimumAvailableCents": -1415250,
      "minimumFloorHeadroomCents": -2615250,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 3,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 60,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 53,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1415250,
      "minimumAvailableCents": -1415250,
      "minimumFloorHeadroomCents": -2615250,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 4,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 60,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 53,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1415250,
      "minimumAvailableCents": -1415250,
      "minimumFloorHeadroomCents": -2615250,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 5,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 60,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 53,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1415250,
      "minimumAvailableCents": -1415250,
      "minimumFloorHeadroomCents": -2615250,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 6,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 60,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 53,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1415250,
      "minimumAvailableCents": -1415250,
      "minimumFloorHeadroomCents": -2615250,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 7,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 30,
      "firstUnfundedDay": 60,
      "earliestWarningDay": 0,
      "floorEscalationDay": 23,
      "fundingEscalationDay": 53,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1415250,
      "minimumAvailableCents": -1415250,
      "minimumFloorHeadroomCents": -2615250,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 8,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1575000,
      "minimumAvailableCents": -1575000,
      "minimumFloorHeadroomCents": -2775000,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 9,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -1725000,
      "minimumAvailableCents": -1725000,
      "minimumFloorHeadroomCents": -2925000,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 10,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -1415250,
      "finalAvailableCents": -1415250,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -2075000,
      "minimumAvailableCents": -2075000,
      "minimumFloorHeadroomCents": -3275000,
      "receiptsWithinHorizonCents": 2689750,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 11,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -2075000,
      "finalAvailableCents": -2075000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -2075000,
      "minimumAvailableCents": -2075000,
      "minimumFloorHeadroomCents": -3275000,
      "receiptsWithinHorizonCents": 2030000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 12,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -2075000,
      "finalAvailableCents": -2075000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -2075000,
      "minimumAvailableCents": -2075000,
      "minimumFloorHeadroomCents": -3275000,
      "receiptsWithinHorizonCents": 2030000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 13,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -2075000,
      "finalAvailableCents": -2075000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -2075000,
      "minimumAvailableCents": -2075000,
      "minimumFloorHeadroomCents": -3275000,
      "receiptsWithinHorizonCents": 2030000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    },
    {
      "demandBps": 7000,
      "receiptDelayDays": 14,
      "actionPlanFeasible": true,
      "floorMaintained": false,
      "cashFundedThroughHorizon": false,
      "recoveryExistsWithinHorizon": false,
      "firstFloorDay": 28,
      "firstUnfundedDay": 58,
      "earliestWarningDay": 0,
      "floorEscalationDay": 21,
      "fundingEscalationDay": 51,
      "finalScheduledCashCents": -2075000,
      "finalAvailableCents": -2075000,
      "finalPriorPayableReserveCents": 0,
      "minimumCashCents": -2075000,
      "minimumAvailableCents": -2075000,
      "minimumFloorHeadroomCents": -3275000,
      "receiptsWithinHorizonCents": 2030000,
      "outflowsWithinHorizonCents": 7345000,
      "scheduledActionCostsCents": 45000,
      "endingCycleRecurringBurnCents": 1185000,
      "urgentTicketsProspectivelySelected": 3,
      "supportMinutes": 300
    }
  ]
};


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

})();
