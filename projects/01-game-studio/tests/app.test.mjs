import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// This is a DOM contract fixture, not a browser rendering or accessibility test.
class Element {
  constructor(document, tag, attributes = "") {
    this.ownerDocument = document;
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.children = [];
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this._text = "";
    this._html = "";
    for (const match of attributes.matchAll(/([:\w-]+)(?:="([^"]*)"|'([^']*)')?/g)) {
      this.setAttribute(match[1], match[2] ?? match[3] ?? "");
    }
    this.classList = { toggle: (name, on) => {
      const classes = new Set((this.attributes.class ?? "").split(" ").filter(Boolean));
      if (on) classes.add(name); else classes.delete(name);
      this.attributes.class = [...classes].join(" ");
    }};
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") this.ownerDocument.ids.set(value, this);
    if (name === "value") this.value = value;
    if (name === "hidden") this.hidden = true;
    if (name === "disabled") this.disabled = true;
    if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  getAttribute(name) { return this.attributes[name]; }
  set value(value) { this._value = String(value); }
  get value() { return this._value; }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text; }
  set innerHTML(value) { this._html = value; this.ownerDocument.parse(value); }
  get innerHTML() { return this._html; }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  async emit(name, extras = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...extras };
    if (this.disabled && name === "click") return event;
    for (const callback of this.listeners.get(name) ?? []) await callback(event);
    return event;
  }
  click() { return this.emit("click"); }
  replaceChildren(...children) { this.children = children; }
  append(element) { this.children.push(element); }
  remove() { this.removed = true; }
  closest(selector) {
    return selector.split(",").some((item) => {
      const part = item.trim();
      if (part.startsWith("[")) {
        const match = part.match(/^\[([^=]+)=['"]([^'"]+)['"]\]$/);
        return match && this.attributes[match[1]] === match[2];
      }
      return part.toUpperCase() === this.tagName;
    }) ? this : null;
  }
}

class Document extends Element {
  constructor(html) {
    const holder = { ids: new Map() };
    super(holder, "document");
    this.ownerDocument = this;
    this.ids = holder.ids;
    this.elements = [];
    this.hidden = false;
    this.activeElement = null;
    this.parse(html);
    this.body = this.elements.find((element) => element.tagName === "BODY");
    for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const id = match[1].match(/id="([^"]+)"/)?.[1];
      const value = match[2].match(/<option value="([^"]+)"/)?.[1];
      if (id && value) this.getElementById(id).value = value;
    }
  }
  parse(html) {
    for (const match of html.matchAll(/<([a-z][a-z0-9:-]*)\b([^>]*)>/gi)) this.elements.push(new Element(this, match[1], match[2]));
  }
  getElementById(id) {
    const result = this.ids.get(id);
    if (!result) throw new Error(`Missing DOM element ${id}`);
    return result;
  }
  createElement(tag) { return new Element(this, tag); }
  querySelectorAll(selector) {
    const match = selector.match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    if (!match) throw new Error(`Unsupported fixture selector ${selector}`);
    return this.elements.filter((element) => Object.hasOwn(element.attributes, match[1]) &&
      (match[2] === undefined || element.attributes[match[1]] === match[2]));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const scripts = await Promise.all(["builds.js", "engine.js", "controller.js", "replay-data.js", "app.js"]
  .map(async (file) => [file, await readFile(new URL(`../${file}`, import.meta.url), "utf8")]));

function boot() {
  const document = new Document(html);
  const intervals = new Map();
  const timeouts = new Map();
  const events = [];
  let nextId = 1;
  const context = vm.createContext({
    document,
    console,
    Blob,
    URL: { createObjectURL: () => "blob:local-fixture", revokeObjectURL() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    addEventListener() {},
    dispatchEvent(event) { events.push(event); },
    setInterval(callback, delay) { const id = nextId++; intervals.set(id, { callback, delay }); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback, delay) { const id = nextId++; timeouts.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
  });
  context.window = context;
  for (const [name, code] of scripts) vm.runInContext(code, context, { filename: name });
  return { context, document, intervals, events, api: context.hiveGame, $: (id) => document.getElementById(id) };
}

test("actual app boots with local scripts, exposes the bounded contract, and paints map markers", () => {
  const { api, $, events } = boot();
  assert.equal(api.contract, "little-signals-api/1");
  assert.equal($("boot-notice").hidden, true);
  assert.equal(api.snapshot().version, "v4");
  assert.match($("map-robot-0").getAttribute("aria-label"), /Pip, energy 24/);
  assert.equal($("patch-east").getAttribute("role"), "button");
  assert.equal(events.at(-1).type, "hive-game-ready");
  assert.throws(() => api.act({ type: "tick", count: 26 }), /1–25/);
});

test("actual lesson buttons, robot selection, patch clicks, and step controls change engine state", async () => {
  const { api, $, document } = boot();
  await $("delivery-lesson").click();
  await $("safety-lesson").click();
  assert.equal(api.snapshot().robots[0].program.delivery, true);
  assert.equal(api.snapshot().robots[0].program.safety, true);
  await document.querySelector('[data-robot="1"]').click();
  await $("patch-north").click();
  assert.equal(api.snapshot().robots[1].program.focus, "north");
  await $("five").click();
  assert.equal(api.snapshot().tick, 5);
  assert.equal($("beat-count").textContent, "5 / 150 beats");
  assert.equal(api.trace().entries.at(-1).action.count, 5);
});

test("keyboard shortcuts are wired, but do not hijack focused form controls", async () => {
  const { api, $, document, intervals } = boot();
  await document.emit("keydown", { key: "3", target: document.body });
  await document.emit("keydown", { key: "d", target: document.body });
  assert.equal(api.snapshot().robots[2].program.delivery, true);
  await document.emit("keydown", { key: "c", target: document.body });
  assert.equal(api.snapshot().robots[2].program.safety, true);
  await document.emit("keydown", { key: "n", target: document.body });
  assert.equal(api.snapshot().tick, 1);
  const ignored = await document.emit("keydown", { key: " ", target: $("seed") });
  assert.equal(ignored.defaultPrevented, undefined);
  assert.equal(intervals.size, 0);
  await document.emit("keydown", { key: " ", target: document.body });
  assert.equal(intervals.size, 1);
  await document.emit("keydown", { key: "Escape", target: document.body });
  assert.equal(intervals.size, 0);
});

test("the actual autoplay loop has a five-minute beat budget and stops at sunset", async () => {
  const { api, $, intervals } = boot();
  await $("play").click();
  assert.equal([...intervals.values()][0].delay, 2000);
  for (let i = 0; i < 160 && intervals.size; i++) [...intervals.values()][0].callback();
  assert.equal(api.snapshot().tick, 150);
  assert.equal(api.snapshot().status, "lost");
  assert.equal(intervals.size, 0);
  assert.equal($("outcome").hidden, false);
  assert.equal($("play").disabled, true);
});

test("hidden-tab pause and explicit API actions prevent runaway timers", async () => {
  const { api, $, document, intervals } = boot();
  await $("play").click();
  document.hidden = true;
  await document.emit("visibilitychange");
  assert.equal(intervals.size, 0);
  document.hidden = false;
  await $("play").click();
  api.act({ type: "tick" });
  assert.equal(intervals.size, 0);
  assert.equal(api.snapshot().tick, 1);
});

test("bundled replay can be loaded, scrubbed, played to its verified win, and exited", async () => {
  const { api, $, intervals } = boot();
  await $("watch").click();
  assert.equal(api.view().mode, "replay");
  assert.equal(api.snapshot().tick, 0);
  assert.equal($("delivery-lesson").disabled, true);
  $("replay-position").value = 30;
  await $("replay-position").emit("input");
  assert.equal(api.view().cursor, 30);
  await $("play").click();
  assert.equal([...intervals.values()][0].delay, 250);
  for (let i = 0; i < 160 && intervals.size; i++) [...intervals.values()][0].callback();
  assert.equal(api.snapshot().status, "won");
  assert.equal(api.snapshot().tick, 96);
  assert.equal(api.score().points, 1386);
  await $("restart").click();
  assert.equal(api.view().mode, "live");
  assert.equal(api.snapshot().tick, 0);
});

test("malformed or oversized file imports are rejected without replacing live play", async () => {
  const { api, $ } = boot();
  api.act({ type: "tick", count: 4 });
  const before = JSON.stringify(api.snapshot());
  $("import-run").files = [{ size: 2_000_001, text: () => { throw new Error("Must not read oversized file."); } }];
  await $("import-run").emit("change");
  assert.match($("message").textContent, /too large/);
  assert.equal(JSON.stringify(api.snapshot()), before);
  $("import-run").files = [{ size: 12, text: async () => '{"bad":true}' }];
  await $("import-run").emit("change");
  assert.match($("message").textContent, /Import rejected/);
  assert.equal(JSON.stringify(api.snapshot()), before);
});

test("historical builds describe their actual unsafe rules, not the latest build's promises", () => {
  const { api, $ } = boot();
  api.reset({ version: "v1", scenario: "meadow" });
  assert.match($("safety-copy").textContent, /3 power/);
  assert.match($("auto-focus-label").textContent, /no reservations/);
  api.reset({ version: "v4" });
  assert.match($("safety-copy").textContent, /round trip/);
  assert.equal($("auto-focus-label").textContent, "Share patches fairly");
});
