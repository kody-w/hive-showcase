import { canonical, simulate } from './engine.mjs';

export const ANCHOR_IDS = Array.from({ length: 8 }, (_, index) => `q-${101 + index}`);

export const REASONS = {
  'missing-po': {
    resource: 'seller', role: 'Seller', minutes: 24, kind: 'data',
    explanation: 'No PO reference: request the authorized reference; do not invent one.',
    payload: 'Quote ID + blank po-reference + original submission',
    returnPath: 'Owner supplies an authorized PO in a new version; until then recheck preserves needs-data.',
  },
  'unknown-tax-code': {
    resource: 'tax', role: 'Billing coordinator', minutes: 30, kind: 'data',
    explanation: 'Unconfirmed tax code: ask the policy owner; the simulator cannot determine tax.',
    payload: 'Quote and line IDs + original unconfirmed code + policy version',
    returnPath: 'Policy owner confirms a code in a new version; no confirmation is supplied in this replay.',
  },
  'invalid-quantity': {
    resource: 'seller', role: 'Seller', minutes: 24, kind: 'data',
    explanation: 'Quantity is -1: request an authorized positive quantity, not an automatic repair.',
    payload: 'Original line + quantity + positive-integer rule',
    returnPath: 'Seller supplies an authorized replacement; unchanged source returns to needs-data.',
  },
  'inactive-account': {
    resource: 'account', role: 'Account owner', minutes: 30, kind: 'review',
    explanation: 'Account is inactive: prepare an account review packet; do not reactivate it.',
    payload: 'Quote ID + account ID + inactive state',
    returnPath: 'Account-owner decision or revised source requires new evaluation; review remains pending.',
  },
  'credit-limit': {
    resource: 'credit', role: 'Credit reviewer', minutes: 36, kind: 'review',
    explanation: 'Independent quote exposure exceeds the limit; no credit is reserved or authorized.',
    payload: 'Quote total + open balance + limit + calculated exposure',
    returnPath: 'Credit reviewer supplies a separately authorized disposition; no decision is simulated.',
  },
  'discount-policy': {
    resource: 'commercial', role: 'Commercial reviewer', minutes: 24, kind: 'review',
    explanation: 'Discount exceeds the account tier cap; prepare a commercial review packet.',
    payload: 'Quote and line IDs + requested discount + tier cap',
    returnPath: 'Authorized terms or a real reviewer decision require re-evaluation; not automatic approval.',
  },
  'terms-policy': {
    resource: 'commercial', role: 'Commercial reviewer', minutes: 24, kind: 'review',
    explanation: 'Requested payment days exceed approved account terms; an owner must decide.',
    payload: 'Quote ID + requested days + approved days',
    returnPath: 'Authorized revised terms require a new version and evaluation; review remains pending.',
  },
};

export const DESIGNS = [
  {
    id: 'baseline', title: 'Baseline', short: 'Serial handoffs', color: '#b8a7ff',
    description: 'One billing queue, one specialist packet at a time, and a billing recheck after every exception.',
    intake: 6, validation: 18, recheck: 10, disposition: 12, exceptionMultiplier: 1,
    specialistSlots: 5, totalSlots: 8,
  },
  {
    id: 'triage', title: 'Triage first', short: 'Prevent repeat handling', color: '#73e3c4',
    description: 'Spend 12 minutes at intake, route known data blockers before billing, and consolidate exceptions into one return. Same eight slots.',
    intake: 12, validation: 6, recheck: 6, disposition: 12, exceptionMultiplier: 1,
    specialistSlots: 5, totalSlots: 8,
  },
  {
    id: 'pod', title: 'Pooled pod', short: 'Pool exception capacity', color: '#ffc278',
    description: 'Replace five specialist packet-preparation slots with two generalists. Billing packet assembly takes 10 minutes, but each exception takes 1.5× specialist time. Rechecks remain.',
    intake: 6, validation: 10, recheck: 10, disposition: 12, exceptionMultiplier: 1.5,
    specialistSlots: 2, totalSlots: 5,
  },
];

export const SCENARIOS = [
  {
    id: 'paced', title: 'Authored arrival ladder', short: '8 quotes · 10-min spacing',
    description: 'The same eight source quotes arrive in ID order at 0, 10, …, 70 model minutes. These clocks are assumptions.',
    arrivals: 'fixture', exceptionMultiplier: 1, dispositionMultiplier: 1,
  },
  {
    id: 'burst', title: 'Synchronized burst', short: '8 quotes · all at t=0',
    description: 'Arrival sensitivity: all eight original quotes arrive together. No cases, defects, or amounts change.',
    arrivals: 'simultaneous', exceptionMultiplier: 1, dispositionMultiplier: 1,
  },
  {
    id: 'escalation', title: 'Slow exception owners', short: 'Burst · 2× owner service',
    description: 'Stress: same eight quotes at t=0; every design uses twice the assumed exception-preparation time. Tests generalist congestion.',
    arrivals: 'simultaneous', exceptionMultiplier: 2, dispositionMultiplier: 1,
  },
  {
    id: 'gate', title: 'Disposition desk squeeze', short: 'Burst · 3× final service',
    description: 'Stress: same eight quotes at t=0; the final handoff desk takes 36 rather than 12 minutes in every design. Faster upstream work can just wait downstream.',
    arrivals: 'simultaneous', exceptionMultiplier: 1, dispositionMultiplier: 3,
  },
];

export const ASSUMPTIONS = [
  { id: 'A1', title: 'Clock, not a timestamp', detail: 'Integer model minutes, continuous working time, no nights, shifts, outages, or observed clocks. Paced arrivals are 10 minutes apart; stress arrivals are simultaneous.' },
  { id: 'A2', title: 'Capacity, not headcount evidence', detail: 'Baseline and triage: one slot each at intake, billing, seller-data, tax-data, credit, commercial, account, and disposition (8 total). Pod: intake/billing/disposition one each and pod two (5 total). Slots are nonpreemptive service capacity, not measured FTE or labor cost.' },
  { id: 'A3', title: 'All service times are authored', detail: 'Baseline intake/validation/recheck/disposition = 6/18/10/12 min. Triage = 12/6/6/12. Pod = 6/10/10/12. Specialist minutes: PO 24, tax 30, quantity 24, account 30, credit 36, discount 24, terms 24. Pod exception service is 1.5×. Stress multipliers apply equally across designs.' },
  { id: 'A4', title: 'FIFO with explicit ties', detail: 'No random generator or priority cherry-picking. Complete all tasks at a timestamp in scheduling order, then process arrivals in quote-ID order, then dispatch FIFO by enqueue sequence. Resources dispatch in ID order; lowest free slot first. Intervals are [start, end).' },
  { id: 'A5', title: 'Rework is a failed unchanged-input return', detail: 'Each exception packet returns to billing. Baseline/pod return after each reason; triage returns once after all reasons. Original defects and policy flags never disappear. Owner service prepares a request/review packet; it is not an authorized correction or decision. There is no invented successful approval probability.' },
  { id: 'A6', title: 'Finite handoff boundary', detail: 'Drain all eight cases to a recorded handoff: 2 ready-for-human-approval, 4 needs-review, 2 needs-data. These are dispositions, not eight successful quotes, invoices, or cash receipts. Review/data cases remain externally unresolved; no external response time is fabricated.' },
  { id: 'A7', title: 'No observed savings', detail: 'One tiny fixed workload, no stochastic confidence interval. Nearest-rank p50/p95; with eight cases p95 equals the maximum. Monetary calculations test source reconciliation only. No time-to-money conversion, realized savings, production integration, or adoption is measured.' },
];

const RESOURCE_NAMES = {
  intake: 'Seller intake', billing: 'Billing validation', seller: 'Seller data return',
  tax: 'Tax-data desk', credit: 'Credit packet desk', commercial: 'Commercial packet desk',
  account: 'Account packet desk', disposition: 'Disposition desk', pod: 'Shared exception pod',
};
const reasonOrder = Object.keys(REASONS);
const codeOf = (reason) => reason.split(':').at(-1);
const must = (value, message) => { if (!value) throw new Error(message); };

export function orderedReasons(source) {
  const reasons = [...source.data_errors, ...source.review_reasons];
  for (const reason of reasons) must(Object.hasOwn(REASONS, codeOf(reason)), `Unmodeled exception must not be dropped: ${reason}`);
  must(new Set(reasons).size === reasons.length, 'Duplicate exception reason');
  must(source.data_errors.every((reason) => REASONS[codeOf(reason)].kind === 'data')
    && source.review_reasons.every((reason) => REASONS[codeOf(reason)].kind === 'review'), 'Data blockers and policy review must remain separate');
  return reasons.sort((a, b) => reasonOrder.indexOf(codeOf(a)) - reasonOrder.indexOf(codeOf(b)) || (a < b ? -1 : a > b ? 1 : 0));
}

export function buildRoute(item, design, scenario) {
  const reasons = orderedReasons(item.source);
  const task = (resource, duration, label, kind, reason, extra = {}) => ({ resource, duration, label, kind, reason, ...extra });
  const route = [task('intake', design.intake, design.id === 'triage' ? 'Precheck & collect' : 'Register submission', 'intake',
    design.id === 'triage' ? 'Earlier validation uses the same seller-intake slot for twice as long.' : 'Reconcile quote/header IDs before billing.')];
  if (!(design.id === 'triage' && item.source.data_errors.length)) {
    route.push(task('billing', design.validation, 'Original-input validation', 'validation', 'Calculate only if complete; otherwise retain data blockers. Clean still needs human approval.'));
  }
  const recheck = (after) => task('billing', design.recheck, 'Unchanged-input recheck', 'recheck',
    `Returned packet: ${after.join(', ')}. No authorized new source is supplied; all original reasons remain.`, { reasonCodes: after, rework: true });
  for (const reason of reasons) {
    const code = codeOf(reason);
    const rule = REASONS[code];
    route.push(task(design.id === 'pod' ? 'pod' : rule.resource,
      rule.minutes * design.exceptionMultiplier * scenario.exceptionMultiplier,
      `${rule.kind === 'data' ? 'Request data' : 'Prepare review'} · ${code}`, 'exception', rule.explanation,
      { reasonCode: reason, owner: rule.role, payload: rule.payload, returnPath: rule.returnPath, unresolved: true }));
    if (design.id !== 'triage') route.push(recheck([reason]));
  }
  if (design.id === 'triage' && reasons.length) route.push(recheck(reasons));
  route.push(task('disposition', design.disposition * scenario.dispositionMultiplier, 'Record pending handoff', 'disposition',
    `Record ${item.source.state}; no approval, invoice, correction, or external message is issued.`));
  return route;
}

export function comparisonInputs(workload, scenarioId) {
  const scenario = SCENARIOS.find((entry) => entry.id === scenarioId);
  must(scenario, `Unknown scenario: ${scenarioId}`);
  must(workload?.classification === 'SYNTHETIC' && Array.isArray(workload.cases), 'Only a labeled SYNTHETIC workload is accepted');
  must(workload.schema === 'enterprise-queue-workload/1', 'Unsupported workload schema');
  must(canonical(workload.cases.map((item) => item.id).sort()) === canonical(ANCHOR_IDS), 'The fixed workload must contain exactly the eight original quote IDs');
  for (const item of workload.cases) {
    const source = item.source;
    must(source && Array.isArray(source.data_errors) && Array.isArray(source.review_reasons), 'Missing source exception arrays');
    const state = source.data_errors.length ? 'needs-data' : source.review_reasons.length ? 'needs-review' : 'ready-for-human-approval';
    must(source.state === state, `Source-state precedence mismatch: ${item.id}`);
    must(source.data_errors.length ? source.total_usd === null : typeof source.total_usd === 'string' && /^\d+\.\d{2}$/.test(source.total_usd), 'Missing data cannot become a zero-dollar approval; calculated totals need exact cents');
    must(item.id === source.quote_id, 'Original quote identity must be preserved');
    orderedReasons(source);
  }
  return {
    classification: 'SYNTHETIC',
    cases: structuredClone(workload.cases).map((item) => ({ ...item, arrival: scenario.arrivals === 'simultaneous' ? 0 : item.arrival })),
    commonAssumptions: { exceptionMultiplier: scenario.exceptionMultiplier, dispositionMultiplier: scenario.dispositionMultiplier },
  };
}

export function runComparison(workload, scenarioId = 'paced') {
  const scenario = SCENARIOS.find((entry) => entry.id === scenarioId);
  const inputs = comparisonInputs(workload, scenarioId);
  const inputKey = canonical(inputs);
  const runs = DESIGNS.map((design) => {
    const ids = design.id === 'pod'
      ? ['intake', 'billing', 'pod', 'disposition']
      : ['intake', 'billing', 'seller', 'tax', 'credit', 'commercial', 'account', 'disposition'];
    const resources = ids.map((id) => ({ id, label: RESOURCE_NAMES[id], capacity: id === 'pod' ? 2 : 1 }));
    const cases = inputs.cases.map((item) => ({ ...item, route: buildRoute(item, design, scenario) }));
    return { designId: design.id, scenarioId, inputKey, ...simulate({ resources, cases }) };
  });
  must(runs.every((run) => run.inputKey === runs[0].inputKey), 'Designs did not receive identical comparison inputs');
  return { scenarioId, inputs, inputKey, runs };
}

export function runAllComparisons(workload) {
  return SCENARIOS.map((scenario) => runComparison(workload, scenario.id));
}
