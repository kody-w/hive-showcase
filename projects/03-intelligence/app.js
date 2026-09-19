(function (root) {
  "use strict";

  const document = root.document;
  const bundle = root.INTELLIGENCE_DATA;
  const M = root.EvidenceModel;
  const R = root.EvidenceRender;
  if (!bundle || !M || !R) {
    const error = document.getElementById("app-error");
    error.hidden = false;
    error.textContent = "A local application file is missing. Keep index.html, data.js, model.js, render.js and app.js together. The linked research brief and JSON remain readable without the interactive map.";
    return;
  }
  const data = bundle.research;
  let state = M.initialState(data, root.location.hash);
  const byId = (id) => document.getElementById(id);
  let frame = null;

  function drawConnections() {
    frame = null;
    const svg = byId("connections");
    svg.replaceChildren();
    const rect = byId("map-shell").getBoundingClientRect();
    if (state.tab !== "map" || rect.width < 1 || root.innerWidth <= 620) return;
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    for (const edge of M.edgesFor(M.filterClaims(data, state))) {
      const source = byId("node-" + edge.sourceId);
      const claim = byId("node-" + edge.claimId);
      if (!source || !claim) continue;
      const from = source.getBoundingClientRect();
      const to = claim.getBoundingClientRect();
      const x1 = from.right - rect.left;
      const y1 = from.top + from.height / 2 - rect.top;
      const x2 = to.left - rect.left;
      const y2 = to.top + to.height / 2 - rect.top;
      const bend = (x2 - x1) * 0.5;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
      const selected = state.selectedId === edge.claimId || state.selectedId === edge.sourceId;
      path.setAttribute("class", edge.stance + (selected ? " selected" : ""));
      svg.appendChild(path);
    }
  }

  function queueConnections() {
    if (frame !== null) root.cancelAnimationFrame(frame);
    frame = root.requestAnimationFrame(drawConnections);
  }

  function restoreFocus(key) {
    if (!key) return;
    const target = [...document.querySelectorAll("[data-focus-key]")]
      .find((element) => element.dataset.focusKey === key);
    target?.focus({ preventScroll: true });
  }

  function render() {
    const focusKey = document.activeElement?.dataset.focusKey;
    const claims = M.filterClaims(data, state);
    const sources = M.visibleSources(data, claims);
    byId("source-nodes").innerHTML = R.sourceNodes(data, state, claims);
    byId("claim-nodes").innerHTML = R.claimNodes(data, state, claims);
    byId("inspector-content").innerHTML = R.inspector(bundle, state);
    byId("filter-status").textContent = `${claims.length} claims · ${sources.length} linked sources. Filters never change the verdict.`;
    byId("visible-source-count").textContent = String(sources.length).padStart(2, "0");
    byId("visible-claim-count").textContent = String(claims.length).padStart(2, "0");
    byId("empty-state").hidden = claims.length !== 0;
    byId("query").value = state.query;
    byId("kind").value = state.kind;
    for (const button of document.querySelectorAll("[data-stance]")) {
      button.setAttribute("aria-pressed", String(button.dataset.stance === state.stance));
    }
    for (const button of document.querySelectorAll("[data-tab]")) {
      const selected = button.dataset.tab === state.tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      byId("panel-" + button.dataset.tab).hidden = !selected;
    }
    restoreFocus(focusKey);
    queueConnections();
  }

  function dispatch(action, route = false) {
    state = M.transition(data, state, action);
    render();
    if (route) {
      const hash = M.routeFor(state);
      try {
        root.history.replaceState(null, "", hash);
      } catch {
        root.location.hash = hash;
      }
    }
  }

  function updateScenario() {
    const gateIds = [...document.querySelectorAll("[data-gate-toggle]")]
      .filter((input) => input.checked).map((input) => input.dataset.gateToggle);
    state = M.transition(data, state, { type: "scenario", gateIds });
    byId("scenario-result").textContent = R.scenarioMessage(state.hypotheticalGates, bundle.protocol);
  }

  byId("source-count").textContent = String(data.sources.length);
  byId("family-count").textContent = String(data.families.length);
  byId("case-count").textContent = String(M.assessVerdict(data, bundle.protocol).qualifiedCaseIds.length);
  byId("strongest-cases").innerHTML = R.strongestCases(data);
  byId("gates-content").innerHTML = R.gates(bundle, state);
  byId("method-content").innerHTML = R.method(bundle);

  byId("query").addEventListener("input", (event) => dispatch({ type: "filter", query: event.target.value }));
  byId("kind").addEventListener("change", (event) => dispatch({ type: "filter", kind: event.target.value }));
  byId("reset-filters").addEventListener("click", () => dispatch({ type: "reset" }));
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-claim], [data-source], [data-stance], [data-tab], [data-tab-link]");
    if (!button) return;
    if (button.dataset.claim) dispatch({ type: "claim", id: button.dataset.claim }, true);
    else if (button.dataset.source) dispatch({ type: "source", id: button.dataset.source }, true);
    else if (button.dataset.stance) dispatch({ type: "filter", stance: button.dataset.stance });
    else {
      event.preventDefault();
      dispatch({ type: "tab", tab: button.dataset.tab || button.dataset.tabLink }, true);
      if (button.dataset.tabLink) {
        byId("workspace").scrollIntoView({ behavior: "auto", block: "start" });
        byId("tab-" + state.tab).focus({ preventScroll: true });
      }
    }
    if ((button.dataset.claim || button.dataset.source) && root.innerWidth <= 900) {
      byId("inspector-content").scrollIntoView({ behavior: "auto", block: "start" });
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset.gateToggle) updateScenario();
  });
  byId("reset-scenario").addEventListener("click", () => {
    for (const input of document.querySelectorAll("[data-gate-toggle]")) input.checked = false;
    updateScenario();
  });
  document.addEventListener("keydown", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = M.tabs.indexOf(tab.dataset.tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? M.tabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + M.tabs.length) % M.tabs.length;
    dispatch({ type: "tab", tab: M.tabs[next] }, true);
    byId("tab-" + M.tabs[next]).focus();
  });
  root.addEventListener("hashchange", () => {
    const route = M.initialState(data, root.location.hash);
    state = { ...route, hypotheticalGates: state.hypotheticalGates };
    render();
  });
  root.addEventListener("resize", queueConnections);
  if (root.ResizeObserver) new root.ResizeObserver(queueConnections).observe(byId("map-shell"));
  render();
})(globalThis);
