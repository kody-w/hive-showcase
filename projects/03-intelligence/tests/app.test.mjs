import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const project = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, project), "utf8");
const data = JSON.parse(read("research/evidence.json"));
const protocol = JSON.parse(read("research/protocol.json"));

// A focused DOM/event fixture exercises the real controller, not browser layout.
class Element {
  constructor(tag, attrs, document, parent = null) {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.dataset = {};
    this.ownerDocument = document;
    this.parent = parent;
    this.listeners = {};
    this.children = [];
    this.value = "";
    this.textContent = "";
    this.hidden = Object.hasOwn(attrs, "hidden");
    this.checked = Object.hasOwn(attrs, "checked");
    this.tabIndex = Number(attrs.tabindex || 0);
    for (const [key, value] of Object.entries(attrs)) this.setAttribute(key, value);
    this.ownerDocument.register(this);
  }
  get id() { return this.attrs.id; }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key.startsWith("data-")) {
      this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    }
  }
  getAttribute(key) { return this.attrs[key] ?? null; }
  set innerHTML(value) {
    this.html = value;
    this.ownerDocument.removeDescendants(this);
    this.ownerDocument.parse(value, this);
  }
  get innerHTML() { return this.html || ""; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  emit(type, extra = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const listener of this.listeners[type] || []) listener(event);
    this.ownerDocument.emit(type, event);
    return event;
  }
  closest(selector) {
    const selectors = selector.split(",").map((part) => part.trim());
    if (selectors.some((item) => item.startsWith("[") && Object.hasOwn(this.attrs, item.slice(1, -1)))) return this;
    return this.parent?.closest(selector) || null;
  }
  focus(options) { this.ownerDocument.activeElement = this; this.focusOptions = options; }
  scrollIntoView() { this.scrolled = true; }
  replaceChildren() { this.children = []; }
  appendChild(child) { this.children.push(child); child.parent = this; }
  getBoundingClientRect() {
    if (this.id === "map-shell") return { left: 0, top: 0, width: 750, height: 1300, right: 750 };
    const source = data.sources.findIndex((item) => "node-" + item.id === this.id);
    const claim = data.claims.findIndex((item) => "node-" + item.id === this.id);
    const left = source >= 0 ? 20 : 350;
    const top = 50 + Math.max(source, claim, 0) * 90;
    return { left, top, right: left + 250, width: 250, height: 75 };
  }
}

class Document {
  constructor(html) {
    this.nodes = [];
    this.listeners = {};
    this.activeElement = null;
    this.parse(html);
  }
  register(node) { this.nodes.push(node); }
  parse(html, parent = null) {
    for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*?)>/gi)) {
      const attrs = {};
      for (const attribute of match[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        attrs[attribute[1]] = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
      }
      new Element(match[1], attrs, this, parent);
    }
  }
  removeDescendants(parent) {
    this.nodes = this.nodes.filter((node) => {
      for (let item = node.parent; item; item = item.parent) if (item === parent) return false;
      return true;
    });
  }
  getElementById(id) { return this.nodes.findLast((node) => node.id === id) || null; }
  querySelectorAll(selector) {
    const key = selector.slice(1, -1);
    return this.nodes.filter((node) => Object.hasOwn(node.attrs, key));
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  emit(type, event) { for (const listener of this.listeners[type] || []) listener(event); }
  createElementNS(_namespace, tag) { return new Element(tag, {}, this); }
}

function fixture(hash = "", includeData = true) {
  const document = new Document(read("index.html"));
  const listeners = {};
  const frames = new Map();
  let nextFrame = 1;
  const sandbox = {
    document, URL, URLSearchParams, Intl, innerWidth: 1280,
    location: { hash },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    requestAnimationFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    fetch() { throw new Error("The offline app attempted network access"); },
    localStorage: new Proxy({}, { get() { throw new Error("Unexpected persistent storage access"); } }),
  };
  sandbox.history = { replaceState(_state, _title, value) { sandbox.location.hash = value; } };
  vm.createContext(sandbox);
  for (const file of [...(includeData ? ["data.js"] : []), "model.js", "render.js", "app.js"]) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  return {
    sandbox, document,
    get: (id) => document.getElementById(id),
    event(type) { for (const listener of listeners[type] || []) listener({}); },
    flush() { for (const callback of [...frames.values()]) callback(); frames.clear(); },
  };
}

test("controller starts from local data and renders the actual selected claim", () => {
  const app = fixture();
  assert.equal(app.get("source-count").textContent, "9");
  assert.equal(app.get("case-count").textContent, "0");
  assert.match(app.get("claim-nodes").innerHTML, /c-field/);
  assert.match(app.get("inspector-content").innerHTML, /26\.08%/);
  assert.equal(app.get("panel-map").hidden, false);
  assert.equal(app.get("panel-gates").hidden, true);
});

test("delegated direction, search, method and reset controls really change the rendered list", () => {
  const app = fixture();
  const support = app.document.querySelectorAll("[data-stance]").find((node) => node.dataset.stance === "support");
  support.emit("click");
  assert.equal(support.getAttribute("aria-pressed"), "true");
  assert.ok(!app.get("claim-nodes").innerHTML.includes('data-claim="c-slowdown"'));
  app.get("kind").value = "commercial";
  app.get("kind").emit("change");
  app.get("query").value = "87,000";
  app.get("query").emit("input");
  assert.match(app.get("filter-status").textContent, /^1 claims/);
  assert.match(app.get("claim-nodes").innerHTML, /c-game/);
  app.get("query").value = "no-match-case-71888";
  app.get("query").emit("input");
  assert.equal(app.get("empty-state").hidden, false);
  assert.match(app.get("inspector-content").innerHTML, /No claim selected/);
  app.get("reset-filters").emit("click");
  assert.match(app.get("filter-status").textContent, /^12 claims/);
  assert.equal(app.get("query").value, "");
});

test("source selection drills into provenance, preserves node focus and updates the bookmark", () => {
  const app = fixture();
  app.get("node-s-metr-2026").focus();
  app.get("node-s-metr-2026").emit("click");
  assert.match(app.get("inspector-content").innerHTML, /data-inspected-source="s-metr-2026"/);
  assert.match(app.get("inspector-content").innerHTML, /partly overlapping participants/);
  assert.equal(app.document.activeElement.id, "node-s-metr-2026");
  assert.equal(app.sandbox.location.hash, "#source=s-metr-2026");
});

test("clicking a nested element uses delegated closest selection", () => {
  const app = fixture();
  const button = app.get("node-c-staff");
  const child = new Element("span", {}, app.document, button);
  child.emit("click");
  assert.match(app.get("inspector-content").innerHTML, /data-inspected-claim="c-staff"/);
  assert.match(app.get("inspector-content").innerHTML, /eight employees/);
});

test("all tabs support click, arrows, Home/End and roving tab stops", () => {
  const app = fixture();
  app.get("tab-map").emit("keydown", { key: "ArrowRight" });
  assert.equal(app.get("panel-gates").hidden, false);
  assert.equal(app.get("tab-gates").tabIndex, 0);
  assert.equal(app.get("tab-map").tabIndex, -1);
  assert.equal(app.document.activeElement.id, "tab-gates");
  app.get("tab-gates").emit("keydown", { key: "End" });
  assert.equal(app.get("panel-method").hidden, false);
  app.get("tab-method").emit("keydown", { key: "Home" });
  assert.equal(app.get("panel-map").hidden, false);
  app.get("tab-method").emit("click");
  assert.equal(app.sandbox.location.hash, "#tab=method");
});

test("the hero decision link reveals and scrolls to the gate view", () => {
  const app = fixture();
  app.document.querySelectorAll("[data-tab-link]")[0].emit("click");
  assert.equal(app.get("panel-gates").hidden, false);
  assert.equal(app.get("workspace").scrolled, true);
  assert.equal(app.document.activeElement.id, "tab-gates");
});

test("all hypothetical gates can be checked and reset without changing the actual verdict", () => {
  const app = fixture();
  const before = JSON.stringify(app.sandbox.INTELLIGENCE_DATA.research);
  for (const gate of protocol.gates) {
    const input = app.get("scenario-" + gate.id);
    input.checked = true;
    input.emit("change");
  }
  assert.match(app.get("scenario-result").textContent, /NOT happened/);
  assert.equal(app.get("case-count").textContent, "0");
  assert.equal(JSON.stringify(app.sandbox.INTELLIGENCE_DATA.research), before);
  app.get("reset-scenario").emit("click");
  assert.match(app.get("scenario-result").textContent, /^0 of 7/);
  assert.ok(app.document.querySelectorAll("[data-gate-toggle]").every((input) => !input.checked));
});

test("hash navigation restores source/claim views without stale hidden selections", () => {
  const app = fixture("#source=s-wix");
  assert.match(app.get("inspector-content").innerHTML, /data-inspected-source="s-wix"/);
  app.sandbox.location.hash = "#claim=c-slowdown";
  app.event("hashchange");
  assert.match(app.get("inspector-content").innerHTML, /data-inspected-claim="c-slowdown"/);
  app.sandbox.location.hash = "#tab=gates";
  app.event("hashchange");
  assert.equal(app.get("panel-gates").hidden, false);
});

test("SVG citation edges use actual node coordinates and reduce to text on narrow screens", () => {
  const app = fixture();
  app.flush();
  const edges = data.claims.reduce((sum, claim) => sum + claim.citations.length, 0);
  assert.equal(app.get("connections").children.length, edges);
  assert.ok(app.get("connections").children.every((path) => !path.getAttribute("d").includes("NaN")));
  assert.ok(app.get("connections").children.some((path) => path.getAttribute("class").includes("selected")));
  app.sandbox.innerWidth = 600;
  app.event("resize");
  app.flush();
  assert.equal(app.get("connections").children.length, 0);
  assert.match(app.get("claim-nodes").innerHTML, /Citations:/);
});

test("mobile selection brings the inspection desk into view", () => {
  const app = fixture();
  app.sandbox.innerWidth = 600;
  app.get("node-s-wix").emit("click");
  assert.equal(app.get("inspector-content").scrolled, true);
});

test("missing local bundle gets a useful error instead of a false loaded state", () => {
  const app = fixture("", false);
  assert.equal(app.get("app-error").hidden, false);
  assert.match(app.get("app-error").textContent, /local application file is missing/);
});
