import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { read, readJson, projectRoot } from "../src/study.mjs";

const html = read("index.html").toString();
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

class Element {
  constructor(tag = "div") {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.attributes = {}; this.style = {}; this.value = ""; this._text = "";
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this._text = ""; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  dispatch(type) { for (const listener of this.listeners[type] ?? []) listener({ target: this }); }
  scrollIntoView() { this.scrolled = true; }
}

function offlineDOM() {
  const elements = new Map(ids.map((id) => [id, new Element()]));
  const context = createContext({
    document: {
      getElementById: (id) => {
        assert.ok(elements.has(id), `HTML element exists: ${id}`);
        return elements.get(id);
      },
      createElement: (tag) => new Element(tag)
    },
    TextEncoder,
    fetch: () => { throw new Error("Network use forbidden"); },
    XMLHttpRequest: class { constructor() { throw new Error("Network use forbidden"); } },
    print: () => { context.printCalls += 1; },
    printCalls: 0
  });
  for (const script of ["src/engine.js", "evidence/snapshot.js", "src/app.js"]) {
    runInContext(read(script).toString(), context, { filename: script, timeout: 5000 });
  }
  return { context, get: (id) => elements.get(id) };
}

test("offline HTML references local existing assets, valid anchors and accessible controls", () => {
  assert.equal(new Set(ids).size, ids.length, "Unique IDs");
  assert.match(html, /href="\.\.\/\.\.\/assets\/shared\.css"/);
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.doesNotMatch(url, /^(?:https?:|\/\/|\/|javascript:)/);
    if (url.startsWith("#")) assert.ok(ids.includes(url.slice(1)), `Anchor ${url}`);
    else assert.ok(existsSync(resolve(projectRoot, url)), `Local artifact ${url}`);
  }
  for (const control of ["case-select", "method-select", "failure-filter"]) assert.ok(html.includes(`for="${control}"`));
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
});

test("original browser scripts initialize from disk data without fetch, storage or a service", () => {
  const { get } = offlineDOM(), result = readJson("evidence/result.json");
  assert.equal(get("baseline-paired").textContent, String(result.baselinePaired));
  assert.equal(get("validations").textContent, "504");
  assert.equal(get("method-overview").children.length, 6);
  assert.equal(get("trial-grid").children.length, 20);
  assert.equal(get("scenario-picker").children.length, 4);
  assert.equal(get("bins-grid").children.length, 2);
  assert.equal(get("failure-list").children.length, 50);
  assert.match(get("unproven-info").textContent, /15 cases/);
});

test("all scenario and method controls render assignments and reproduce selected saved traces", () => {
  const { get } = offlineDOM();
  for (let scenarioIndex = 0; scenarioIndex < 4; scenarioIndex += 1) {
    get("scenario-picker").children[scenarioIndex].dispatch("click");
    assert.equal(get("scenario-picker").children[scenarioIndex].attributes["aria-pressed"], "true");
    for (const trial of [0, 20]) {
      get("case-select").value = String(trial); get("case-select").dispatch("change");
      for (const method of readJson("protocol.json").methods) {
        get("method-select").value = method.id; get("method-select").dispatch("change");
        get("replay-button").dispatch("click");
        assert.match(get("replay-status").textContent, /^MATCH/, `${scenarioIndex}/${trial}/${method.id}`);
        assert.ok(get("bins-grid").children.length > 0);
        assert.match(get("packing-summary").textContent, /items exactly once/);
        assert.ok(get("trace-output").textContent.includes(method.id));
      }
    }
  }
});

test("failure filters and known-counterexample navigation preserve unfavorable results", () => {
  const { get } = offlineDOM();
  get("inspect-known-failure").dispatch("click");
  assert.equal(get("scenario-name").textContent, "Mixed classroom");
  assert.equal(get("method-select").value, "dominant-first-fit");
  assert.equal(get("bins-grid").children.length, 7);
  assert.match(get("proof-pill").textContent, /UNKNOWN/);
  get("failure-filter").value = "candidate"; get("failure-filter").dispatch("change");
  assert.equal(get("failure-list").children.length, 6);
  const jump = get("failure-list").children[0].children[0].children[0];
  jump.dispatch("click");
  assert.equal(get("method-select").value, "dual-best-fit");
  assert.equal(get("workspace").scrolled, true);
});

test("local replay detects disagreement rather than silently overwriting saved evidence", () => {
  const { get, context } = offlineDOM();
  runInContext('INVENTION_SNAPSHOT.authored[0].methods["beam-128"].count += 1', context);
  get("replay-button").dispatch("click");
  assert.match(get("replay-status").textContent, /^REPLAY FAILED/);
  assert.match(get("replay-status").textContent, /Saved evidence was not changed/);
});

test("print action is wired and the printable view retains numeric loads and model warnings", () => {
  const { get, context } = offlineDOM();
  get("print-button").dispatch("click");
  assert.equal(context.printCalls, 1);
  const cards = get("bins-grid").textContent;
  assert.match(cards, /Volume 10 \/ 10/);
  assert.match(cards, /Weight 5 \/ 10/);
  assert.match(cards, /core-board-pack-/);
  assert.match(cards, /filler-card-pack-/);
  assert.match(html, /MODEL ONLY/);
  assert.match(read("style.css").toString(), /@media print/);
});
