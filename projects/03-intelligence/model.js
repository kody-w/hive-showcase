(function (root) {
  "use strict";

  const stances = ["all", "support", "challenge", "context"];
  const kinds = ["all", "experiment", "observational", "benchmark", "commercial"];
  const tabs = ["map", "gates", "method"];
  const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase().trim();
  const sourceById = (data, id) => data.sources.find((source) => source.id === id);
  const claimById = (data, id) => data.claims.find((claim) => claim.id === id);

  function filterClaims(data, state = {}) {
    const stance = stances.includes(state.stance) ? state.stance : "all";
    const kind = kinds.includes(state.kind) ? state.kind : "all";
    const query = normalize(state.query);
    return data.claims.filter((claim) => {
      if (stance !== "all" && claim.stance !== stance) return false;
      const sources = claim.citations.map((citation) => sourceById(data, citation.sourceId));
      if (kind !== "all" && !sources.some((source) => source.kind === kind)) return false;
      const text = [
        claim.id, claim.title, claim.text, claim.implication, claim.limit, claim.kind,
        ...sources.flatMap((source) => [source.label, source.title, source.publisher, source.publicationDate]),
      ].join(" ");
      return !query || normalize(text).includes(query);
    });
  }

  function visibleSources(data, claims) {
    const ids = new Set(claims.flatMap((claim) => claim.citations.map((citation) => citation.sourceId)));
    return data.sources.filter((source) => ids.has(source.id));
  }

  function edgesFor(claims) {
    return claims.flatMap((claim) => claim.citations.map((citation) => ({
      sourceId: citation.sourceId, claimId: claim.id, stance: claim.stance,
    })));
  }

  function reconcile(data, state) {
    const claims = filterClaims(data, state);
    const sources = visibleSources(data, claims);
    if (state.selectedType === "source" && sources.some((source) => source.id === state.selectedId)) return state;
    if (state.selectedType === "claim" && claims.some((claim) => claim.id === state.selectedId)) return state;
    return { ...state, selectedType: "claim", selectedId: claims[0]?.id || null };
  }

  function initialState(data, hash = "") {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    let state = {
      tab: tabs.includes(params.get("tab")) ? params.get("tab") : "map",
      stance: "all", kind: "all", query: "",
      selectedType: "claim", selectedId: "c-field", hypotheticalGates: [],
    };
    if (sourceById(data, params.get("source"))) {
      state = { ...state, tab: "map", selectedType: "source", selectedId: params.get("source") };
    } else if (claimById(data, params.get("claim"))) {
      state = { ...state, tab: "map", selectedType: "claim", selectedId: params.get("claim") };
    }
    return reconcile(data, state);
  }

  function transition(data, state, action) {
    switch (action.type) {
      case "filter": {
        const next = { ...state };
        if (stances.includes(action.stance)) next.stance = action.stance;
        if (kinds.includes(action.kind)) next.kind = action.kind;
        if (typeof action.query === "string") next.query = action.query;
        return reconcile(data, next);
      }
      case "reset":
        return reconcile(data, { ...state, stance: "all", kind: "all", query: "" });
      case "claim":
      case "source": {
        const found = action.type === "claim" ? claimById(data, action.id) : sourceById(data, action.id);
        if (!found) return state;
        let next = { ...state, tab: "map", selectedType: action.type, selectedId: action.id };
        const visible = action.type === "claim"
          ? filterClaims(data, next).some((claim) => claim.id === action.id)
          : visibleSources(data, filterClaims(data, next)).some((source) => source.id === action.id);
        if (!visible) next = { ...next, stance: "all", kind: "all", query: "" };
        return next;
      }
      case "tab":
        return tabs.includes(action.tab) ? { ...state, tab: action.tab } : state;
      case "scenario":
        return { ...state, hypotheticalGates: [...new Set(action.gateIds)] };
      default:
        return state;
    }
  }

  function allGatesMet(gates, protocol) {
    return protocol.gates.length > 0 && protocol.gates.every((gate) => gates?.[gate.id] === "met");
  }

  function qualifiesBusinessCase(businessCase, protocol) {
    return businessCase.classification === "public-verified-record"
      && businessCase.periodMonths >= 6
      && businessCase.samePeriod === true
      && businessCase.independent === true
      && allGatesMet(businessCase.gates, protocol);
  }

  function profileUndermined(trials) {
    const eligible = trials.filter((trial) => trial.prespecified && trial.matched
      && trial.familiarized && trial.weeks >= 8 && trial.allRoleLogs
      && trial.qualityMeasured && trial.costMeasured);
    const unfavorable = eligible.filter((trial) => trial.accountabilityRetained === false
      || (trial.aiLaborCostAdvantage === false && trial.offsettingQualityBenefit === false));
    return eligible.length >= 3 && unfavorable.length >= 2;
  }

  function assessVerdict(data, protocol) {
    const qualified = data.businessCases.filter((businessCase) => qualifiesBusinessCase(businessCase, protocol));
    const withdrawn = profileUndermined(data.verdict.matchedTrials);
    const cohort = data.verdict.transferCohort;
    const unrelatedFounders = new Set(qualified.filter((item) => item.unrelated && item.founderId)
      .map((item) => item.founderId));
    const transferable = unrelatedFounders.size >= 3 && cohort.denominatorDisclosed
      && cohort.failuresIncluded && cohort.nonAIComparison;
    const id = qualified.length ? "v-demonstrated"
      : withdrawn || !data.verdict.mechanismSupported ? "v-unsupported" : "v-plausible";
    return { id, qualifiedCaseIds: qualified.map((item) => item.id), profileAdvisoryWithdrawn: withdrawn, transferable: Boolean(transferable) };
  }

  function counterfactual(gateIds, protocol) {
    const required = new Set(protocol.gates.map((gate) => gate.id));
    const supplied = new Set(gateIds.filter((id) => required.has(id)));
    return {
      hypothetical: true,
      supplied: supplied.size,
      total: required.size,
      allMet: required.size > 0 && supplied.size === required.size,
      verdictId: required.size > 0 && supplied.size === required.size ? "v-demonstrated" : "v-plausible",
    };
  }

  function routeFor(state) {
    if (state.tab !== "map") return "#tab=" + state.tab;
    return state.selectedId ? "#" + state.selectedType + "=" + encodeURIComponent(state.selectedId) : "#tab=map";
  }

  root.EvidenceModel = Object.freeze({
    stances, kinds, tabs, filterClaims, visibleSources, edgesFor, sourceById, claimById,
    initialState, transition, allGatesMet, qualifiesBusinessCase, profileUndermined,
    assessVerdict, counterfactual, routeFor,
  });
})(globalThis);
