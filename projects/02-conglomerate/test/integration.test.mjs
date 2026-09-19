import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../csv-checker.mjs";

const project = new URL("../", import.meta.url);
const repo = new URL("../../", project);
const text = path => readFileSync(new URL(path, project), "utf8");
const json = path => JSON.parse(text(path));
const digest = path => createHash("sha256").update(readFileSync(new URL(path, project))).digest("hex");

test("frozen source data and all reviewed references match the verified seed package", () => {
  const sources = json("sources.json");
  const verification = JSON.parse(readFileSync(new URL("evidence/seed-verification.json", repo), "utf8"));
  const seed = verification.seeds.find(s => s.slug === "one-person-conglomerate");
  assert.equal(sources.seedRef, seed.seedRef);
  assert.equal(sources.archiveRef, seed.archiveRef);
  for (const file of sources.frozenFiles) {
    assert.equal(digest(file.local), file.sha256, file.local);
    assert.equal(seed.verifiedFiles.find(f => f.path === file.source)?.sha256, file.sha256, file.source);
  }
  for (const reference of sources.reviewedReferences) {
    assert.equal(seed.verifiedFiles.find(f => f.path === reference.source)?.sha256, reference.sha256, reference.source);
  }
  assert.ok(sources.reviewedReferences.every(r => !r.source.includes("/reference/")));
});

test("normalized data preserves all five ventures, all ten claims and inherited source scores", () => {
  const input = json("data/inputs.json");
  const portfolio = parseCsv(text("data/portfolio.csv")).slice(1).map(r => r.cells);
  const evidence = parseCsv(text("data/evidence-register.csv")).slice(1).map(r => r.cells);
  const worksheet = parseCsv(text("data/allocation-worksheet.csv")).slice(1).map(r => r.cells);
  assert.equal(input.ventures.length, 5);
  assert.equal(evidence.length, 10);
  for (const venture of input.ventures) {
    const seed = portfolio.find(row => row[1] === venture.id);
    assert.equal(venture.name, seed[2]);
    assert.equal(venture.offerHypothesis, seed[3]);
    assert.equal(venture.owner, venture.id);
    assert.ok(venture.nonGoals && venture.plan.stop && venture.plan.pass);
    const experiment = worksheet.find(row => row[1] === venture.primaryExperiment);
    assert.deepEqual([venture.seedHours, venture.seedCostUsd, venture.learning, venture.reuse, venture.confidence], [
      Number(experiment[3]), experiment[4], Number(experiment[5]), Number(experiment[6]), Number(experiment[7])
    ]);
    for (const claim of venture.uncertainties) {
      const source = evidence.find(row => row[1] === claim.id);
      assert.deepEqual([venture.id, claim.claim, claim.evidence, claim.disconfirm], source.slice(2));
    }
  }
  assert.equal(input.ventures.flatMap(v => v.uncertainties).length, 10);
});

test("reference allocation reconciles to 19h/$90; all ten full scopes exceed the new timebox with overhead", () => {
  const rows = parseCsv(text("data/allocation-worksheet.csv")).slice(1).map(r => r.cells);
  const selected = rows.filter(row => row[8] === "1");
  assert.equal(rows.length, 10);
  assert.deepEqual(selected.map(row => row[1]), ["lf-schema", "fn-outline", "rp-sheet"]);
  assert.equal(selected.reduce((total, row) => total + Number(row[3]), 0), 19);
  assert.equal(selected.reduce((total, row) => total + Math.round(Number(row[4]) * 100), 0), 9000);
  assert.ok(rows.every(row => Number(row[3]) * 60 + 30 + 30 > 300));
  assert.equal(json("data/capacity.json").reserved_hours * 60, 480);
});

test("scope and manifest identify unreviewed local work rather than native task completion", () => {
  const scope = json("scope.json");
  const manifest = json("manifest.json");
  assert.equal(scope.readyTask.id, "portfolio-intake");
  assert.equal(scope.readyTask.sourceState, "ready");
  assert.equal(scope.readyTask.sourceAssignee, null);
  assert.deepEqual(scope.readyTask.sourceCompletedEvidence, []);
  assert.equal(scope.externalEffects.nativeInitialized, false);
  assert.equal(scope.externalEffects.marketObservations, 0);
  assert.equal(manifest.id, "02-conglomerate");
  assert.equal(manifest.stage, "work-produced");
  assert.equal(manifest.entrypoint, "projects/02-conglomerate/index.html");
  assert.ok(manifest.checks.every(command => Array.isArray(command) && command.every(arg => typeof arg === "string")));
  for (const artifact of manifest.artifacts) {
    assert.ok(artifact.startsWith("projects/02-conglomerate/"));
    if (!artifact.endsWith("/evidence/result.json")) assert.ok(existsSync(new URL(artifact, repo)), artifact);
  }
});

test("browser entrypoint has only local resources, explicit labels, no storage and no HTML injection sinks", () => {
  const html = text("index.html");
  const app = text("app.mjs");
  const css = text("styles.css");
  assert.match(html, /lang="en"/);
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /\.\.\/\.\.\/assets\/shared\.css/);
  assert.match(html, /role="status"/);
  for (const [, path] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(https?:|\/\/|data:)/.test(path), path);
    if (path.startsWith("./") && !path.endsWith("/evidence/result.json")) assert.ok(existsSync(new URL(path, project)), path);
  }
  assert.ok(!/\b(?:localStorage|sessionStorage|XMLHttpRequest|WebSocket|eval)\b|\.innerHTML|insertAdjacentHTML/.test(app));
  assert.ok(!/@import|https?:\/\//.test(css));
});

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.value = "";
    this.files = [];
    this._text = "";
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  get valueAsNumber() { return this.value === "" ? NaN : Number(this.value); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  prepend(child) { child.parent = this; this.children.unshift(child); }
  replaceChildren(...children) { this._text = ""; this.children = []; this.append(...children); }
  addEventListener(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]); }
  async fire(name) { for (const listener of this.listeners.get(name) ?? []) await listener({ target: this, preventDefault() {} }); }
  click() { return this.fire("click"); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
}

test("original browser module boots and handles objective, budget, CSV and file interactions in a local DOM harness", async () => {
  const ids = new Map([...text("index.html").matchAll(/id="([^"]+)"/g)].map(match => [match[1], new FakeElement()]));
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const fetched = [];
  globalThis.document = { getElementById: id => ids.get(id), createElement: tag => new FakeElement(tag), body: new FakeElement("body") };
  globalThis.fetch = async url => {
    assert.ok(fileURLToPath(url).startsWith(fileURLToPath(new URL("data/", project))));
    fetched.push(url.pathname.split("/").at(-1));
    const content = readFileSync(url, "utf8");
    return { ok: true, json: async () => JSON.parse(content), text: async () => content };
  };
  try {
    await import("../app.mjs");
    assert.deepEqual(fetched.sort(), ["allocation-worksheet.csv", "csv-intake.csv", "inputs.json"]);
    assert.equal(ids.get("app").hidden, false);
    assert.equal(ids.get("recommendation-name").textContent, "Ledgerleaf Tools");
    assert.equal(ids.get("budget-total").textContent, "240 / 300 min");
    assert.match(ids.get("csv-findings").textContent, /duplicate-key/);

    await ids.get("fastest").click();
    assert.equal(ids.get("recommendation-name").textContent, "Routepaper Planners");
    assert.equal(ids.get("budget-total").textContent, "240 / 300 min");
    assert.match(ids.get("allocation-status").textContent, /Differs from/);
    await ids.get("apply-recommendation").click();
    assert.equal(ids.get("budget-total").textContent, "130 / 300 min");
    ids.get("reserve").value = "500";
    await ids.get("reserve").fire("input");
    assert.equal(ids.get("recommendation-name").textContent, "No defensible selection");
    assert.equal(ids.get("apply-recommendation").disabled, true);
    assert.match(ids.get("allocation-status").textContent, /Over budget/);

    await ids.get("reset").click();
    assert.equal(ids.get("recommendation-name").textContent, "Ledgerleaf Tools");
    ids.get("scope-mode").value = "seed";
    await ids.get("scope-mode").fire("change");
    assert.equal(ids.get("recommendation-name").textContent, "No defensible selection");
    await ids.get("reset").click();
    ids.get("csv-text").value = "invoice-id,amount-usd\nfictional-1,12\n";
    await ids.get("csv-text").fire("input");
    assert.equal(ids.get("download-report").disabled, true);
    await ids.get("checker-form").fire("submit");
    assert.match(ids.get("csv-status").textContent, /no structural findings/);
    assert.equal(ids.get("download-report").disabled, false);

    let readOversized = false;
    ids.get("csv-file").files = [{ size: 1048577, arrayBuffer: async () => { readOversized = true; } }];
    await ids.get("csv-file").fire("change");
    assert.equal(readOversized, false);
    assert.match(ids.get("csv-status").textContent, /File refused/);
    ids.get("csv-file").files = [{ size: 2, arrayBuffer: async () => Uint8Array.of(0xc3, 0x28).buffer }];
    await ids.get("csv-file").fire("change");
    assert.match(ids.get("csv-findings").textContent, /invalid-utf8/);

    let finishRead;
    ids.get("csv-file").files = [{ size: 2, arrayBuffer: () => new Promise(resolve => { finishRead = resolve; }) }];
    const pending = ids.get("csv-file").fire("change");
    ids.get("csv-text").value = "invoice-id,amount-usd\nnewer,2\n";
    await ids.get("csv-text").fire("input");
    finishRead(Uint8Array.of(0xc3, 0x28).buffer);
    await pending;
    await ids.get("checker-form").fire("submit");
    assert.match(ids.get("csv-status").textContent, /no structural findings/);
    await ids.get("load-fixture").click();
    assert.match(ids.get("csv-findings").textContent, /duplicate-key/);
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});
