(function () {
  "use strict";
  const data = globalThis.INVENTION_SNAPSHOT;
  const engine = globalThis.PackingLab;
  const $ = (id) => document.getElementById(id);
  const names = {
    "input-first-fit": "Input-order first-fit",
    "dominant-first-fit": "Dominant first-fit",
    "volume-first-fit": "Volume-first first-fit",
    "dual-best-fit": "Dual-capacity best-fit",
    "beam-128": "Beam search · 128",
    "bounded-exact": "Bounded exact search"
  };
  const mechanisms = {
    "input-first-fit": "Baseline · first feasible tote",
    "dominant-first-fit": "Control · dominant-load order",
    "volume-first-fit": "Control · volume-first order",
    "dual-best-fit": "Candidate · greedy residual matching",
    "beam-128": "Candidate · bounded multi-path search",
    "bounded-exact": "Candidate · exhaustive search, when allowed"
  };
  const scenarios = {
    "order-trap": { title: "Order trap", note: "Four items, wrong order", purpose: "Small fillers arrive before larger cores. Can a method recover the two natural pairings?" },
    "weight-trap": { title: "Weight trap", note: "Two constraints matter", purpose: "Bulky light panels meet small dense pouches. Volume-only intuition strands weight capacity." },
    "mixed-classroom": { title: "Mixed classroom", note: "Keep the counterexample", purpose: "Five types, fourteen items. A plausible decreasing-load rule can be worse than the source order." },
    "bulky-gaps": { title: "Bulky gaps", note: "A bound is not an answer", purpose: "Three indivisible six-volume items expose what aggregate capacity arithmetic leaves out." }
  };
  const state = { scenario: "order-trap", trial: 0, method: data.result.decision.selectedMethod ?? "input-first-fit" };

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function button(text, action, className) {
    const node = element("button", text, className);
    node.type = "button"; node.addEventListener("click", action);
    return node;
  }
  function text(id, value) { $(id).textContent = value; }
  const signed = (value) => value > 0 ? `+${value}` : value === 0 ? "—" : String(value);
  const deltaClass = (value) => value > 0 ? "delta-positive" : value < 0 ? "delta-negative" : "muted";
  const currentCase = () => state.trial === 0
    ? data.authored.find((entry) => entry.scenario === state.scenario)
    : data.trials.find((entry) => entry.scenario === state.scenario && entry.trial === state.trial);
  const currentScenario = () => data.audit.scenarios.find((entry) => entry.id === state.scenario);

  function renderOverview() {
    const result = data.result;
    const selected = result.methods.find((method) => method.method === result.decision.selectedMethod);
    text("baseline-paired", result.baselinePaired);
    text("selected-paired", selected ? selected.pairedTotal : "None");
    text("saved-paired", result.decision.pairedBinsSaved);
    text("validations", result.execution.totalAssignmentsVerified);
    text("selected-method-name", selected ? names[selected.method] : "No candidate passed");
    text("verdict-title", selected ? `${result.decision.authoredBinsSaved} fewer authored bin${result.decision.authoredBinsSaved === 1 ? "" : "s"}. Still not a physical invention.` : "A rigorous negative result.");
    text("hero-note", selected
      ? `${names[selected.method]} passes the frozen gate: ${selected.authoredTotal} vs ${result.baselineAuthored} authored bins, ${selected.pairedTotal} vs ${result.baselinePaired} paired bins. Best-fit fails. All losses remain visible.`
      : "No candidate meets the frozen improvement gate. That is a result worth keeping, not a reason to change the rules.");
    text("freeze-hash", data.freeze.original_freeze_commit.slice(0, 12));
    $("freeze-hash").title = data.freeze.original_freeze_commit;
    $("method-overview").replaceChildren(...result.methods.map((summary) => {
      const row = element("tr", null, summary.method === result.decision.selectedMethod ? "selected-row" : "");
      const name = element("td");
      name.append(element("span", names[summary.method], "method-title"), element("small", mechanisms[summary.method]));
      const gate = element("td");
      gate.append(element("span", summary.gate ? summary.gate.pass ? "PASS" : "FAIL" : summary.role === "baseline" ? "BASELINE" : "CONTROL",
        `gate ${summary.gate ? summary.gate.pass ? "pass" : "fail" : "control"}`));
      if (summary.gate && !summary.gate.pass) gate.append(element("small", "Regression retained; inspect below"));
      row.append(name, element("td", summary.authoredTotal), element("td", summary.pairedTotal),
        element("td", `${summary.wins} / ${summary.ties} / ${summary.losses}`), gate);
      return row;
    }));
  }

  function selectCase(scenario, trial, method = state.method) {
    state.scenario = scenario; state.trial = trial; state.method = method;
    renderPicker(); renderCurrent(); renderTrialGrid();
  }

  function renderPicker() {
    $("scenario-picker").replaceChildren(...data.audit.scenarios.map((scenario) => {
      const node = button("", () => selectCase(scenario.id, 0), "scenario-button");
      node.setAttribute("aria-pressed", String(state.scenario === scenario.id));
      node.append(element("strong", scenarios[scenario.id].title), element("span", `${scenario.itemCount} items · ${scenarios[scenario.id].note}`));
      return node;
    }));
    $("case-select").replaceChildren(...[0, ...Array.from({ length: 20 }, (_, i) => i + 1)].map((trial) => {
      const option = element("option", trial === 0 ? "Authored source order" : `Paired trial ${String(trial).padStart(2, "0")}`);
      option.value = String(trial); return option;
    }));
    $("case-select").value = String(state.trial);
    $("method-select").value = state.method;
  }

  function proofText(packed, entry) {
    const proof = packed.proof;
    if (proof.method === "aggregate-bound-equality") return `A feasible ${packed.count}-tote assignment reaches the aggregate lower bound ${packed.lowerBound}. This proves the optimal count in the two-capacity scalar model only.`;
    if (proof.method === "exhaustive-search") return `Exhaustive search visited ${packed.trace.nodes} states and ruled out every improving packing. Optimal scalar count: ${packed.count}; aggregate lower bound alone: ${packed.lowerBound}.`;
    const extra = entry.methods["bounded-exact"];
    const crossProof = extra.proof.status === "proven-model-optimum" && extra.count === packed.count
      ? ` Separately, the bounded-exact result for this same case certifies ${packed.count}.` : "";
    if (proof.searchStatus === "skipped-item-limit") return `Search skipped: ${currentScenario().itemCount} items exceeds the frozen limit of 12. Returned incumbent: ${packed.count}; lower bound: ${packed.lowerBound}. Optimality remains unknown.`;
    if (proof.searchStatus === "node-limit") return `Search stopped at ${packed.trace.nodes} states. Feasible upper bound ${packed.count}, lower bound ${packed.lowerBound}; no completed proof.`;
    return `This method supplies a feasible upper bound of ${packed.count}, above the aggregate lower bound ${packed.lowerBound}; it does not itself prove optimality.${crossProof}`;
  }

  function renderBins(packed, scenario) {
    const items = new Map(scenario.items.map((item) => [item.id, item]));
    $("bins-grid").replaceChildren(...packed.bins.map((bin) => {
      const card = element("article", null, "tote");
      const heading = element("div", null, "tote-heading");
      heading.append(element("h4", `TOTE ${bin.id.slice(1)}`), element("span", `${bin.itemIds.length} item${bin.itemIds.length === 1 ? "" : "s"}`));
      card.append(heading);
      for (const [label, load, remaining, capacity, className] of [
        ["Volume", bin.volume, bin.remainingVolume, data.audit.capacity.volume_units, "volume"],
        ["Weight", bin.weight, bin.remainingWeight, data.audit.capacity.weight_units, "weight"]
      ]) {
        const line = element("div", null, "load-row");
        line.append(element("strong", `${label} ${load} / ${capacity}`), element("span", `${remaining} remaining`));
        const meter = element("meter", null, className);
        meter.min = 0; meter.max = capacity; meter.value = load;
        meter.setAttribute("aria-label", `${label}: ${load} of ${capacity}; ${remaining} remaining`);
        card.append(line, meter);
      }
      const list = element("ul", null, "item-list");
      for (const id of bin.itemIds) {
        const item = items.get(id), row = element("li");
        row.append(element("code", id), element("small", `V ${item.volume} · W ${item.weight} | ${item.shapeNote}`));
        list.append(row);
      }
      card.append(list); return card;
    }));
  }

  function renderCurrent() {
    const entry = currentCase(), scenario = currentScenario(), packed = entry.methods[state.method];
    $("case-select").value = String(state.trial); $("method-select").value = state.method;
    text("current-case-label", state.trial ? `PAIRED TRIAL ${String(state.trial).padStart(2, "0")} / SEED 1729` : "AUTHORED SOURCE ORDER / NOT SHUFFLED");
    text("scenario-name", scenarios[state.scenario].title);
    text("scenario-purpose", scenarios[state.scenario].purpose);
    text("scenario-meta", `${scenario.itemCount} items · total V ${scenario.totalVolume} / W ${scenario.totalWeight} · aggregate lower bound ${scenario.lowerBound}`);
    const maxCount = Math.max(...Object.values(entry.methods).map((value) => value.count));
    $("current-compare").replaceChildren(...engine.METHODS.map((method) => {
      const value = entry.methods[method], delta = value.count - entry.methods["input-first-fit"].count;
      const row = element("tr", null, state.method === method ? "selected-row" : "");
      const name = element("td"), count = element("td"), countInner = element("span", null, "count-cell");
      name.append(button(names[method], () => { state.method = method; renderCurrent(); }, "method-pick"));
      const track = element("span", null, "count-track"), fill = element("span", null, "count-fill");
      fill.style.width = `${100 * value.count / maxCount}%`; track.setAttribute("aria-hidden", "true"); track.append(fill);
      countInner.append(element("strong", value.count), track); count.append(countInner);
      const proof = value.proof.method === "aggregate-bound-equality" ? "Bound equality" : value.proof.method === "exhaustive-search" ? "Exhaustive proof" : "Unproven";
      row.append(name, count, element("td", signed(delta), deltaClass(delta)), element("td", proof, value.proof.status === "bounded-unknown" ? "muted" : "success"));
      return row;
    }));
    text("packing-heading", `${names[state.method]} / exact assignments`);
    text("packing-summary", `${packed.count} totes · ${packed.validation.assignedItems}/${scenario.itemCount} items exactly once · both capacities verified`);
    const proven = packed.proof.status === "proven-model-optimum";
    text("proof-pill", proven ? "PROVED IN SCALAR MODEL" : "METHOD-LOCAL PROOF: UNKNOWN");
    $("proof-pill").className = `badge ${proven ? "proof-proven" : "proof-unknown"}`;
    text("proof-explainer", proofText(packed, entry));
    renderBins(packed, scenario);
    $("incoming-order").replaceChildren(...entry.incomingOrder.map((id) => element("li", id)));
    text("trace-output", JSON.stringify({
      caseId: entry.caseId, method: state.method, processingOrder: packed.processingOrder,
      proof: packed.proof, validation: packed.validation, trace: packed.trace
    }, null, 2));
    text("replay-status", "Read-only local replay; no evidence is overwritten.");
  }

  function renderTrialGrid() {
    $("trial-grid").replaceChildren(...data.trials.filter((entry) => entry.scenario === state.scenario).map((entry) => {
      const row = element("tr", null, entry.trial === state.trial ? "selected-row" : "");
      const label = element("td");
      label.append(button(String(entry.trial).padStart(2, "0"), () => selectCase(entry.scenario, entry.trial), "trial-jump"));
      row.append(label);
      for (const method of engine.METHODS) {
        const count = entry.methods[method].count, delta = count - entry.methods["input-first-fit"].count;
        row.append(element("td", count, delta > 0 ? "loss-cell" : delta < 0 ? "win-cell" : ""));
      }
      return row;
    }));
  }

  function renderFailures() {
    const ledger = data.counterexamples, filter = $("failure-filter").value || "all";
    const all = [...ledger.authoredRegressions, ...ledger.pairedRegressions];
    const losses = all.filter((entry) => filter === "all" || data.result.methods.find((method) => method.method === entry.method).role === filter);
    text("failure-count", `${losses.length} shown / ${all.length} retained losses (${ledger.authoredRegressions.length} authored, ${ledger.pairedRegressions.length} paired). No valid trial was excluded.`);
    $("failure-list").replaceChildren(...losses.map((entry) => {
      const row = element("tr"), name = element("td");
      name.append(button(`${scenarios[entry.scenario].title} / ${entry.trial ? `trial ${entry.trial}` : "authored"}`, () => {
        selectCase(entry.scenario, entry.trial, entry.method);
        $("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
      }));
      row.append(name, element("td", names[entry.method]), element("td", `${entry.baselineCount} → ${entry.methodCount}`), element("td", `+${entry.extraBins}`, "error"));
      return row;
    }));
    const skipped = data.result.methods.find((summary) => summary.method === "bounded-exact").searchStatuses["skipped-item-limit"] ?? 0;
    text("unproven-info", `${ledger.unprovenResults.length} method-local results do not close their own bounds. Exact search was size-skipped in ${skipped} cases. Unknown is not a failed capacity check.`);
    text("fallback-note", `Beam fallback to the first-fit incumbent: ${ledger.beamFallbacks.length} cases. Raw beam counts and every frontier truncation remain in the trace. Node-limit behavior is tested separately, not injected into the frozen study.`);
  }

  function renderProvenance() {
    $("provenance-table").replaceChildren(...data.sources.copied_data.map((source) => {
      const row = element("tr"), name = element("td"), hash = element("td");
      const link = element("a", source.local.replace("source/", ""));
      link.href = source.local;
      name.append(link); hash.append(element("code", source.sha256));
      row.append(name, hash); return row;
    }));
    $("limitations-list").replaceChildren(...data.result.limitations.map((limitation) => element("li", limitation)));
  }

  $("method-select").replaceChildren(...engine.METHODS.map((method) => {
    const option = element("option", names[method]); option.value = method; return option;
  }));
  $("case-select").addEventListener("change", () => selectCase(state.scenario, Number($("case-select").value)));
  $("method-select").addEventListener("change", () => { state.method = $("method-select").value; renderCurrent(); });
  $("failure-filter").addEventListener("change", renderFailures);
  $("inspect-known-failure").addEventListener("click", () => {
    selectCase("mixed-classroom", 0, "dominant-first-fit");
    $("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("print-button").addEventListener("click", () => globalThis.print());
  $("replay-button").addEventListener("click", () => {
    try {
      const entry = currentCase(), scenario = currentScenario();
      const items = entry.incomingOrder.map((id) => scenario.items.find((item) => item.id === id));
      const actual = engine.pack(items, data.audit.capacity, state.method, {
        beamWidth: data.protocol.beam_width,
        exactItemLimit: data.protocol.exact_item_limit,
        exactNodeLimit: data.protocol.exact_node_limit
      });
      if (JSON.stringify(actual) !== JSON.stringify(entry.methods[state.method])) throw new Error("Local result differs from saved evidence");
      text("replay-status", `MATCH · ${actual.count} totes, all ${scenario.itemCount} items, both capacities and the complete trace reproduced. No files changed.`);
    } catch (error) {
      text("replay-status", `REPLAY FAILED · ${error.message}. Saved evidence was not changed.`);
    }
  });
  renderOverview(); renderPicker(); renderCurrent(); renderTrialGrid(); renderFailures(); renderProvenance();
})();
