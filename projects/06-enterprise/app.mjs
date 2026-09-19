import { DESIGNS, SCENARIOS, runAllComparisons } from './model.mjs';
import {
  deriveView, escapeHtml, initialState, transition,
  renderAssumptions, renderCaseDetail, renderComparisonTable, renderDesignCards, renderDistributions,
  renderLedger, renderOwnership, renderQueues, renderSourceTable, renderStressCallouts, renderStressTable,
  renderTimelines, renderUtilization, renderVisits,
} from './view.mjs';

export async function mount(document, window, load = async () => {
  const response = await fetch(new URL('./fixtures/workload.json', import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Local fixture request returned ${response.status}`);
  return response.json();
}) {
  const get = (id) => document.getElementById(id);
  let timer = null;
  try {
    const workload = await load();
    const comparisons = runAllComparisons(workload);
    let state = initialState();
    let previousScenario = null, previousDesign = null;
    get('scenario').innerHTML = SCENARIOS.map((scenario) => `<option value="${escapeHtml(scenario.id)}">${escapeHtml(scenario.title)}</option>`).join('');
    get('case-picker').innerHTML = workload.cases.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} · ${escapeHtml(item.source.state)}</option>`).join('');
    get('source-table').innerHTML = renderSourceTable(workload);
    get('assumptions').innerHTML = renderAssumptions();
    get('ownership').innerHTML = renderOwnership();
    get('stress-table').innerHTML = renderStressTable(comparisons);
    get('stress-callouts').innerHTML = renderStressCallouts(comparisons);

    const render = () => {
      const view = deriveView(state, comparisons);
      const scenarioChanged = state.scenarioId !== previousScenario;
      const designChanged = state.designId !== previousDesign;
      get('scenario').value = state.scenarioId;
      get('case-picker').value = state.caseId;
      get('scenario-description').textContent = SCENARIOS.find((scenario) => scenario.id === state.scenarioId).description;
      if (scenarioChanged || designChanged) {
        get('design-cards').innerHTML = renderDesignCards(view.comparison, state.designId);
        get('utilization').innerHTML = renderUtilization(view.run);
      }
      if (scenarioChanged) {
        get('comparison-table').innerHTML = renderComparisonTable(view.comparison);
        get('distributions').innerHTML = renderDistributions(view.comparison);
      }
      get('queues').innerHTML = renderQueues(view);
      get('case-ledger').innerHTML = renderLedger(view);
      get('case-detail').innerHTML = renderCaseDetail(view);
      get('timelines').innerHTML = renderTimelines(view);
      get('visits').innerHTML = renderVisits(view);
      get('selected-design').textContent = DESIGNS.find((design) => design.id === state.designId).title;
      get('clock-label').textContent = `t = ${view.time} min`;
      get('step-label').textContent = `${state.tick + 1}/${view.times.length}`;
      get('clock').max = String(view.times.length - 1);
      get('clock').value = String(state.tick);
      get('clock').setAttribute('aria-valuetext', `${view.time} model minutes; event time ${state.tick + 1} of ${view.times.length}`);
      get('play').textContent = state.playing ? 'Ⅱ Pause' : '▶ Play';
      get('play').setAttribute('aria-pressed', String(state.playing));
      const counts = view.frame.counts;
      get('replay-status').textContent = `${counts.disposed}/8 handoffs recorded · ${counts.waiting} queued · ${counts.serving} in service · ${counts.notArrived} not arrived · 0 approved.`;
      document.querySelector('[data-action="previous"]').disabled = state.tick === 0;
      document.querySelector('[data-action="next"]').disabled = state.tick === view.times.length - 1;
      previousScenario = state.scenarioId;
      previousDesign = state.designId;
      if (state.playing && timer === null) timer = window.setInterval(() => dispatch({ type: 'next' }), 500);
      if (!state.playing && timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const dispatch = (action) => {
      state = transition(state, action, comparisons);
      render();
    };
    get('scenario').addEventListener('change', (event) => dispatch({ type: 'scenario', value: event.target.value }));
    get('case-picker').addEventListener('change', (event) => dispatch({ type: 'case', value: event.target.value }));
    get('clock').addEventListener('input', (event) => dispatch({ type: 'seek', value: Number(event.target.value) }));
    get('laboratory').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.action) dispatch({ type: button.dataset.action });
      if (button.dataset.design) {
        dispatch({ type: 'design', value: button.dataset.design });
        document.querySelector(`[data-design="${state.designId}"]`)?.focus();
      }
      if (button.dataset.case) {
        dispatch({ type: 'case', value: button.dataset.case });
        get('case-picker').focus();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.playing) dispatch({ type: 'pause' });
    });
    render();
    get('loading').hidden = true;
    get('laboratory').hidden = false;
    return { getState: () => ({ ...state }), dispatch, comparisons, destroy: () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    } };
  } catch (error) {
    if (timer !== null) window.clearInterval(timer);
    get('loading').hidden = true;
    get('laboratory').hidden = true;
    get('load-error').hidden = false;
    get('load-error').textContent = `Replay unavailable: ${error.message}. Use an owner-controlled local static preview from the repository root; file:// may block ES modules or fixture reads. No external data is fetched. Persisted results and the pilot pack remain linked below.`;
    return { error };
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') mount(document, window);
