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

export function dollarsToCents(value) {
  if (typeof value !== "string" || !/^\d+\.\d{2}$/.test(value)) {
    throw new Error(`Expected nonnegative decimal dollars with two places: ${value}`);
  }
  return integer(Number(value.replace(".", "")), "money cents");
}

export function dateForDay(inputs, day) {
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

export function reconcile(inputs) {
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

export function selectSupport(tickets, budgetMinutes) {
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

export function backlogImpact(inputs) {
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

export function resolveAssumptions(inputs, overrides = {}) {
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

export function compilePlan(inputs, plan, overrides = {}) {
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

export function buildSchedule(inputs, plan = [], overrides = {}) {
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

export function simulate(inputs, plan = [], overrides = {}) {
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

export function searchStrategies(inputs, experiments) {
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

export function runExperiments(inputs, experiments) {
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
