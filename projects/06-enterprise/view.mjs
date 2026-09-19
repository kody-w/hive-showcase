import { snapshot } from './engine.mjs';
import { ASSUMPTIONS, DESIGNS, REASONS, SCENARIOS } from './model.mjs';

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const e = escapeHtml;
const number = (value, places = 0) => Number(value).toFixed(places);
const designOf = (id) => DESIGNS.find((design) => design.id === id);
const resourceName = (run, id) => run.resources.find((resource) => resource.id === id)?.label ?? 'No queue wait';
const stateBadge = (source) => `<span class="source-state ${e(source.state)}">${e(source.state)}</span>`;
const sourceReasons = (source) => [...source.data_errors, ...source.review_reasons];

export function eventClock(comparison) {
  return [...new Set(comparison.runs.flatMap((run) => run.eventTimes))].sort((a, b) => a - b);
}

export function initialState() {
  return { scenarioId: 'paced', designId: 'baseline', caseId: 'q-105', tick: 0, playing: false };
}

function getComparison(comparisons, id) {
  const comparison = comparisons.find((entry) => entry.scenarioId === id);
  if (!comparison) throw new Error(`Unknown comparison: ${id}`);
  return comparison;
}

export function transition(state, action, comparisons) {
  const comparison = getComparison(comparisons, state.scenarioId);
  const lastTick = eventClock(comparison).length - 1;
  switch (action.type) {
    case 'scenario':
      getComparison(comparisons, action.value);
      return { ...state, scenarioId: action.value, tick: 0, playing: false };
    case 'design':
      if (!designOf(action.value)) throw new Error('Unknown design');
      return { ...state, designId: action.value };
    case 'case':
      if (!comparison.inputs.cases.some((item) => item.id === action.value)) throw new Error('Unknown quote');
      return { ...state, caseId: action.value };
    case 'start': return { ...state, tick: 0, playing: false };
    case 'end': return { ...state, tick: lastTick, playing: false };
    case 'previous': return { ...state, tick: Math.max(0, state.tick - 1), playing: false };
    case 'next': {
      const tick = Math.min(lastTick, state.tick + 1);
      return { ...state, tick, playing: tick < lastTick && state.playing };
    }
    case 'seek':
      if (!Number.isSafeInteger(action.value)) throw new Error('Clock index must be an integer');
      return { ...state, tick: Math.min(lastTick, Math.max(0, action.value)), playing: false };
    case 'play': return { ...state, tick: state.tick === lastTick ? 0 : state.tick, playing: !state.playing };
    case 'pause': return { ...state, playing: false };
    default: throw new Error(`Unknown control: ${action.type}`);
  }
}

export function deriveView(state, comparisons) {
  const comparison = getComparison(comparisons, state.scenarioId);
  const times = eventClock(comparison);
  const run = comparison.runs.find((entry) => entry.designId === state.designId);
  if (!run || times[state.tick] === undefined) throw new Error('Invalid replay state');
  const time = times[state.tick];
  const selectedCase = run.cases.find((item) => item.id === state.caseId);
  if (!selectedCase) throw new Error('Selected quote is missing');
  return {
    state, comparison, run, time, times, selectedCase,
    frame: snapshot(run, time),
    timelineEnd: Math.max(...comparison.runs.map((entry) => entry.metrics.lastDisposition), 1),
  };
}

export function renderDesignCards(comparison, selectedId) {
  const baseline = comparison.runs[0].metrics;
  return comparison.runs.map((run) => {
    const design = designOf(run.designId);
    const metric = run.metrics;
    const change = metric.durationMinutes - baseline.durationMinutes;
    const delta = run.designId === 'baseline' ? '<span class="delta neutral">reference</span>'
      : `<span class="delta ${change > 0 ? 'worse' : change < 0 ? 'better' : 'neutral'}">${change > 0 ? '+' : ''}${change} min</span>`;
    const active = run.designId === selectedId;
    return `<article class="design-card ${active ? 'selected' : ''}" style="--design-color:${design.color}">
      <div class="design-label"><span>${e(design.short)}</span><span>${design.totalSlots} modeled slots</span></div>
      <h3>${e(design.title)}</h3><p class="description">${e(design.description)}</p>
      <p class="main-number">${metric.durationMinutes}<small> min</small>${delta}</p>
      <p class="metric-caption">to record all 8 pending handoffs</p>
      <dl class="mini-metrics">
        <div><dt>Handoffs / hour</dt><dd>${number(metric.throughputPerHour, 2)}</dd></div>
        <div><dt>p95 queue wait</dt><dd>${metric.wait.p95} min</dd></div>
        <div><dt>Clean-case tail</dt><dd>${metric.cleanCycle.p95} min</dd></div>
      </dl>
      <p class="bottleneck-note">Largest wait accumulation<br><strong>${e(resourceName(run, metric.bottleneck))}</strong></p>
      <button type="button" data-design="${e(design.id)}" aria-pressed="${active}">${active ? '● Inspecting this design' : 'Inspect this design →'}</button>
    </article>`;
  }).join('');
}

function caseChip(item, selected, waiting, time) {
  const reason = waiting ? `${time - item.visit.queuedAt} min waiting. ${item.visit.waitCause}` : `Serving ${item.visit.label}; ${item.visit.endedAt - time} model minutes remain.`;
  return `<button type="button" class="case-chip ${waiting ? 'wait-chip' : ''} ${item.id === selected ? 'selected' : ''}" data-case="${e(item.id)}" title="${e(reason)}" aria-label="${e(`${item.id}: ${reason}`)}">${e(item.id)}${waiting ? ` · ${time - item.visit.queuedAt}m` : ''}</button>`;
}

export function renderQueues(view) {
  const order = ['intake', 'billing', 'seller', 'tax', 'credit', 'commercial', 'account', 'pod', 'disposition'];
  return [...view.frame.resources].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((resource) => `<section class="resource-lane" data-resource="${e(resource.id)}" aria-label="${e(resource.label)}">
    <div><h3 class="resource-title">${e(resource.label)}</h3><span class="resource-caption">${resource.active.length}/${resource.capacity} busy · ${number(resource.utilization * 100)}% elapsed utilization</span><div class="lane-meter" aria-hidden="true"><span style="width:${resource.utilization * 100}%"></span></div></div>
    <div class="resource-body">
      <div class="slot-row"><span>IN SLOT</span>${resource.active.length ? resource.active.map((item) => caseChip(item, view.state.caseId, false, view.time)).join('') : '<span class="idle">Idle</span>'}</div>
      <div class="queue-row"><span>FIFO</span>${resource.queue.length ? resource.queue.map((item) => caseChip(item, view.state.caseId, true, view.time)).join('') : '<span class="idle">No waiting packets</span>'}</div>
    </div>
  </section>`).join('');
}

export function renderLedger(view) {
  const rows = view.frame.cases.map((item) => {
    let status, detail;
    if (item.status === 'not-arrived') {
      status = 'Not arrived';
      detail = `Authored arrival t=${view.run.cases.find((entry) => entry.id === item.id).arrival}`;
    } else if (item.status === 'disposed') {
      status = `Handoff recorded · t=${item.completedAt}`;
      const reasons = sourceReasons(item.source);
      const owners = [...new Set(reasons.map((reason) => REASONS[reason.split(':').at(-1)].role))];
      detail = reasons.length ? `Pending with ${owners.join(' + ')}: ${reasons.join(', ')}. External reply time is not modeled.` : 'Pending with a human approver, outside this model. Clean checks are not authority.';
    } else {
      status = `${item.status === 'waiting' ? 'Waiting at' : 'In service at'} ${resourceName(view.run, item.visit.resource)}`;
      detail = `${item.status === 'waiting' ? `${view.time - item.visit.queuedAt} min so far; FIFO capacity. ` : ''}${item.visit.reason}`;
    }
    return `<tr class="${item.id === view.state.caseId ? 'is-selected' : ''}"><th scope="row"><button type="button" class="case-select" data-case="${e(item.id)}" aria-pressed="${item.id === view.state.caseId}">${e(item.id)}</button></th><td><span class="state-name">${e(status)}</span><span class="state-reason">${e(detail)}</span><span class="source-label">Original: ${e(item.source.state)}</span></td></tr>`;
  }).join('');
  return `<table class="ledger"><caption>At t=${view.time}: ${view.frame.counts.notArrived} future + ${view.frame.counts.waiting} waiting + ${view.frame.counts.serving} serving + ${view.frame.counts.disposed} disposed = 8.</caption><thead><tr><th scope="col">Quote</th><th scope="col">Location &amp; why</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderCaseDetail(view) {
  const item = view.selectedCase;
  const reasons = sourceReasons(item.source);
  return `<div class="case-summary"><h3>${e(item.id)}</h3>${stateBadge(item.source)}<span class="source-amount">${item.source.total_usd === null ? 'Total blocked (null), never $0' : `Synthetic USD ${e(item.source.total_usd)}`}</span></div>
    <div class="reason-list">${reasons.length ? reasons.map((reason) => `<span class="reason-pill">${e(reason)}</span>`).join('') : '<span class="microcopy">No source exception; still requires human approval.</span>'}</div>
    <p class="microcopy">Original account ${e(item.source.accountId)} · arrival t=${item.arrival} · Source is immutable. Rechecks evaluate the same unchanged version.</p>`;
}

export function renderTimelines(view) {
  const percent = (time) => number(time * 100 / view.timelineEnd, 5);
  const letters = { intake: 'I', validation: 'V', exception: 'E', recheck: 'R', disposition: 'D' };
  const rows = view.comparison.runs.map((run) => {
    const item = run.cases.find((entry) => entry.id === view.state.caseId);
    const design = designOf(run.designId);
    const segments = item.history.flatMap((visit) => {
      const bars = [];
      if (visit.startedAt > visit.queuedAt) {
        const title = `WAIT ${visit.startedAt - visit.queuedAt} min at ${resourceName(run, visit.resource)}, t=${visit.queuedAt}–${visit.startedAt}. ${visit.waitCause}`;
        bars.push(`<span class="gantt-segment wait ${visit.queuedAt >= view.time ? 'future' : ''}" style="--left:${percent(visit.queuedAt)}%;--width:${percent(visit.startedAt - visit.queuedAt)}%" title="${e(title)}">W</span>`);
      }
      const title = `${visit.label}, ${resourceName(run, visit.resource)}, t=${visit.startedAt}–${visit.endedAt}. ${visit.reason}`;
      bars.push(`<span class="gantt-segment ${visit.startedAt >= view.time ? 'future' : ''}" style="--left:${percent(visit.startedAt)}%;--width:${percent(visit.duration)}%" title="${e(title)}">${letters[visit.kind] ?? 'S'}</span>`);
      return bars;
    }).join('');
    return `<div class="timeline-row" style="--design-color:${design.color}"><div class="timeline-label">${e(design.title)}<small>${item.cycleMinutes} min cycle · ${item.waitMinutes} waiting<br>Handoff at t=${item.completedAt}</small></div>
      <div class="timeline-plot" role="img" aria-label="${e(`${item.id}, ${design.title}: ${item.waitMinutes} minutes waiting and ${item.serviceMinutes} minutes service; disposition at ${item.completedAt}. Exact visits in the table below; select this design to read them.`)}">
        ${segments}<span class="gantt-cursor" style="--left:${percent(Math.min(view.time, view.timelineEnd))}%" aria-hidden="true"></span>
      </div></div>`;
  }).join('');
  return `<div class="timeline-inner">${rows}<div class="timeline-axis"><span></span><div class="axis-numbers">${[0, 0.25, 0.5, 0.75, 1].map((fraction) => `<span>${number(view.timelineEnd * fraction, view.timelineEnd * fraction % 1 ? 1 : 0)} min</span>`).join('')}</div></div></div>`;
}

export function renderVisits(view) {
  const current = view.frame.cases.find((item) => item.id === view.state.caseId)?.visit;
  return `<table class="visit-table"><caption>Full modeled trajectory · ${e(view.state.caseId)} · ${e(designOf(view.state.designId).title)}. The highlighted row is current at t=${view.time}. Wait + service = ${view.selectedCase.cycleMinutes} min cycle.</caption>
    <thead><tr><th scope="col">Step / resource</th><th scope="col">Queued → start</th><th scope="col">Wait</th><th scope="col">Service interval</th><th scope="col">Why this visit exists / accountable return</th></tr></thead>
    <tbody>${view.selectedCase.history.map((visit) => `<tr class="${current?.index === visit.index ? 'active-row' : ''}">
      <th scope="row">${visit.index + 1}. ${e(visit.label)}<small>${e(resourceName(view.run, visit.resource))} · slot ${visit.slot + 1}</small></th>
      <td>${visit.queuedAt} → ${visit.startedAt}</td><td>${visit.startedAt - visit.queuedAt} min</td><td>${visit.startedAt}–${visit.endedAt}<small>${visit.duration} min service</small></td>
      <td class="reason-cell">${e(visit.reason)}${visit.startedAt > visit.queuedAt ? `<small>${e(visit.waitCause)}</small>` : '<small>No capacity wait on this visit.</small>'}${visit.owner ? `<small>Proposed owner: ${e(visit.owner)}. Payload: ${e(visit.payload)}.</small><small>Return: ${e(visit.returnPath)}</small>` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
}

export function renderComparisonTable(comparison) {
  return `<table class="comparison"><caption>Full-run results under ${e(SCENARIOS.find((scenario) => scenario.id === comparison.scenarioId).title)}. All time values are model minutes.</caption>
    <thead><tr><th scope="col">Design</th><th scope="col">Drain time</th><th scope="col">Handoffs / hour</th><th scope="col">Mean wait</th><th scope="col">p50 wait</th><th scope="col">p95 wait</th><th scope="col">Mean cycle</th><th scope="col">p95 cycle</th><th scope="col">Clean-case tail</th><th scope="col">Recheck visits</th></tr></thead>
    <tbody>${comparison.runs.map((run) => `<tr><th scope="row">${e(designOf(run.designId).title)}</th><td>${run.metrics.durationMinutes}</td><td>${number(run.metrics.throughputPerHour, 3)}</td><td>${number(run.metrics.wait.mean, 2)}</td><td>${run.metrics.wait.p50}</td><td>${run.metrics.wait.p95}</td><td>${number(run.metrics.cycle.mean, 2)}</td><td>${run.metrics.cycle.p95}</td><td>${run.metrics.cleanCycle.p95}</td><td>${run.metrics.rework.visits}</td></tr>`).join('')}</tbody></table>
    <p class="microcopy comparison-note">Throughput = 8 recorded pending handoffs ÷ (last disposition − first arrival) × 60, not steady-state capacity or approvals/hour. Cycle starts at each original submission, including incomplete ones. Wait sums FIFO queue time only. Nearest-rank percentiles: p95 = max for n=8 (clean tail n=2). All designs return 6/8 packets at least once (75% modeled rework); none resolve the 6 exception cases or authorize the 2 clean cases.</p>`;
}

export function renderDistributions(comparison) {
  const maximum = Math.max(1, ...comparison.runs.flatMap((run) => run.cases.map((item) => item.waitMinutes)));
  return comparison.runs.map((run) => {
    const design = designOf(run.designId);
    return `<div class="wait-distribution" style="--design-color:${design.color}"><div class="distribution-header"><strong>${e(design.title)}</strong><span>min ${run.metrics.wait.min} · p50 ${run.metrics.wait.p50} · max ${run.metrics.wait.max}</span></div>
      <div class="wait-bars" role="img" aria-label="${e(`${design.title} queue waits in minutes: ${run.cases.map((item) => `${item.id}: ${item.waitMinutes}`).join('; ')}`)}">
        ${run.cases.map((item) => `<div class="wait-column" title="${e(item.id)}: ${item.waitMinutes} min"><span class="wait-value">${item.waitMinutes}</span><div class="wait-bar" style="--bar-height:${item.waitMinutes * 4.4 / maximum}rem"></div><small>${e(item.id.replace('q-', ''))}</small></div>`).join('')}
      </div></div>`;
  }).join('');
}

export function renderUtilization(run) {
  return `<table class="utilization"><caption>${e(designOf(run.designId).title)} · ${run.metrics.durationMinutes}-minute run · highlighted row accumulates most waiting.</caption><thead><tr><th scope="col">Resource / slots</th><th scope="col">Utilization</th><th scope="col">Σ wait min</th><th scope="col">Peak queue</th></tr></thead><tbody>
    ${run.metrics.resources.map((resource) => `<tr class="${resource.id === run.metrics.bottleneck ? 'bottleneck-row' : ''}"><th scope="row">${e(resource.label)} / ${resource.capacity}</th><td class="meter-cell">${number(resource.utilization * 100, 1)}%<div class="util-bar" aria-hidden="true"><span style="width:${resource.utilization * 100}%"></span></div></td><td>${resource.waitMinutes}</td><td>${resource.maxQueue}</td></tr>`).join('')}
    </tbody></table>`;
}

export function regressionLabels(run, baseline) {
  if (run.designId === baseline.designId) return ['Reference'];
  const labels = [];
  if (run.metrics.durationMinutes > baseline.metrics.durationMinutes) labels.push('Slower drainage');
  if (run.metrics.wait.p95 > baseline.metrics.wait.p95) labels.push('Higher p95 wait');
  if (run.metrics.cleanCycle.p95 > baseline.metrics.cleanCycle.p95) labels.push('Worse clean-case tail');
  const deskWait = (entry) => entry.metrics.resources.find((resource) => resource.id === 'disposition').waitMinutes;
  if (deskWait(run) > deskWait(baseline)) labels.push('More waiting at final desk');
  const worst = run.cases.map((item) => ({ id: item.id, delta: item.cycleMinutes - baseline.cases.find((other) => other.id === item.id).cycleMinutes })).sort((a, b) => b.delta - a.delta)[0];
  if (worst?.delta > 0) labels.push(`${worst.id} cycle +${worst.delta} min`);
  return labels.length ? labels : ['No regression in the displayed aggregates; inspect all resource waits'];
}

export function renderStressTable(comparisons) {
  return `<table class="stress-table"><caption>All four predeclared conditions, all three designs, all eight original cases. A stress scenario never changes input differently for competing designs.</caption>
    <thead><tr><th scope="col">Common condition</th><th scope="col">Design</th><th scope="col">Drain min</th><th scope="col">Handoffs / h</th><th scope="col">p95 wait</th><th scope="col">Clean tail</th><th scope="col">Largest wait</th><th scope="col">Regression vs. its baseline</th></tr></thead><tbody>
    ${comparisons.flatMap((comparison) => comparison.runs.map((run, index) => {
      const scenario = SCENARIOS.find((entry) => entry.id === comparison.scenarioId);
      return `<tr class="${index === 0 ? 'scenario-divider' : ''}">${index === 0 ? `<th scope="rowgroup" rowspan="3">${e(scenario.title)}<br><span class="microcopy">${e(scenario.short)}</span></th>` : ''}<th scope="row">${e(designOf(run.designId).title)}</th><td>${run.metrics.durationMinutes}</td><td>${number(run.metrics.throughputPerHour, 3)}</td><td>${run.metrics.wait.p95}</td><td>${run.metrics.cleanCycle.p95}</td><td>${e(resourceName(run, run.metrics.bottleneck))}</td><td class="tradeoff ${index === 0 ? 'neutral' : ''}">${regressionLabels(run, comparison.runs[0]).map(e).join(' · ')}</td></tr>`;
    })).join('')}</tbody></table>`;
}

export function renderStressCallouts(comparisons) {
  const [gateBase, gateTriage] = getComparison(comparisons, 'gate').runs;
  const [slowBase, , slowPod] = getComparison(comparisons, 'escalation').runs;
  return `<p class="stress-callout"><strong>Speed can relocate the queue.</strong> With a slow disposition desk, triage drains in ${gateTriage.metrics.durationMinutes} vs. ${gateBase.metrics.durationMinutes} min, yet the clean-case tail worsens to <strong>${gateTriage.metrics.cleanCycle.p95} from ${gateBase.metrics.cleanCycle.p95} min</strong>. The new largest waiting location is the disposition desk.</p>
    <p class="stress-callout"><strong>Pooling can reduce resilience.</strong> With slow exception owners, the pod takes <strong>${slowPod.metrics.durationMinutes} vs. ${slowBase.metrics.durationMinutes} min</strong> to drain, and p95 waiting rises to ${slowPod.metrics.wait.p95} from ${slowBase.metrics.wait.p95} min. Its faster clean path does not rescue the full workload.</p>`;
}

export function renderSourceTable(workload) {
  return `<table class="source-table"><caption>Exact-money outcomes independently reproduced from copied seed CSV/JSON. Null means blocked calculation; readiness is not authority.</caption><thead><tr><th scope="col">Quote / account</th><th scope="col">Synthetic USD</th><th scope="col">Original state</th><th scope="col">Anchoring exception</th></tr></thead><tbody>
    ${workload.cases.map(({ id, source }) => `<tr><th scope="row"><code>${e(id)}</code><br><small>${e(source.accountId)}</small></th><td>${source.total_usd === null ? '<strong>null</strong>' : e(source.total_usd)}</td><td>${stateBadge(source)}</td><td class="source-reasons">${sourceReasons(source).length ? sourceReasons(source).map((reason) => `<code>${e(reason)}</code>`).join('<br>') : 'No policy/data reason; human approval remains mandatory.'}</td></tr>`).join('')}</tbody></table>`;
}

export function renderAssumptions() {
  return `<div class="table-wrap"><table class="parameter-table"><caption>Authored service assumptions in model minutes, before common stress multipliers.</caption><thead><tr><th scope="col">Design</th><th scope="col">Intake</th><th scope="col">Validation</th><th scope="col">Each recheck</th><th scope="col">Final handoff</th><th scope="col">Exception multiplier</th><th scope="col">Total slots</th></tr></thead><tbody>${DESIGNS.map((design) => `<tr><th scope="row">${e(design.title)}</th><td>${design.intake}</td><td>${design.validation}</td><td>${design.recheck}</td><td>${design.disposition}</td><td>${design.exceptionMultiplier}×</td><td>${design.totalSlots}</td></tr>`).join('')}</tbody></table></div>
    <ul class="assumption-list">${ASSUMPTIONS.map((assumption) => `<li><strong><span class="assumption-id">${e(assumption.id)}</span>${e(assumption.title)}</strong><p>${e(assumption.detail)}</p></li>`).join('')}</ul>`;
}

export function renderOwnership() {
  return `<table class="ownership-table"><caption>Proposed roles only; no people are assigned or contacted. Service minutes are authored packet-preparation time, never an observed SLA or actual decision.</caption><thead><tr><th scope="col">Reason</th><th scope="col">Accountable role</th><th scope="col">Assumed service</th><th scope="col">Minimum payload</th><th scope="col">Return path, outside this replay</th></tr></thead><tbody>${Object.entries(REASONS).map(([code, rule]) => `<tr><th scope="row">${e(code)}</th><td>${e(rule.role)}</td><td>${rule.minutes} min specialist<br>${rule.minutes * 1.5} min pod</td><td>${e(rule.payload)}</td><td>${e(rule.returnPath)}</td></tr>`).join('')}</tbody></table>`;
}
