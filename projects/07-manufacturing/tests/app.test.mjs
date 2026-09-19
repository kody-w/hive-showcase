import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

class Element {
  constructor(id = "") {
    this.id = id;
    this.attributes = {};
    this.dataset = {};
    this.events = {};
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      toggle: (name, state) => state ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name)
    };
  }
  set value(value) { this._value = String(value); }
  get value() { return this._value; }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
  dispatch(name) { for (const callback of this.events[name] || []) callback({ preventDefault() {} }); }
  append(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; this.innerHTML = ""; this.textContent = ""; }
  click() { if (!this.disabled) this.dispatch("click"); }
  remove() {}
}

function harness() {
  const html = source("index.html");
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element(id)]));
  const fields = ["width", "depth", "height", "wall", "floor", "clearance", "insertHeight", "rib", "bays", "layout"];
  elements.get("parameters").elements = { namedItem: (key) => {
    assert.ok(fields.includes(key));
    return elements.get(key);
  } };
  const presets = ["stackline", "compact", "pocket-arcade"].map((id) => {
    const e = new Element(); e.dataset.preset = id; return e;
  });
  const buttons = ["tray", "insert", "drawing", "bom", "parameters"].map((type) => {
    const e = new Element(); e.dataset.download = type; return e;
  });
  const body = new Element("body"), blobs = [], anchors = [];
  const document = {
    body, getElementById: (id) => {
      assert.ok(elements.has(id), `HTML element ${id} exists`);
      return elements.get(id);
    },
    querySelectorAll: (selector) => {
      if (selector === "[data-preset]") return presets;
      if (selector === "[data-download]") return buttons;
      throw new Error(`Unmodeled selector ${selector}`);
    },
    createElement: (tag) => {
      const e = new Element();
      if (tag === "a") anchors.push(e);
      return e;
    }
  };
  const context = vm.createContext({
    document, Blob, TextEncoder, Uint8Array, DataView,
    URL: { createObjectURL: (blob) => { blobs.push(blob); return "blob:local-test"; }, revokeObjectURL() {} },
    setTimeout: (callback) => callback()
  });
  for (const name of ["engine.js", "archive.js", "app.js"]) vm.runInContext(source(name), context, { filename: name });
  return {
    get: (id) => elements.get(id), presets, buttons, blobs, anchors,
    edit: (id, value) => { elements.get(id).value = value; elements.get("parameters").dispatch("input"); },
    context
  };
}

test("offline HTML uses local classic scripts, shared CSS, semantic labels and no runtime requests", () => {
  const html = source("index.html");
  assert.match(html, /href="\.\.\/\.\.\/assets\/shared.css"/);
  assert.match(html, /src="engine.js" defer/);
  assert.ok(!/<script[^>]+type="module"/.test(html));
  assert.ok(!/(?:src|href)="https?:\/\//.test(html));
  for (const name of ["engine.js", "archive.js", "app.js"]) {
    assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/.test(source(name)), name);
  }
  for (const key of ["width", "depth", "height", "wall", "floor", "rib", "clearance", "bays", "insertHeight", "layout"]) {
    assert.match(html, new RegExp(`for="${key}"`));
  }
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /<noscript>/);
});

test("actual app initializes a valid baseline and switches all three starting configurations", () => {
  const h = harness();
  assert.match(h.get("preview").innerHTML, /<svg/);
  assert.equal(h.get("metric-mass").textContent, "151.7 g");
  assert.equal(h.get("metric-time").textContent, "6.00 min");
  assert.equal(h.get("download-bundle").disabled, false);
  h.presets[1].click();
  assert.equal(h.get("width").value, "140");
  assert.equal(h.get("bays").value, "2");
  assert.equal(h.get("metric-mass").textContent, "103.7 g");
  h.presets[2].click();
  assert.equal(h.get("layout").value, "card-token");
  assert.equal(h.get("design-name").textContent, "Pocket Arcade");
  assert.match(h.get("fit-strip").innerHTML, /91.85/);
  assert.equal(h.presets[2].getAttribute("aria-pressed"), "true");
  assert.equal(h.presets[0].getAttribute("aria-pressed"), "false");
});

test("live edits update the geometry, metrics and explicit custom identity", () => {
  const h = harness();
  const before = h.get("preview").innerHTML;
  h.edit("width", "185.5");
  assert.notEqual(h.get("preview").innerHTML, before);
  assert.match(h.get("preview").innerHTML, /185.5/);
  assert.equal(h.get("design-name").textContent, "Stackline / custom");
  assert.notEqual(h.get("metric-mass").textContent, "151.7 g");
  assert.match(h.get("comparison-body").innerHTML, /151.67 g/);
});

test("blank, nonfinite, and invalid dimensions block downloads and clear stale previews", () => {
  const h = harness();
  for (const invalid of ["", "not-a-number", "Infinity", "-1", "99999"]) {
    h.edit("width", invalid);
    assert.equal(h.get("download-bundle").disabled, true);
    assert.ok(h.buttons.every((b) => b.disabled));
    assert.ok(!h.get("preview").innerHTML.includes("<svg"));
    assert.equal(h.get("metric-mass").textContent, "—");
    assert.equal(h.get("width").getAttribute("aria-invalid"), "true");
    assert.equal(h.get("validation-errors").hidden, false);
    h.get("download-bundle").click();
    assert.equal(h.blobs.length, 0);
  }
  h.edit("width", 180);
  assert.equal(h.get("download-bundle").disabled, false);
  h.edit("insertHeight", 40);
  assert.equal(h.get("insertHeight").getAttribute("aria-invalid"), "true");
  assert.equal(h.get("download-bundle").disabled, true);
});

test("reset restores the selected preset; view toggle changes assembled/exploded geometry", () => {
  const h = harness();
  h.presets[1].click();
  h.edit("width", 185);
  h.get("reset").click();
  assert.equal(h.get("width").value, "140");
  assert.equal(h.get("design-name").textContent, "Compact");
  const before = h.get("preview").innerHTML;
  h.get("exploded").click();
  assert.notEqual(h.get("preview").innerHTML, before);
  assert.equal(h.get("exploded").getAttribute("aria-pressed"), "true");
  h.get("assembled").click();
  assert.equal(h.get("preview").innerHTML, before);
});

test("valid but packing-held and payload-held models preserve visible HOLD findings", () => {
  const h = harness();
  h.edit("width", 196);
  assert.equal(h.get("download-bundle").disabled, false);
  assert.match(h.get("live-status").textContent, /packing envelope or mass HOLD/);
  assert.match(h.get("fit-strip").innerHTML, /200 × 104 × 36/);
  assert.match(h.get("download-status").textContent, /HOLD findings/);
  h.presets[2].click();
  h.edit("width", 140);
  assert.match(h.get("live-status").textContent, /assumed card\/token fit HOLD/);
});

test("download controls create real current-parameter STL, SVG, BOM, JSON and ZIP bytes", async () => {
  const h = harness();
  h.edit("width", 182);
  for (const button of h.buttons) button.click();
  assert.equal(h.blobs.length, 5);
  assert.match(await h.blobs[0].text(), /^solid stackline_tray_nominal_mm/);
  assert.match(await h.blobs[0].text(), /vertex 182 /);
  assert.match(await h.blobs[1].text(), /^solid stackline_insert_nominal_mm/);
  assert.match(await h.blobs[2].text(), /182 mm/);
  assert.match(await h.blobs[3].text(), /tray,1,182,100,32/);
  assert.equal(JSON.parse(await h.blobs[4].text()).parameters.width, 182);
  h.get("download-bundle").click();
  assert.equal(h.blobs[5].type, "application/zip");
  const zip = new Uint8Array(await h.blobs[5].arrayBuffer());
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.match(new TextDecoder().decode(zip), /NOT APPROVED FOR FABRICATION/);
  assert.ok(h.anchors.every((a) => a.download.startsWith("stackline-182x100x32-")));
});
