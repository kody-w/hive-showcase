import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../app.mjs';
import { runAllComparisons, DESIGNS, SCENARIOS } from '../model.mjs';
import {
  initialState, transition, deriveView, eventClock, escapeHtml, regressionLabels,
  renderDesignCards, renderQueues, renderLedger, renderCaseDetail, renderTimelines, renderVisits,
  renderComparisonTable, renderDistributions, renderUtilization, renderStressTable, renderStressCallouts,
  renderSourceTable, renderAssumptions, renderOwnership,
} from '../view.mjs';
import { read } from '../scripts/reproduce.mjs';

const workload = JSON.parse(read('fixtures/workload.json'));
const comparisons = runAllComparisons(workload);

test('replay controls step distinct event times, stop at end, and rewind deterministically', () => {
  const initial = initialState();
  const next = transition(initial, { type: 'next' }, comparisons);
  assert.equal(next.tick, 1);
  assert.equal(deriveView(next, comparisons).time, eventClock(comparisons[0])[1]);
  assert.deepEqual(transition(next, { type: 'previous' }, comparisons), initial);
  const end = transition(initial, { type: 'end' }, comparisons);
  assert.equal(deriveView(end, comparisons).frame.counts.disposed, 8);
  assert.ok(renderLedger(deriveView(end, comparisons)).includes('External reply time is not modeled'));
  assert.ok(renderLedger(deriveView(end, comparisons)).includes('Pending with a human approver, outside this model'));
  assert.deepEqual(transition(end, { type: 'next' }, comparisons), end);
  assert.deepEqual(transition(initial, { type: 'previous' }, comparisons), initial);
  assert.deepEqual(transition(end, { type: 'start' }, comparisons), initial);
  const playing = transition(end, { type: 'play' }, comparisons);
  assert.equal(playing.tick, 0);
  assert.equal(playing.playing, true);
});

test('changing conditions resets the clock and pauses, while design and case comparison retain the clock', () => {
  let state = transition(initialState(), { type: 'seek', value: 5 }, comparisons);
  state = transition(state, { type: 'play' }, comparisons);
  const changed = transition(state, { type: 'design', value: 'triage' }, comparisons);
  assert.equal(changed.tick, 5);
  assert.equal(changed.playing, true);
  assert.equal(deriveView(changed, comparisons).run.designId, 'triage');
  const selected = transition(changed, { type: 'case', value: 'q-107' }, comparisons);
  assert.equal(deriveView(selected, comparisons).selectedCase.source.total_usd, null);
  const scenario = transition(selected, { type: 'scenario', value: 'gate' }, comparisons);
  assert.equal(scenario.tick, 0);
  assert.equal(scenario.playing, false);
  assert.equal(scenario.caseId, 'q-107');
  assert.equal(scenario.designId, 'triage');
});

test('seek clamps at the endpoints and bad UI identities fail explicitly', () => {
  assert.equal(transition(initialState(), { type: 'seek', value: -2 }, comparisons).tick, 0);
  assert.equal(transition(initialState(), { type: 'seek', value: 999 }, comparisons).tick, eventClock(comparisons[0]).length - 1);
  for (const action of [{ type: 'seek', value: NaN }, { type: 'scenario', value: 'unknown' }, { type: 'design', value: 'unknown' }, { type: 'case', value: 'unknown' }]) {
    assert.throws(() => transition(initialState(), action, comparisons));
  }
});

test('every design/scenario renders conserved ledgers, capacity lanes and three same-scale timelines', () => {
  for (const scenario of SCENARIOS) {
    for (const design of DESIGNS) {
      const state = { ...initialState(), scenarioId: scenario.id, designId: design.id };
      const view = deriveView(state, comparisons);
      const lanes = renderQueues(view);
      assert.equal((lanes.match(/class="resource-lane"/g) ?? []).length, view.run.resources.length);
      const ledger = renderLedger(view);
      assert.equal((ledger.match(/data-case="/g) ?? []).length, 8);
      assert.ok(ledger.includes('= 8.'));
      const timeline = renderTimelines(view);
      assert.equal((timeline.match(/class="timeline-plot"/g) ?? []).length, 3);
      assert.equal((timeline.match(/class="gantt-cursor"/g) ?? []).length, 3);
      assert.ok(timeline.includes('class="gantt-segment wait'));
      assert.ok(timeline.includes('Original') || timeline.includes('No PO reference'));
      assert.ok(renderVisits(view).includes('Proposed owner: Seller'));
      assert.ok(renderVisits(view).includes('Proposed owner: Billing coordinator'));
      assert.ok(renderCaseDetail(view).includes('Total blocked (null), never $0'));
    }
  }
});

test('comparison exposes full distributions, rechecks, capacities and unfavorable stress metrics', () => {
  const comparison = comparisons[0];
  const table = renderComparisonTable(comparison);
  for (const label of ['Mean wait', 'p50 wait', 'p95 wait', 'Mean cycle', 'p95 cycle', 'Clean-case tail', 'Recheck visits']) assert.ok(table.includes(label));
  const bars = renderDistributions(comparison);
  assert.equal((bars.match(/class="wait-column"/g) ?? []).length, 24);
  assert.ok(renderUtilization(comparison.runs[0]).includes('Billing validation'));
  assert.ok(renderDesignCards(comparison, 'triage').includes('8 modeled slots'));
  assert.ok(renderDesignCards(comparison, 'pod').includes('5 modeled slots'));
  assert.ok(renderStressTable(comparisons).includes('Slower drainage'));
  assert.ok(renderStressTable(comparisons).includes('Worse clean-case tail'));
  assert.ok(renderStressCallouts(comparisons).includes('180 from 150 min'));
  const [baseline, triage] = comparisons.find((entry) => entry.scenarioId === 'gate').runs;
  assert.ok(regressionLabels(triage, baseline).includes('Worse clean-case tail'));
});

test('source, assumptions, and ownership render all blockers and never grant authority', () => {
  const source = renderSourceTable(workload);
  assert.ok(source.includes('268.21'));
  assert.ok(source.includes('10.16'));
  assert.equal((source.match(/<strong>null<\/strong>/g) ?? []).length, 2);
  assert.ok(source.includes('line-105-a:unknown-tax-code'));
  assert.ok(source.includes('line-107-a:invalid-quantity'));
  const assumptions = renderAssumptions();
  assert.ok(assumptions.includes('All service times are authored'));
  assert.ok(assumptions.includes('No observed savings'));
  assert.ok(renderOwnership().includes('No') || renderOwnership().includes('no people'));
});

test('rendered source strings are escaped instead of interpreted as markup', () => {
  assert.equal(escapeHtml('<a x="y">&\'</a>'), '&lt;a x=&quot;y&quot;&gt;&amp;&#39;&lt;/a&gt;');
  const view = structuredClone(deriveView(initialState(), comparisons));
  view.selectedCase.source.accountId = '<img src=x onerror="bad()">';
  assert.ok(!renderCaseDetail(view).includes('<img'));
  assert.ok(renderCaseDetail(view).includes('&lt;img'));
});

class FakeElement {
  constructor(document, id) {
    this.document = document;
    this.id = id;
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.innerHTML = '';
    this.textContent = '';
    this.hidden = false;
    this.value = '';
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  emit(type, event = { target: this }) { this.listeners.get(type)?.(event); }
  focus() { this.document.focused = this.id; }
  closest() { return this; }
}

function fakeDom() {
  const ids = [...read('index.html').matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const document = {
    elements: new Map(), selectors: new Map(), listeners: new Map(), hidden: false,
    getElementById(id) {
      assert.ok(this.elements.has(id), `Missing HTML node: ${id}`);
      return this.elements.get(id);
    },
    querySelector(selector) {
      if (!this.selectors.has(selector)) this.selectors.set(selector, new FakeElement(this, selector));
      return this.selectors.get(selector);
    },
    addEventListener(type, callback) { this.listeners.set(type, callback); },
  };
  ids.forEach((id) => document.elements.set(id, new FakeElement(document, id)));
  const window = {
    timers: new Map(), next: 0,
    setInterval(callback, delay) {
      assert.equal(delay, 500);
      const id = this.next++;
      this.timers.set(id, callback);
      return id;
    },
    clearInterval(id) { this.timers.delete(id); },
    tick() { for (const callback of [...this.timers.values()]) callback(); },
  };
  return { document, window };
}

test('actual app wiring handles seek, case/design clicks, play, end, reset and scenario changes without a browser', async () => {
  const { document, window } = fakeDom();
  const app = await mount(document, window, async () => structuredClone(workload));
  assert.ok(!app.error, app.error?.message);
  assert.equal(document.getElementById('laboratory').hidden, false);
  assert.equal(document.getElementById('loading').hidden, true);
  const click = (dataset) => {
    const button = new FakeElement(document, 'clicked');
    button.dataset = dataset;
    document.getElementById('laboratory').emit('click', { target: button });
  };
  click({ action: 'next' });
  assert.equal(app.getState().tick, 1);
  click({ case: 'q-107' });
  assert.equal(app.getState().caseId, 'q-107');
  assert.equal(document.focused, 'case-picker');
  click({ design: 'pod' });
  assert.equal(app.getState().designId, 'pod');
  const clock = document.getElementById('clock');
  clock.value = '4';
  clock.emit('input');
  assert.equal(app.getState().tick, 4);
  click({ action: 'play' });
  assert.equal(window.timers.size, 1);
  window.tick();
  assert.equal(app.getState().tick, 5);
  click({ action: 'end' });
  assert.equal(window.timers.size, 0);
  assert.ok(document.getElementById('replay-status').textContent.includes('8/8 handoffs'));
  click({ action: 'play' });
  assert.equal(app.getState().tick, 0);
  let iterations = 0;
  while (window.timers.size && iterations++ < 200) window.tick();
  assert.equal(window.timers.size, 0, 'Play must stop on its own at the final event');
  assert.equal(app.getState().playing, false);
  const scenario = document.getElementById('scenario');
  scenario.value = 'gate';
  scenario.emit('change');
  assert.equal(app.getState().scenarioId, 'gate');
  assert.equal(app.getState().tick, 0);
  click({ action: 'play' });
  document.hidden = true;
  document.listeners.get('visibilitychange')();
  assert.equal(window.timers.size, 0);
  assert.equal(app.getState().playing, false);
  app.destroy();
});

test('failed local data loads display an honest error, not partial fabricated results', async () => {
  const { document, window } = fakeDom();
  const app = await mount(document, window, async () => { throw new Error('fixture unavailable'); });
  assert.ok(app.error);
  assert.equal(document.getElementById('laboratory').hidden, true);
  assert.equal(document.getElementById('load-error').hidden, false);
  assert.ok(document.getElementById('load-error').textContent.includes('fixture unavailable'));
  assert.equal(window.timers.size, 0);
});

test('HTML declares module, local styles, accessible controls and no external runtime dependencies', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of read('app.mjs').matchAll(/\bget\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), `Missing app target ${match[1]}`);
  assert.ok(html.includes('type="module" src="./app.mjs"'));
  assert.ok(html.includes('href="../../assets/shared.css"'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes('for="clock"'));
  assert.ok(html.includes('for="scenario"'));
  assert.ok(html.includes('for="case-picker"'));
  assert.ok(html.includes('SYNTHETIC INPUTS / MODELED RESULTS'));
  assert.ok(html.includes('No realized savings'));
  assert.ok(html.includes('PROPOSAL ONLY · HOLD'));
  assert.ok(!/\b(?:src|href)="https?:\/\//.test(html));
  assert.ok(!/localStorage|sessionStorage|serviceWorker|sendBeacon/.test(read('app.mjs')));
});
