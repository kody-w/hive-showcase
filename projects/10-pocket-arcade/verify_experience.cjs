#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const { createHash, webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");
const model = require("./model.js");

const { values } = parseArgs({
  options: { root: { type: "string" }, output: { type: "string" } },
  allowPositionals: false, strict: true
});
assert(values.root, "Use --root <repository>.");
const root = fs.realpathSync(values.root);
const own = "projects/10-pocket-arcade";
const observed = new Map();
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function read(name) {
  assert(model.safePath(name) || ["assets/shared.css", "index.html"].includes(name), "Out-of-scope experience input.");
  let file = root;
  for (const part of name.split("/")) {
    file = path.join(file, part);
    assert(!fs.lstatSync(file).isSymbolicLink(), "Symlinked experience input.");
  }
  assert(fs.statSync(file).isFile() && fs.statSync(file).size <= 16 * 1024 * 1024);
  const bytes = fs.readFileSync(file);
  const lock = { path: name, sha256: digest(bytes), bytes: bytes.length };
  if (observed.has(name)) assert.deepEqual(lock, observed.get(name), "Input changed during experience verification.");
  observed.set(name, lock);
  return bytes;
}

const html = read(own + "/index.html").toString("utf8");
const data = model.inspectConnectedData(JSON.parse(read(own + "/artifacts/connected-data.json")));
const saved = model.inspectReport(JSON.parse(read(own + "/evidence/integration-validation.json")));
assert.equal(saved.integrationPassed, true, "The real integration report must pass before this combined check.");
assert.equal(data.pending.length, 0);
for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  const ref = match[1];
  if (ref.startsWith("#")) continue;
  assert(!/^(?:[a-z]+:|\/\/)/i.test(ref), "A runtime resource or artifact link is not local.");
  const name = path.posix.normalize(own + "/" + ref.split("#")[0]);
  if (name === own + "/evidence/result.json") {
    const summary = path.join(root, name);
    assert(fs.statSync(summary).isFile() && !fs.lstatSync(summary).isSymbolicLink());
  } else {
    read(name);
  }
}

// An original non-rendering DOM double executes the real hub scripts and reads real files.
// It is not a browser, screenshot, user study, server or browser-download verification.
async function launch(options = {}) {
  const elements = new Map();
  const timers = new Map();
  const blobs = new Map();
  const downloads = [];
  let timerId = 0, requestCount = 0, blobId = 0;
  class Element {
    constructor(id = "", tag = "DIV") {
      this.id = id;
      this.tagName = tag;
      this.dataset = {};
      this.textContent = "";
      this.disabled = false;
      this.files = [];
      this.attributes = new Map();
      this.listeners = new Map();
      this.children = [];
      this.values = new Map();
      this.classList = { toggle: (name, state) => this.attributes.set("class:" + name, state) };
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    append(child) { this.children.push(child); }
    remove() { this.removed = true; }
    querySelector(selector) {
      assert.equal(selector, "button");
      return this.button;
    }
    async emit(type, extra = {}) {
      const event = { target: this, currentTarget: this, preventDefault() {}, ...extra };
      await Promise.all((this.listeners.get(type) || []).map(listener => listener(event)));
    }
    click() {
      if (this.tagName === "A" && this.download) downloads.push({
        filename: this.download, blob: blobs.get(this.href)
      });
      return this.emit("click");
    }
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, new Element(id));
  const strip = new Element();
  const buttons = model.projects.map(project => {
    const button = new Element("", "BUTTON");
    button.dataset.select = project.id;
    return button;
  });
  const stations = model.projects.map((project, index) => {
    const station = new Element();
    station.dataset.station = project.id;
    station.button = buttons[index];
    return station;
  });
  const document = {
    body: new Element("body", "BODY"),
    getElementById(id) { assert(elements.has(id), "Missing actual HTML control: " + id); return elements.get(id); },
    querySelector(selector) { assert.equal(selector, ".status-strip"); return strip; },
    querySelectorAll(selector) {
      if (selector === "[data-select]") return buttons;
      assert.equal(selector, "[data-station]");
      return stations;
    },
    createElement(tag) { assert.equal(tag, "a"); return new Element("", "A"); }
  };
  const location = new URL(options.fileMode
    ? pathToFileURL(path.join(root, own, "index.html")).href
    : "http://pocket-arcade.invalid/hive-showcase/" + own + "/index.html");
  class LocalURL extends URL {}
  LocalURL.createObjectURL = blob => {
    const url = "blob:local-harness/" + (++blobId);
    blobs.set(url, blob);
    return url;
  };
  LocalURL.revokeObjectURL = url => blobs.delete(url);
  const context = vm.createContext({
    document, location, URL: LocalURL, Blob, TextDecoder, TextEncoder, AbortController,
    crypto: webcrypto, console,
    FormData: class { constructor(form) { this.values = form.values; } get(name) { return this.values.get(name); } },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, request) {
      assert(!options.fileMode, "Direct-file mode must not fetch neighboring files.");
      const parsed = new URL(url);
      assert.equal(parsed.origin, location.origin, "No network or foreign-origin fetch is permitted.");
      assert.equal(request.credentials, "omit");
      assert.equal(request.redirect, "error");
      requestCount++;
      assert(parsed.pathname.startsWith("/hive-showcase/"), "A URL escaped the repository-hosted Pages prefix.");
      const name = parsed.pathname.slice("/hive-showcase/".length);
      if (name === options.missing) return { ok: false, status: 404 };
      let bytes = read(name);
      if (name === options.tampered) bytes = Buffer.concat([bytes, Buffer.from("\nIN-MEMORY TEST FAULT ONLY\n")]);
      return {
        ok: true, status: 200,
        async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
      };
    }
  });
  context.window = context;
  Object.defineProperty(context, "localStorage", { get() { throw new Error("Unexpected automatic persistence."); } });
  Object.defineProperty(context, "sessionStorage", { get() { throw new Error("Unexpected automatic persistence."); } });
  for (const name of ["connected-data.js", "model.js", "app.js"]) {
    vm.runInContext(read(own + "/" + name).toString("utf8"), context, {
      filename: own + "/" + name, timeout: 5000
    });
  }
  for (let turn = 0; turn < 30 && elements.get("refresh-button").disabled; turn++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(elements.get("refresh-button").disabled, false, "Initial local loads did not settle.");
  return { elements, buttons, downloads, timers, requests: () => requestCount };
}

async function main() {
  const checks = [];
  const normal = await launch();
  for (const project of model.projects) assert.equal(normal.elements.get("availability-" + project.id).dataset.state, "present");
  assert.equal(normal.elements.get("integration-title").textContent, "Recorded pass · not reverified");
  await normal.elements.get("verify-button").click();
  assert.equal(normal.elements.get("integration-title").textContent, "Local snapshot verified");
  checks.push({ id: "actual-four-component-byte-verification", status: "passed", inputHashesChecked: saved.inputFiles.length });
  for (const button of normal.buttons) {
    await button.click();
    assert.equal(normal.elements.get("station-link").href, "../" + button.dataset.select + "/index.html");
    assert.equal(button.attributes.get("aria-pressed"), "true");
    assert(normal.elements.get("station-detail").textContent.length > 30);
  }
  assert.match(normal.elements.get("recorded-planner-value").textContent, /85 > 75/);
  assert.match(normal.elements.get("recorded-planner-detail").textContent, /not owner-approved/);
  assert.match(normal.elements.get("recorded-maintenance-value").textContent, /4 records → 3 events/);
  checks.push({ id: "four-original-station-links-and-real-data", status: "passed", plannerRefusalRetained: true });
  const form = normal.elements.get("session-sheet");
  for (let index = 1; index <= 8; index++) form.values.set("alias" + index, "Harness alias " + index);
  form.values.set("notes", "SYNTHETIC harness input only; not a real session.");
  await form.emit("submit");
  assert.equal(normal.downloads.length, 1);
  assert.equal(normal.downloads[0].filename, "pocket-arcade-session-notes.json");
  const notes = JSON.parse(await normal.downloads[0].blob.text());
  assert.equal(notes.integrationAcceptance, false);
  assert.equal(notes.nativeAuthority, false);
  assert.equal(notes.aliases.length, 8);
  checks.push({ id: "notes-data-never-becomes-acceptance", status: "passed", scope: "Blob payload/DOM contract, not a real browser save" });
  const direct = await launch({ fileMode: true });
  assert.equal(direct.requests(), 0);
  assert.equal(direct.elements.get("integration-title").textContent, "Four contributions recorded · not reverified");
  assert.match(direct.elements.get("recorded-planner-value").textContent, /85 > 75/);
  checks.push({ id: "direct-file-flow-without-neighbor-fetch", status: "passed", actualFileProtocolBrowserTest: false });
  const missing = await launch({ missing: "projects/05-planner/manifest.json" });
  assert.equal(missing.elements.get("availability-05-planner").dataset.state, "missing");
  await missing.elements.get("verify-button").click();
  assert.equal(missing.elements.get("integration-title").textContent, "Snapshot changed · recheck required");
  checks.push({ id: "missing-component-fault-refused", status: "passed", injectedOnlyInMemory: true });
  const changed = await launch({ tampered: "projects/01-game-studio/engine.js" });
  await changed.elements.get("verify-button").click();
  assert.equal(changed.elements.get("integration-title").textContent, "Snapshot changed · recheck required");
  checks.push({ id: "changed-byte-fault-refused", status: "passed", injectedOnlyInMemory: true });
  const picker = normal.elements.get("report-file");
  const fixtureText = JSON.stringify({ schema: "pocket-arcade-validation/1", mode: "test-fixtures", fixtureOnly: true });
  picker.files = [{ size: Buffer.byteLength(fixtureText), async text() { return fixtureText; } }];
  await picker.emit("change");
  assert.match(normal.elements.get("verification-status").textContent, /Fixture-only/);
  assert.notEqual(normal.elements.get("integration-title").textContent, "Local snapshot verified");
  checks.push({ id: "fixture-report-never-establishes-real-integration", status: "passed", syntheticReportOnly: true });
  const result = {
    schema: "pocket-arcade-experience-verification/1",
    status: "local-technical-checks-passed",
    execution: "Actual hub scripts and actual approved file bytes, exercised in an original non-rendering DOM double with filesystem-backed in-memory transport.",
    realBrowserUsed: false, servicesStarted: false, componentFilesModified: false,
    nativeOrOwnerApproval: false, humanFunVerified: false, marketValidated: false,
    physicalFabricationApproved: false,
    showcasePublicationAuthorized: true, deploymentPerformedByThisCheck: false,
    repositoryBasePathChecked: "/hive-showcase/",
    checks,
    sourceFiles: [...observed.values()].sort((left, right) => left.path.localeCompare(right.path)),
    limits: [
      "No browser rendering, screenshot, assistive-technology, real browser saving, timing or human interaction was verified.",
      "The HTTP-shaped transport is in memory and makes no network requests; no server is started.",
      "Missing-file and changed-byte cases are deliberate in-memory negative controls, not actual component regressions.",
      "The final summary link is existence-checked, not self-hashed: that summary subsequently hashes this verification report.",
      "The baseline tournament remains infeasible; the alternative needs operational/native approval. Static showcase publication is separately authorized.",
      "Historical maintenance behavior is preserved in a public projection; removed private invocation identity is not independently reverified."
    ]
  };
  const encoded = JSON.stringify(result, null, 2) + "\n";
  if (values.output) {
    assert(model.safePath(values.output) && values.output.startsWith(own + "/evidence/") && values.output.endsWith(".json"));
    assert(!observed.has(values.output), "Output must not overwrite an input.");
    const folder = path.join(root, own, "evidence");
    assert(fs.statSync(folder).isDirectory() && !fs.lstatSync(folder).isSymbolicLink());
    const target = path.join(root, values.output);
    if (fs.existsSync(target)) assert(!fs.lstatSync(target).isSymbolicLink());
    fs.writeFileSync(target, encoded);
  }
  process.stdout.write(encoded);
}

main().catch(error => {
  const message = String(error.message).split(root + path.sep).join("").split(root).join(".");
  console.error("Combined experience verification failed:", message);
  process.exitCode = 1;
});
