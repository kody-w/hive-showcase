import test from "node:test";
import assert from "node:assert/strict";
import { loadInputs, readJSON, verifyCopiedData, parseCsv } from "../scripts/inputs.mjs";
import {
  dollarsToCents, dateForDay, reconcile, selectSupport, backlogImpact,
  resolveAssumptions, compilePlan, buildSchedule, simulate, searchStrategies, runExperiments
} from "../model.mjs";

const inputs = loadInputs();
const experiments = readJSON("data/scenarios.json");
const candidate = [
  { id: "queue-repair", startDay: 1 },
  { id: "support-slice", startDay: 6 },
  { id: "contractor-cut", startDay: 1 },
  { id: "receipt-pull", startDay: 1 }
];
const add = (rows, key) => rows.reduce((n, row) => n + row[key], 0);

test("all nine copied inert data/license files match exact seed hashes", () => {
  assert.equal(verifyCopiedData(), 9);
});

test("decimal money parsing rejects rounding, negatives and unsafe values", () => {
  assert.equal(dollarsToCents("0.01"), 1);
  assert.equal(dollarsToCents("14500.00"), 1450000);
  for (const value of ["1.234", "1e3", "12", "-1.00", "NaN", "9007199254740991.00", 100]) {
    assert.throws(() => dollarsToCents(value));
  }
});

test("reviewed CSV parser rejects duplicate headers, wrong widths and quoted formats", () => {
  assert.deepEqual(parseCsv("a,b\nx,y\n"), [{ a: "x", b: "y" }]);
  for (const value of ["a,a\nx,y\n", "a,b\nx\n", 'a,b\n"x",y\n']) assert.throws(() => parseCsv(value));
});

test("15-row ledger, subscriptions and incremental reserves reconcile independently", () => {
  const result = reconcile(inputs);
  assert.equal(result.openingCashCents, 5200000);
  assert.equal(result.receiptsCents, 4850000);
  assert.equal(result.paymentsCents, 6810000);
  assert.equal(result.closingCashCents, 3240000);
  assert.equal(result.ledgerRows, 15);
  assert.deepEqual(result.months.map(row => row.netCents), [-400000, -660000, -900000]);
  assert.equal(result.reserveCents, 550000);
  assert.equal(result.availableCents, 2690000);
  assert.equal(result.headroomCents, 1490000);
  assert.ok(Math.abs(result.smoothedComparison.daysToFloorAfterReserve - 49.6666666667) < 1e-8);
  assert.ok(Math.abs(result.smoothedComparison.daysToZeroAfterReserve - 89.6666666667) < 1e-8);
  assert.equal(add(inputs.payables, "amountCents"), 550000);
});

test("cash reconciliation rejects duplicates, bad directions, dates and billing mismatches", () => {
  let bad = structuredClone(inputs);
  bad.ledger.push(bad.ledger[0]);
  assert.throws(() => reconcile(bad), /duplicate/);
  bad = structuredClone(inputs);
  bad.ledger[0].direction = "profit";
  assert.throws(() => reconcile(bad), /direction/);
  bad = structuredClone(inputs);
  bad.ledger[0].date = "2026-02-30";
  assert.throws(() => reconcile(bad), /date/);
  bad = structuredClone(inputs);
  bad.subscriptions[0].accounts++;
  assert.throws(() => reconcile(bad), /mismatch/);
  bad = structuredClone(inputs);
  bad.payables.push(bad.payables[0]);
  assert.throws(() => reconcile(bad), /duplicate/);
});

test("seed scenario difference is $1,700, not invented sales", () => {
  const burns = inputs.rates.map(row => row.payrollCents + row.contractorsCents + row.hostingCents + row.refundsCents - row.receiptsCents);
  assert.deepEqual(burns, [900000, 730000]);
  assert.equal(burns[0] - burns[1], 170000);
  assert.equal(inputs.rates[0].receiptsCents, inputs.rates[1].receiptsCents);
});

test("backlog impact retains twelve tickets, four urgent and a blocked urgent without revenue attribution", () => {
  const result = backlogImpact(inputs);
  assert.equal(result.openTickets, 12);
  assert.equal(result.urgentTickets, 4);
  assert.equal(result.blockedUrgentTickets, 1);
  assert.equal(result.affectedAccountsNotSummed, true);
  assert.equal(result.receiptRecoveryCreditedCents, 0);
  assert.equal(result.tickets.find(row => row.id === "ticket-001").ageDays, 20);
});

test("original non-preemptive selector reproduces 420-minute seed-data expectation", () => {
  const selected = selectSupport(inputs.tickets, 420);
  assert.deepEqual(selected.selected, ["ticket-001", "ticket-010", "ticket-007", "ticket-011", "ticket-005", "ticket-008"]);
  assert.equal(selected.usedMinutes, 420);
  assert.equal(selected.deferred.length, 5);
  assert.deepEqual(selected.blocked, ["ticket-004"]);
  assert.equal(selected.excluded.length, 0);
  assert.deepEqual(selectSupport(inputs.tickets, 300).selected, ["ticket-001", "ticket-010", "ticket-007", "ticket-011"]);
});

test("zero capacity, invalid budgets, unknown severity and duplicate tickets are explicit", () => {
  const empty = selectSupport(inputs.tickets, 0);
  assert.equal(empty.selected.length, 0);
  assert.equal(empty.deferred.length, 11);
  assert.equal(empty.blocked.length, 1);
  for (const budget of [-1, NaN, Infinity, 1.5, 421]) assert.throws(() => selectSupport(inputs.tickets, budget));
  assert.throws(() => selectSupport([...inputs.tickets, inputs.tickets[0]], 100), /duplicate/);
  const bad = structuredClone(inputs.tickets);
  bad[0].priority = "__proto__";
  assert.throws(() => selectSupport(bad, 100), /severity/);
});

test("ties are stable by ID, closed and blocked rows cannot be selected", () => {
  const a = { ...inputs.tickets[0], id: "z", minutes: 30 };
  const b = { ...a, id: "a" };
  const closed = { ...a, id: "closed", state: "closed" };
  const blocked = { ...a, id: "blocked", blockedBy: "evidence" };
  assert.deepEqual(selectSupport([a, closed, b, blocked], 30).selected, ["a"]);
  assert.deepEqual(selectSupport([blocked, b, closed, a], 30).selected, ["a"]);
  assert.deepEqual(selectSupport([closed], 300).excluded, ["closed"]);
});

test("calendar days are UTC-stable and working-day readiness respects weekends", () => {
  assert.equal(dateForDay(inputs, 0), "2026-09-30");
  assert.equal(dateForDay(inputs, 90), "2026-12-29");
  const plan = compilePlan(inputs, [{ id: "queue-repair", startDay: 1 }]);
  assert.deepEqual(plan.actions[0].workDays, [1, 2, 5]);
  assert.equal(plan.actions[0].readyDay, 6);
  const weekend = compilePlan(inputs, [{ id: "hosting-cut", startDay: 3 }]);
  assert.equal(weekend.actions[0].startDay, 5);
  assert.deepEqual(weekend.actions[0].workDays, [5, 6]);
  assert.equal(weekend.actions[0].readyDay, 15);
});

test("prerequisites and readiness cannot be skipped to get an instant support benefit", () => {
  assert.equal(compilePlan(inputs, [{ id: "support-slice", startDay: 6 }]).feasible, false);
  const tooSoon = compilePlan(inputs, [{ id: "queue-repair", startDay: 1 }, { id: "support-slice", startDay: 5 }]);
  assert.equal(tooSoon.feasible, false);
  assert.match(tooSoon.issues.join(" "), /ready before/);
  const fits = compilePlan(inputs, [{ id: "queue-repair", startDay: 1 }, { id: "support-slice", startDay: 6 }]);
  assert.equal(fits.feasible, true);
});

test("total budgets cannot be replenished by spreading actions across weeks", () => {
  const plan = compilePlan(inputs, [
    { id: "queue-repair", startDay: 1 }, { id: "hosting-cut", startDay: 20 }
  ]);
  assert.equal(plan.used.engineering, 480);
  assert.equal(plan.capacity.engineering, 360);
  assert.equal(plan.feasible, false);
  assert.match(plan.issues.join(" "), /one-time budget/);
});

test("daily capacity matters even when the total review budget fits", () => {
  const plan = compilePlan(inputs, [
    { id: "contractor-cut", startDay: 1 }, { id: "defer-payable", startDay: 1 }
  ]);
  assert.equal(plan.used.review, 120);
  assert.equal(plan.capacity.review, 180);
  assert.equal(plan.feasible, false);
  assert.match(plan.issues.join(" "), /Day 1 review load 120 exceeds daily cap 90/);
});

test("candidate resources reconcile with every daily allocation and compete with a full support slice", () => {
  const plan = compilePlan(inputs, candidate);
  assert.equal(plan.feasible, true);
  assert.deepEqual(plan.used, { engineering: 360, support: 390, review: 120 });
  for (const bucket of ["engineering", "support", "review"]) {
    assert.equal(add(plan.dailyAllocation, bucket), plan.used[bucket]);
    assert.ok(plan.dailyAllocation.every(row => row[bucket] <= plan.dailyCapacity[bucket]));
  }
  assert.equal(compilePlan(inputs, candidate, { supportSliceMinutes: 420 }).feasible, false);
});

test("cost reductions wait for lead time and never cancel an existing full-cycle bill", () => {
  const early = buildSchedule(inputs, [{ id: "contractor-cut", startDay: 1 }]);
  assert.equal(early.compiled.actions[0].readyDay, 15);
  assert.deepEqual(early.cycles.map(row => row.costs.contractors), [300000, 150000, 150000]);
  const late = buildSchedule(inputs, [{ id: "contractor-cut", startDay: 20 }]);
  assert.equal(late.compiled.actions[0].readyDay, 34);
  assert.deepEqual(late.cycles.map(row => row.costs.contractors), [300000, 300000, 150000]);
  assert.equal(early.events.find(row => row.id === "fee-contractor-cut").day, 1);
  assert.equal(early.events.find(row => row.id === "fee-contractor-cut").amountCents, 30000);
});

test("failed consent keeps sunk fees and resource use but removes all cost benefits", () => {
  const result = simulate(inputs, [{ id: "contractor-cut", startDay: 1 }], { contractorConsent: false });
  assert.equal(result.resources.used.review, 60);
  assert.equal(result.summary.scheduledActionCostsCents, 30000);
  assert.deepEqual(result.cycles.map(row => row.costs.contractors), [300000, 300000, 300000]);
  assert.equal(result.summary.finalScheduledCashCents, simulate(inputs).summary.finalScheduledCashCents - 30000);
});

test("invalid action proposals are rejected explicitly, not applied partially or silently rescued", () => {
  const invalid = [{ id: "queue-repair", startDay: 1 }, { id: "hosting-cut", startDay: 1 }];
  const result = simulate(inputs, invalid);
  assert.equal(result.summary.actionPlanFeasible, false);
  assert.equal(result.summary.scheduledActionCostsCents, 0);
  assert.equal(result.summary.recoveryExistsWithinHorizon, false);
  assert.deepEqual(result.events, simulate(inputs).events);
  assert.ok(result.flags.some(row => row.code === "RESOURCE_OR_SEQUENCE"));
});

test("payables are paid only once and reserve releases do not create receipts", () => {
  const result = simulate(inputs);
  const payables = result.events.filter(row => row.kind === "payable");
  assert.equal(payables.length, 3);
  assert.equal(add(payables, "amountCents"), 550000);
  assert.equal(add(payables, "reserveReleaseCents"), 550000);
  assert.deepEqual(payables.map(row => row.day), [2, 5, 10]);
  for (const day of [2, 5, 10]) {
    assert.equal(result.daily[day].availableCents, result.daily[day - 1].availableCents);
    assert.equal(result.daily[day].receiptsCents, 0);
  }
});

test("deferring a bill preserves principal/reserves, adds an irreversible fee and reduces support capacity", () => {
  const original = simulate(inputs);
  const deferred = simulate(inputs, [{ id: "defer-payable", startDay: 1 }]);
  const event = deferred.events.find(row => row.id === "arrears-support");
  assert.equal(event.originalDay, 10);
  assert.equal(event.day, 40);
  assert.equal(event.principalCents, 250000);
  assert.equal(event.deferralFeeCents, 12500);
  assert.equal(event.amountCents, 262500);
  assert.equal(deferred.resources.capacity.support, 300);
  assert.equal(deferred.daily[10].reserveCents, 262500);
  assert.equal(deferred.daily[10].cashCents, original.daily[10].cashCents + 240000);
  assert.equal(deferred.daily[10].availableCents, original.daily[10].availableCents - 22500);
  assert.equal(deferred.summary.finalScheduledCashCents, original.summary.finalScheduledCashCents - 22500);
});

test("deferral beyond a short horizon is still reserved, and failed consent or a late attempt cannot erase the bill", () => {
  const plan = [{ id: "defer-payable", startDay: 1 }];
  const short = simulate(inputs, plan, { horizonDays: 30 });
  assert.equal(short.summary.finalPriorPayableReserveCents, 262500);
  assert.equal(short.afterHorizon.find(row => row.id === "arrears-support").amountCents, 262500);
  const failed = simulate(inputs, plan, { deferralConsent: false });
  assert.equal(failed.events.find(row => row.id === "arrears-support").day, 10);
  assert.equal(failed.resources.capacity.support, 420);
  assert.equal(failed.summary.scheduledActionCostsCents, 10000);
  assert.equal(failed.events.find(row => row.id === "arrears-support").amountCents, 250000);
  const late = simulate(inputs, [{ id: "defer-payable", startDay: 8 }]);
  assert.equal(late.resources.feasible, false);
  assert.match(late.resources.issues.join(" "), /too late/);
});

test("receipt acceleration splits the same cycle pool with unique IDs; no duplicated or new sales", () => {
  const original = buildSchedule(inputs);
  const moved = buildSchedule(inputs, [{ id: "receipt-pull", startDay: 1 }]);
  assert.deepEqual(moved.cycles.map(row => row.earlyReceiptCents), [942500, 942500, 942500]);
  for (const cycle of moved.cycles) {
    assert.equal(cycle.earlyReceiptCents + cycle.regularReceiptCents, cycle.receiptPoolCents);
  }
  assert.equal(moved.receiptConservation.assumedCyclePoolCents, original.receiptConservation.assumedCyclePoolCents);
  assert.equal(moved.receiptConservation.timingCreatedReceiptsCents, 0);
  assert.equal(new Set(moved.events.map(row => row.id)).size, moved.events.length);
  assert.equal(moved.events.find(row => row.id === "receipts-cycle-1-early").day, 20);
  assert.equal(moved.events.find(row => row.id === "receipts-cycle-1-regular").day, 30);
});

test("late collection readiness and failed receipt consent cannot retrospectively accelerate receipts", () => {
  const late = buildSchedule(inputs, [{ id: "receipt-pull", startDay: 15 }]);
  assert.equal(late.compiled.actions[0].readyDay, 22);
  assert.equal(late.cycles[0].earlyReceiptCents, 0);
  assert.equal(late.cycles[1].earlyReceiptCents, 942500);
  const failed = buildSchedule(inputs, [{ id: "receipt-pull", startDay: 1 }], { receiptConsent: false });
  assert.equal(failed.cycles[0].earlyReceiptCents, 0);
  assert.equal(failed.events.find(row => row.id === "fee-receipt-pull").amountCents, 15000);
});

test("receipt delays conserve every cent, including out-of-window receipts, without shifting outflows", () => {
  const base = buildSchedule(inputs, candidate);
  for (const delay of [1, 10, 30]) {
    const moved = buildSchedule(inputs, candidate, { receiptDelayDays: delay });
    for (const event of base.events) {
      const comparison = moved.events.find(row => row.id === event.id);
      assert.equal(comparison.amountCents, event.amountCents);
      assert.equal(comparison.day, event.day + (event.kind === "receipt" ? delay : 0));
    }
    const c = moved.receiptConservation;
    assert.equal(c.assumedCyclePoolCents, 4350000);
    assert.equal(c.scheduledWithinHorizonCents + c.scheduledAfterHorizonCents, c.assumedCyclePoolCents);
  }
  const delayed = buildSchedule(inputs, candidate, { receiptDelayDays: 10 });
  assert.equal(delayed.receiptConservation.scheduledAfterHorizonCents, 507500);
  assert.equal(delayed.receiptConservation.scheduledWithinHorizonCents, 3842500);
});

test("weaker demand removes receipts, not costs, and odd splits remain integer cents", () => {
  const weak = buildSchedule(inputs, candidate, { demandBps: 8000, receiptDelayDays: 10 });
  assert.equal(weak.receiptConservation.assumedCyclePoolCents, 3480000);
  assert.equal(weak.receiptConservation.scheduledAfterHorizonCents, 406000);
  assert.equal(weak.cycles[0].costs.payroll, 1700000);
  assert.equal(weak.cycles[0].costs.refunds, 170000);
  for (const bps of [0, 1, 3333, 9999, 10000]) {
    const odd = buildSchedule(inputs, candidate, { demandBps: bps, acceleratedBps: 3333 });
    for (const cycle of odd.cycles) {
      assert.equal(cycle.earlyReceiptCents + cycle.regularReceiptCents, cycle.receiptPoolCents);
      assert.ok(Number.isSafeInteger(cycle.earlyReceiptCents));
    }
  }
});

test("cash reconciles at every event/day and stress is deterministic, without mutating inputs", () => {
  const before = JSON.stringify(inputs);
  for (const options of [{}, { receiptDelayDays: 10 }, { demandBps: 8000 }, { receiptDelayDays: 10, demandBps: 8000 }]) {
    const result = simulate(inputs, candidate, options);
    let cash = 3240000;
    for (const event of result.events) {
      assert.equal(event.cashBeforeCents, cash);
      cash += event.deltaCents;
      assert.equal(event.cashAfterCents, cash);
      assert.ok(Number.isSafeInteger(cash));
      assert.equal(event.availableAfterCents, cash - event.reserveAfterCents);
    }
    assert.equal(cash, result.summary.finalScheduledCashCents);
    assert.equal(cash, 3240000 + result.summary.receiptsWithinHorizonCents - result.summary.outflowsWithinHorizonCents);
    for (let index = 1; index < result.daily.length; index++) {
      const row = result.daily[index];
      assert.equal(row.cashCents, result.daily[index - 1].cashCents + row.receiptsCents - row.outflowsCents);
    }
    assert.deepEqual(simulate(inputs, candidate, options), result);
  }
  assert.equal(JSON.stringify(inputs), before);
});

test("lumpy baseline fails earlier than smoothed runway; obligations precede same-day receipts", () => {
  const result = simulate(inputs);
  assert.equal(result.summary.firstFloorDay, 28);
  assert.equal(result.firstFloorBreach.eventId, "payroll-cycle-1");
  assert.equal(result.summary.firstUnfundedDay, 59);
  assert.equal(result.firstUnfundedPayment.eventId, "contractors-cycle-2");
  assert.equal(result.firstUnfundedPayment.shortfallCents, 210000);
  assert.deepEqual(result.events.filter(row => row.day === 30).map(row => row.kind), ["hosting", "refunds", "receipt"]);
});

test("intraday failure is retained even when same-day receipts leave a positive endpoint", () => {
  const result = simulate(inputs, candidate);
  assert.equal(result.summary.firstFloorDay, 58);
  assert.equal(result.summary.firstUnfundedDay, 90);
  assert.equal(result.firstUnfundedPayment.eventId, "hosting-cycle-3");
  assert.equal(result.firstUnfundedPayment.shortfallCents, 92500);
  assert.equal(result.summary.minimumCashCents, -262500);
  assert.equal(result.summary.finalScheduledCashCents, 245000);
  assert.equal(result.summary.recoveryExistsWithinHorizon, false);
  const failureIndex = result.events.findIndex(row => row.id === result.firstUnfundedPayment.eventId);
  assert.ok(result.events.slice(failureIndex).every(row => row.status === "counterfactual-after-unfunded-payment"));
  assert.ok(result.flags.some(row => row.code === "ENDING_CASH_IS_NOT_SOLVENCY"));
});

test("floor equality and zero cash equality are safe at the boundary; one cent less is not", () => {
  const exactFloor = structuredClone(inputs);
  exactFloor.case.cashFloorCents = 2690000;
  assert.equal(simulate(exactFloor, [], { horizonDays: 1 }).summary.firstFloorDay, null);
  exactFloor.case.cashFloorCents++;
  assert.equal(simulate(exactFloor, [], { horizonDays: 1 }).summary.firstFloorDay, 0);
  const exactPayment = structuredClone(inputs);
  exactPayment.case.openingCashCents = 2080000;
  const zero = simulate(exactPayment, [], { horizonDays: 2 });
  assert.equal(zero.daily[2].cashCents, 0);
  assert.equal(zero.summary.firstUnfundedDay, null);
  exactPayment.case.openingCashCents--;
  assert.equal(simulate(exactPayment, [], { horizonDays: 2 }).firstUnfundedPayment.shortfallCents, 1);
});

test("earliest forecast warning is day zero; rolling warnings are a distinct lead-time clock", () => {
  const result = simulate(inputs, candidate);
  assert.equal(result.warning.earliestForecastDay, 0);
  assert.equal(result.warning.floorEscalationDay, 51);
  assert.equal(result.warning.fundingEscalationDay, 83);
  const immediate = simulate(inputs, [], { warningLeadDays: 30 });
  assert.equal(immediate.warning.floorEscalationDay, 0);
  const zeroLead = simulate(inputs, [], { warningLeadDays: 0 });
  assert.equal(zeroLead.warning.floorEscalationDay, 28);
  const noFailure = simulate(inputs, [], { horizonDays: 1 });
  assert.equal(noFailure.warning.earliestForecastDay, null);
  assert.equal(noFailure.warning.floorEscalationDay, null);
});

test("invalid/unknown assumptions and action IDs cannot sneak in financing or unbounded values", () => {
  for (const values of [
    { rescueCash: 100000 }, { demandBps: 10001 }, { receiptDelayDays: -1 },
    { horizonDays: 91 }, { acceleratedBps: 8001 }, { contractorConsent: "yes" },
    { warningLeadDays: NaN }, { supportSliceMinutes: Infinity }
  ]) assert.throws(() => resolveAssumptions(inputs, values));
  assert.throws(() => simulate(inputs, [{ id: "new-sales", startDay: 1 }]), /Unknown action/);
  assert.throws(() => simulate(inputs, [candidate[0], candidate[0]]), /duplicate/);
  assert.throws(() => simulate(inputs, [{ id: "queue-repair", startDay: 0 }]), /startDay/);
});

test("small documented search evaluates 128 choices, rejects infeasibility and finds no full rescue", () => {
  const result = searchStrategies(inputs, experiments);
  assert.equal(result.evaluatedCount, 128);
  assert.equal(result.validCount, 49);
  assert.equal(result.rejectedCount, 79);
  assert.equal(result.floorAndFundingSurvivors, 0);
  assert.equal(result.candidate.id, "early-010111");
  assert.deepEqual(result.candidate.plan, candidate);
  assert.equal(result.candidate.urgentTicketsProspectivelySelected, 3);
  assert.equal(result.candidate.endingCycleRecurringBurnCents, 750000);
});

test("five frozen experiment outcomes include combined stress and retain the same candidate", () => {
  const study = runExperiments(inputs, experiments);
  assert.deepEqual(study.scenarios.map(row => [
    row.id, row.result.summary.firstFloorDay, row.result.summary.firstUnfundedDay,
    row.result.summary.finalScheduledCashCents
  ]), [
    ["baseline", 28, 59, -10000],
    ["recovery", 58, 90, 245000],
    ["delayed-receipts", 28, 59, -262500],
    ["weaker-demand", 30, 88, -625000],
    ["combined-stress", 28, 58, -1031000]
  ]);
  for (const scenario of study.scenarios.slice(1)) assert.deepEqual(scenario.result.plan, candidate);
  assert.equal(study.thresholds.grid.length, 60);
  assert.equal(study.thresholds.floorSafeCells, 0);
  assert.ok(study.scenarios.every(row => row.result.authority.referenceWorkAccepted === false));
});
