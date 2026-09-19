import { initialScenario, rankVentures, recommendedAllocation, auditAllocation, sensitivity, ventureMinutes } from "./model.mjs";
import { inspectCsv, parseCsv, MAX_BYTES } from "./csv-checker.mjs";

const $ = id => document.getElementById(id);
const element = (tag, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const display = value => Number.isFinite(value) ? String(value) : "—";
const scoreText = value => Number.isFinite(value) ? value.toFixed(2) : "—";
const paragraph = (text, className = "") => element("p", className, text);
const listMessages = (target, messages, className = "error small") => {
  target.replaceChildren();
  if (!messages.length) return;
  const list = element("ul", className);
  for (const message of messages) list.append(element("li", "", message));
  target.append(list);
};

let data, scenario, allocations, fixture, originals, lastReport = null, fileBytes = null, fileReadToken = 0;
const rowViews = new Map();

function downloadJson(name, value) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }));
  const link = element("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function numberControl(venture, key, label, min, max) {
  const wrapper = element("label", "", label);
  const input = element("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.value = String(key === "allocation" ? allocations[venture.id] : venture[key]);
  input.setAttribute("aria-label", `${venture.name}: ${label}`);
  input.addEventListener("input", () => {
    if (key === "allocation") allocations[venture.id] = input.valueAsNumber;
    else venture[key] = input.valueAsNumber;
    renderDecision();
  });
  wrapper.append(input);
  return { wrapper, input };
}

function buildVentureControls() {
  $("venture-rows").replaceChildren();
  rowViews.clear();
  for (const venture of scenario.ventures) {
    const row = element("tr");
    const identity = element("td");
    const disposition = element("span", "row-note");
    identity.append(element("strong", "venture-title", venture.name), disposition);
    const metric = element("td");
    const score = element("strong", "row-score");
    const need = element("span", "row-need");
    const reason = element("span", "row-note");
    metric.append(score, need, reason);
    const timing = element("td");
    const delivery = numberControl(venture, "deliveryMinutes", "Delivery", 1, 10000);
    const prep = numberControl(venture, "testPrepMinutes", "Test prep", 0, 10000);
    timing.append(delivery.wrapper, prep.wrapper);
    const ordinals = element("td");
    ordinals.append(numberControl(venture, "learning", "Learn", 1, 5).wrapper, numberControl(venture, "reuse", "Reuse", 1, 5).wrapper);
    const belief = element("td");
    belief.append(numberControl(venture, "confidence", "Confidence", 0, 100).wrapper);
    const prerequisite = element("td");
    const readyLabel = element("label", "", "Ready");
    const ready = element("input");
    ready.type = "checkbox";
    ready.checked = venture.ready;
    ready.setAttribute("aria-label", `${venture.name}: offline prerequisite ready`);
    ready.addEventListener("change", () => { venture.ready = ready.checked; renderDecision(); });
    readyLabel.prepend(ready);
    prerequisite.append(readyLabel);
    const funded = element("td");
    const allocation = numberControl(venture, "allocation", "Minutes", 0, 10000);
    funded.append(allocation.wrapper);
    row.append(identity, metric, timing, ordinals, belief, prerequisite, funded);
    $("venture-rows").append(row);
    rowViews.set(venture.id, { row, disposition, score, need, reason, delivery: delivery.input, prep: prep.input, allocation: allocation.input });
  }
}

function syncGlobalControls() {
  for (const key of ["learning", "reuse", "speed"]) $(`${key}-weight`).value = String(scenario.weights[key]);
  $("reserve").value = String(scenario.reserveMinutes);
  $("review").value = String(scenario.reviewMinutes);
  $("scope-mode").value = scenario.mode;
}

function renderDecision() {
  const ranking = rankVentures(scenario);
  const best = ranking.candidates.find(c => c.id === ranking.recommended);
  const audit = auditAllocation(scenario, allocations);
  for (const key of ["learning", "reuse", "speed"]) $(`${key}-value`).textContent = display(scenario.weights[key]);
  $("recommendation-name").textContent = best?.name ?? "No defensible selection";
  $("recommendation-score").textContent = best ? `${scoreText(best.score)} / 100 heuristic` : "Constraints first";
  $("recommendation-reason").textContent = best
    ? `${best.name} leads this objective: ${best.unitMinutes} venture minutes + ${scenario.reviewMinutes} review + ${scenario.reserveMinutes} protected reserve = ${best.totalMinutes + scenario.reserveMinutes} of 300. ${300 - best.totalMinutes - scenario.reserveMinutes} minutes stay uncommitted. This is a prototype allocation, not a forecast of demand.`
    : "Park all five until a positive-score option satisfies the stated inputs. Invalid weights, unavailable prerequisites or infeasible time do not justify pretending a plan fits.";
  $("tie-note").textContent = ranking.tiedIds.length > 1
    ? `Score tie: ${ranking.tiedIds.map(id => scenario.ventures.find(v => v.id === id).name).join(", ")}. Fewer required minutes, then lexical ID breaks it deterministically.`
    : best && ranking.margin !== null
      ? `${scoreText(ranking.margin)} points ahead of the next feasible alternative. This precision is arithmetic, not confidence in the real world.`
      : "No second feasible positive-score alternative to compare.";
  listMessages($("ranking-issues"), ranking.issues);
  $("apply-recommendation").disabled = !best;
  $("download-decision").disabled = !ranking.valid;
  $("offering-policy").textContent = best?.id === "ledgerleaf-tools"
    ? "The Ledgerleaf checker below is the actual built offering. The other four remain distinct, parked proposals."
    : "Counterfactual only: Ledgerleaf is the offering built in this demo. Changing the winner does not claim another venture's product has been built or tested.";
  $("budget-total").textContent = `${display(audit.usedMinutes)} / 300 min`;
  $("budget-total").className = audit.feasible ? "" : "error";
  $("budget-progress").value = Math.min(300, Math.max(0, Number.isFinite(audit.usedMinutes) ? audit.usedMinutes : 0));
  $("budget-progress").setAttribute("aria-valuetext", `${display(audit.usedMinutes)} of 300 minutes; ${audit.feasible ? "feasible" : "infeasible"}`);
  $("budget-ledger").replaceChildren();
  for (const [value, label] of [[audit.allocatedMinutes, "venture work"], [audit.reviewMinutes, "shared review"], [audit.reserveMinutes, "protected reserve"], [audit.unusedMinutes, "uncommitted"]]) {
    const item = element("div", "ledger-item");
    item.append(element("strong", value < 0 ? "error" : "", display(value)), element("span", "", label));
    $("budget-ledger").append(item);
  }
  if (audit.feasible) {
    const matches = audit.active[0] === ranking.recommended;
    $("allocation-status").replaceChildren(paragraph(
      audit.active.length ? `Feasible proposal. ${matches ? "Matches the current model recommendation." : "Differs from the current recommendation; your allocation has not been changed."}` : "Feasible empty allocation: all ventures are parked; no offering is funded.",
      "success small"
    ));
  } else listMessages($("allocation-status"), audit.issues);
  for (const venture of scenario.ventures) {
    const view = rowViews.get(venture.id);
    const candidate = ranking.candidates.find(c => c.id === venture.id);
    const funded = allocations[venture.id] > 0;
    view.row.className = venture.id === ranking.recommended ? "is-leader" : "";
    view.disposition.textContent = `${funded ? "Funded in your proposal" : "Parked in your proposal"}${venture.id === ranking.recommended ? " · model leader" : ""}`;
    view.score.textContent = candidate ? scoreText(candidate.score) : "—";
    view.need.textContent = candidate ? `${candidate.totalMinutes} min incl. review` : "Check invalid inputs";
    view.reason.textContent = candidate?.reasons.join(" ") ?? "";
    view.reason.className = candidate?.feasible === false ? "row-note error" : "row-note";
    view.delivery.disabled = scenario.mode === "seed";
    view.prep.disabled = scenario.mode === "seed";
  }
  $("sensitivity-rows").replaceChildren();
  for (const test of sensitivity(scenario)) {
    const row = element("tr");
    for (const text of [test.label, test.name, scoreText(test.score), test.valid ? (test.changed ? "Changes winner" : "Same winner") : "Invalid objective"]) {
      row.append(element("td", test.changed ? "changed" : "", text));
    }
    $("sensitivity-rows").append(row);
  }
}

function buildEvidenceViews() {
  for (const [index, venture] of data.ventures.entries()) {
    const article = element("article", "venture-brief");
    article.append(element("span", "brief-number", `${String(index + 1).padStart(2, "0")} / ${venture.kind.toUpperCase()}`));
    article.append(element("h3", "", venture.name), paragraph(venture.offerHypothesis, "muted"));
    article.append(element("span", "badge", `${venture.primaryExperiment} direction · synthetic / unvalidated`));
    const facts = element("dl");
    const addFact = (title, text) => facts.append(element("dt", "", title), element("dd", "", text));
    addFact("Smallest offering", venture.smallestOffer);
    addFact("Frozen starting estimate · not measured", `${venture.deliveryMinutes} delivery + ${venture.testPrepMinutes} test-preparation minutes. ${venture.estimateReason}`);
    addFact("Offline dependency", `${venture.dependency.label}. ${venture.dependency.basis}`);
    addFact("Audience hypothesis", venture.plan.audienceHypothesis);
    addFact("Cheapest scoped demand question", venture.plan.question);
    addFact("Future test · NOT performed", `${venture.plan.protocol} Estimated later observation/review: ${venture.plan.laterExecutionMinutes} founder minutes, plus unknown recruitment. Not funded this week.`);
    addFact("Precommitted pass rule", venture.plan.pass);
    addFact("Disconfirm / stop", venture.plan.stop);
    addFact("What a pass cannot establish", venture.plan.interpretation);
    article.append(facts);
    const detail = element("details");
    detail.append(element("summary", "", "Two original uncertainty rows + explicit non-goals"));
    for (const uncertainty of venture.uncertainties) {
      const item = element("div", "claim-item");
      item.append(element("strong", "small", `${uncertainty.id} · ${uncertainty.claim}`));
      item.append(paragraph(`Synthetic available evidence: ${uncertainty.evidence}. Disconfirming observation: ${uncertainty.disconfirm}.`, "muted"));
      detail.append(item);
    }
    detail.append(paragraph(`Non-goals: ${venture.nonGoals}`));
    article.append(detail);
    $("venture-briefs").append(article);
    const reuseRow = element("tr");
    for (const text of [venture.name, venture.reuseUse, venture.reuseBoundary]) reuseRow.append(element("td", "", text));
    $("reuse-rows").append(reuseRow);
  }
  for (const row of parseCsv(originals).slice(1)) {
    const cells = row.cells;
    const tr = element("tr");
    for (const text of [cells[1], cells[3], `$${cells[4]}`, cells[8] === "1" ? "Yes (reference only)" : "No"]) tr.append(element("td", "", text));
    $("seed-rows").append(tr);
  }
}

function markReportStale(message = "Input changed. Run the local preflight again; the previous report is not current.") {
  lastReport = null;
  $("download-report").disabled = true;
  $("csv-findings").replaceChildren();
  $("csv-status").replaceChildren(paragraph(message, "muted"));
  $("csv-json").textContent = "No current report.";
}

function runPreflight() {
  const required = $("required-columns").value.split(",").map(s => s.trim()).filter(Boolean);
  const report = inspectCsv(fileBytes ?? $("csv-text").value, { key: $("key-column").value.trim(), required });
  lastReport = report;
  $("download-report").disabled = false;
  const headline = report.status === "refused"
    ? "Input refused — not checked"
    : report.status === "pass"
      ? `${report.dataRecords} data records · no structural findings under these options`
      : `${report.dataRecords} data records · ${report.findingCount} structural finding${report.findingCount === 1 ? "" : "s"}`;
  $("csv-status").replaceChildren(paragraph(headline, report.status === "pass" ? "success" : "changed"));
  if (report.truncated) $("csv-status").append(paragraph("Only the first 200 findings are shown; the total above includes all findings.", "notice small"));
  $("csv-findings").replaceChildren();
  for (const finding of report.findings) {
    const card = element("div", "finding");
    card.append(element("strong", "", finding.code));
    if (finding.record !== null || finding.line !== null) {
      card.append(element("span", "location", [
        finding.record !== null ? `Record ${finding.record}` : "",
        finding.line !== null ? `physical line ${finding.line}` : "",
        finding.column !== null ? `column ${finding.column}` : "",
        finding.relatedRecord ? `first seen at record ${finding.relatedRecord}` : ""
      ].filter(Boolean).join(" · ")));
    }
    card.append(paragraph(finding.message));
    $("csv-findings").append(card);
  }
  $("csv-status").append(paragraph(report.boundary, "small muted"));
  $("csv-json").textContent = JSON.stringify(report, null, 2);
}

function loadFixture() {
  fileReadToken += 1;
  fileBytes = null;
  $("csv-file").value = "";
  $("csv-text").value = fixture;
  $("key-column").value = "invoice-id";
  $("required-columns").value = "invoice-id,amount-usd";
  runPreflight();
}

function wireEvents() {
  for (const key of ["learning", "reuse", "speed"]) {
    $(`${key}-weight`).addEventListener("input", event => {
      scenario.weights[key] = event.target.valueAsNumber;
      renderDecision();
    });
  }
  for (const [id, key] of [["reserve", "reserveMinutes"], ["review", "reviewMinutes"]]) {
    $(id).addEventListener("input", event => { scenario[key] = event.target.valueAsNumber; renderDecision(); });
  }
  $("scope-mode").addEventListener("change", event => { scenario.mode = event.target.value; renderDecision(); });
  $("balanced").addEventListener("click", () => { scenario.weights = { learning: 3, reuse: 2, speed: 1 }; syncGlobalControls(); renderDecision(); });
  $("fastest").addEventListener("click", () => { scenario.weights = { learning: 0, reuse: 0, speed: 10 }; syncGlobalControls(); renderDecision(); });
  $("reset").addEventListener("click", () => {
    scenario = initialScenario(data);
    allocations = recommendedAllocation(scenario);
    buildVentureControls();
    syncGlobalControls();
    renderDecision();
  });
  $("apply-recommendation").addEventListener("click", () => {
    allocations = recommendedAllocation(scenario);
    for (const [id, view] of rowViews) view.allocation.value = String(allocations[id]);
    renderDecision();
  });
  $("download-decision").addEventListener("click", () => {
    const audit = auditAllocation(scenario, allocations);
    downloadJson("five-hour-decision.json", {
      schema: "local-decision-proposal/1", status: audit.feasible ? "unapproved-proposal" : "infeasible-proposal",
      classification: data.classification, objective: data.objective,
      assumptions: scenario, allocations, audit, ranking: rankVentures(scenario),
      sensitivity: sensitivity(scenario),
      actuallyBuilt: "Ledgerleaf CSV Preflight; other offerings are plans only",
      marketObservations: 0, authority: "No outreach, publication, spending or native activation",
      boundary: "A snapshot records the proposed inputs, not approval or market evidence. Invalid numeric allocation fields serialize as null.",
      sourceReferences: "projects/02-conglomerate/sources.json"
    });
  });
  $("checker-form").addEventListener("submit", event => { event.preventDefault(); runPreflight(); });
  $("load-fixture").addEventListener("click", loadFixture);
  $("csv-text").addEventListener("input", () => {
    fileReadToken += 1;
    fileBytes = null;
    $("csv-file").value = "";
    markReportStale();
  });
  for (const id of ["key-column", "required-columns"]) $(id).addEventListener("input", () => markReportStale());
  $("csv-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    const token = ++fileReadToken;
    fileBytes = null;
    if (!file) return;
    markReportStale("Reading only the selected local file…");
    $("csv-text").value = "";
    if (file.size > MAX_BYTES) {
      markReportStale("File refused: over the 1 MiB limit. No bytes were read. Select a smaller fictional file.");
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (token !== fileReadToken) return;
      fileBytes = bytes;
      try { $("csv-text").value = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { $("csv-text").value = ""; }
      runPreflight();
    } catch {
      if (token === fileReadToken) markReportStale("The selected file could not be read. Nothing was checked or uploaded.");
    }
  });
  $("download-report").addEventListener("click", () => {
    if (lastReport) downloadJson("ledgerleaf-findings.json", lastReport);
  });
}

async function boot() {
  try {
    const responses = await Promise.all(["./data/inputs.json", "./data/csv-intake.csv", "./data/allocation-worksheet.csv"].map(path => fetch(new URL(path, import.meta.url))));
    if (responses.some(response => !response.ok)) throw new Error("Local input unavailable");
    [data, fixture, originals] = await Promise.all([responses[0].json(), responses[1].text(), responses[2].text()]);
    scenario = initialScenario(data);
    allocations = recommendedAllocation(scenario);
    buildVentureControls();
    buildEvidenceViews();
    syncGlobalControls();
    wireEvents();
    renderDecision();
    loadFixture();
    $("app").hidden = false;
    $("load-status").hidden = true;
  } catch {
    $("load-status").className = "notice";
    $("load-status").textContent = "The local app could not load. Open projects/02-conglomerate/index.html through the repository-root HTTP preview (not file://), with the data directory intact. No external service is needed.";
  }
}

await boot();
