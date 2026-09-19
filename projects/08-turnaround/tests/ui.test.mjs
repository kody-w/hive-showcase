import test from "node:test";
import assert from "node:assert/strict";
import { loadInputs } from "../scripts/inputs.mjs";
import { simulate } from "../model.mjs";
import { escapeHtml, formatMoney, dayLabel, aggregateTimeline, cashChartSvg } from "../view-model.mjs";
import { runOriginalUi, runOriginalBoot } from "./dom-harness.mjs";

const uiInputs = loadInputs();

test("display money preserves cents and rejects non-money; all dynamic text can be escaped", () => {
  assert.equal(formatMoney(123456), "$1,234.56");
  assert.equal(formatMoney(-92500), "-$925");
  assert.throws(() => formatMoney(NaN));
  assert.equal(escapeHtml('<img onerror="bad">&\''), "&lt;img onerror=&quot;bad&quot;&gt;&amp;&#39;");
  assert.equal(dayLabel(null), "Beyond window");
  assert.equal(dayLabel(0), "D0");
});

test("weekly display aggregates every daily receipt/outflow once and retains intraday minimum", () => {
  const result = simulate(uiInputs);
  const weeks = aggregateTimeline(result.daily);
  assert.equal(weeks.length, 14);
  assert.equal(weeks.at(-1).endDay, 90);
  assert.equal(weeks.reduce((n, row) => n + row.receiptsCents, 0), result.summary.receiptsWithinHorizonCents);
  assert.equal(weeks.reduce((n, row) => n + row.outflowsCents, 0), result.summary.outflowsWithinHorizonCents);
  assert.equal(Math.min(...weeks.map(row => row.troughAvailableCents)), result.summary.minimumAvailableCents);
  assert.equal(aggregateTimeline(result.daily, "daily").length, 91);
  assert.throws(() => aggregateTimeline(result.daily, "smooth-average"));
});

test("chart has accessible descriptions and distinguishes floor, troughs and counterfactual cash", () => {
  const result = simulate(uiInputs);
  const svg = cashChartSvg(result, result, uiInputs.case.cashFloorCents, 59);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-labelledby="cash-chart-title cash-chart-desc"/);
  assert.match(svg, /Negative values are funding requirements/);
  assert.match(svg, /Counterfactual from D59/);
  assert.match(svg, /class="chart-trough"/);
  assert.match(svg, /class="chart-floor"/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test("file protocol loads only the original classic fallback; local HTTP loads ES modules", () => {
  const disk = runOriginalBoot("file:");
  assert.equal(disk.head.children.length, 1);
  assert.equal(disk.head.children[0].src, "./offline.js");
  assert.notEqual(disk.head.children[0].type, "module");
  const local = runOriginalBoot("http:");
  assert.equal(local.head.children[0].src, "./app.mjs");
  assert.equal(local.head.children[0].type, "module");
  disk.head.children[0].onerror();
  assert.match(disk.getElementById("boot-message").textContent, /No remote fallback/);
});

test("original offline UI boots with failure visible, rather than a claimed successful recovery", () => {
  const dom = runOriginalUi();
  assert.equal(dom.getElementById("boot-message").hidden, true);
  assert.match(dom.getElementById("decision").innerHTML, /No feasible rescue/);
  assert.match(dom.getElementById("metrics").innerHTML, /D58/);
  assert.match(dom.getElementById("metrics").innerHTML, /D90/);
  assert.match(dom.getElementById("metrics").innerHTML, /\$450/);
  assert.match(dom.getElementById("warning-detail").innerHTML, /Earliest forecast warning: D0/);
  assert.match(dom.getElementById("search-note").innerHTML, /0 complete escapes/);
  assert.match(dom.getElementById("support-detail").innerHTML, /No ticket is marked completed/);
  assert.equal(dom.getElementById("scenario-recovery").getAttribute("aria-pressed"), "true");
});

test("scenario buttons wire delayed and combined stress into the actual model", () => {
  const dom = runOriginalUi();
  dom.getElementById("scenario-delayed-receipts").emit("click");
  assert.match(dom.getElementById("metrics").innerHTML, /D28/);
  assert.match(dom.getElementById("metrics").innerHTML, /D59/);
  assert.equal(dom.getElementById("delay-output").textContent, "10 days");
  assert.match(dom.getElementById("conservation").innerHTML, /\$5,075/);
  dom.getElementById("scenario-combined-stress").emit("click");
  assert.match(dom.getElementById("metrics").innerHTML, /D58/);
  assert.match(dom.getElementById("conservation").innerHTML, /-\$10,310/);
  assert.match(dom.getElementById("conservation").innerHTML, /\$4,060/);
  assert.equal(dom.getElementById("demand-output").textContent, "80%");
  assert.equal(dom.getElementById("action-queue-repair").checked, true);
  assert.equal(dom.getElementById("action-hosting-cut").checked, false);
});

test("action toggles make capacity conflicts explicit and clear all unearned benefits", () => {
  const dom = runOriginalUi();
  dom.getElementById("action-hosting-cut").emit("change", { checked: true });
  assert.match(dom.getElementById("decision").innerHTML, /does not fit/);
  assert.match(dom.getElementById("resource-issues").innerHTML, /engineering total 480 exceeds/);
  assert.match(dom.getElementById("resource-issues").innerHTML, /Rejected before execution/);
  assert.match(dom.getElementById("metrics").innerHTML, /\$0/);
  assert.match(dom.getElementById("metrics").innerHTML, /D28/);
  assert.equal(dom.getElementById("scenario-label").textContent, "Custom · conditional plan");
});

test("consent switches remove benefits but retain irreversible start fees", () => {
  const dom = runOriginalUi();
  dom.getElementById("receipt-consent").emit("change", { checked: false });
  assert.match(dom.getElementById("metrics").innerHTML, /\$450/);
  assert.match(dom.getElementById("causal-chain").innerHTML, /no benefit, but work and any start fee stay consumed/);
  assert.equal(dom.getElementById("status-receipt-pull").textContent, "Fee, no benefit");
  assert.match(dom.getElementById("metrics").innerHTML, /D28/);
});

test("custom assumption sliders update model results; reset restores the frozen candidate", () => {
  const dom = runOriginalUi();
  dom.getElementById("delay").emit("input", { value: "10" });
  assert.equal(dom.getElementById("delay-output").textContent, "10 days");
  assert.match(dom.getElementById("metrics").innerHTML, /D28/);
  assert.equal(dom.getElementById("scenario-recovery").getAttribute("aria-pressed"), "false");
  dom.getElementById("reset").emit("click");
  assert.equal(dom.getElementById("delay-output").textContent, "0 days");
  assert.match(dom.getElementById("metrics").innerHTML, /D58/);
  assert.equal(dom.getElementById("scenario-recovery").getAttribute("aria-pressed"), "true");
});

test("invalid start input clears stale output and a valid correction recomputes it", () => {
  const dom = runOriginalUi();
  dom.getElementById("start-queue-repair").emit("input", { value: "0" });
  assert.match(dom.getElementById("decision").innerHTML, /Invalid model input/);
  assert.equal(dom.getElementById("cash-chart").innerHTML, "");
  assert.equal(dom.getElementById("metrics").innerHTML, "");
  assert.match(dom.getElementById("announcer").textContent, /Invalid input/);
  dom.getElementById("start-queue-repair").emit("input", { value: "1" });
  assert.match(dom.getElementById("metrics").innerHTML, /D58/);
  assert.match(dom.getElementById("cash-chart").innerHTML, /<svg/);
});

test("day inspection and daily table are wired, including counterfactual status after failure", () => {
  const dom = runOriginalUi();
  dom.getElementById("inspect-day").emit("input", { value: "90" });
  assert.match(dom.getElementById("day-detail").innerHTML, /After an unfunded payment: counterfactual/);
  assert.match(dom.getElementById("day-detail").innerHTML, /hosting-cycle-3/);
  assert.match(dom.getElementById("day-detail").innerHTML, /-\$2,625/);
  dom.getElementById("timeline-mode").emit("change", { value: "daily" });
  assert.match(dom.getElementById("timeline-table").innerHTML, /<th scope="row">D90/);
  assert.match(dom.getElementById("timeline-table").innerHTML, /Includes counterfactual events/);
});
