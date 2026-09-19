import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import { Script } from "node:vm";
import { generatedArtifacts } from "../tools/build.mjs";
import { getPreset } from "../presets.mjs";

const projectPath = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoPath = resolve(projectPath, "../..");
const readArtifact = path => readFileSync(join(projectPath, path), "utf8");
const readArtifactJson = path => JSON.parse(readArtifact(path));

test("direct-file bundle and standalone JSON presets exactly match original ES module sources", () => {
  for (const [path, expected] of generatedArtifacts()) assert.equal(readArtifact(path), expected, path);
  assert.doesNotThrow(() => new Script(readArtifact("app.bundle.js")));
  assert.deepEqual(readArtifactJson("fixtures/pocket-arcade.json"), getPreset("arcade"));
});

test("entrypoint uses local relative assets, classic direct-file script and labeled controls", () => {
  const html = readArtifact("index.html");
  const references = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(references, ["../../assets/shared.css", "./styles.css", "./app.bundle.js"]);
  for (const path of references) assert.equal(existsSync(resolve(projectPath, path)), true);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) assert.ok(ids.includes(id), id);
  assert.match(html, /id="export-analysis"[^>]*disabled/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /role="alert" tabindex="-1"/);
  assert.match(html, /not observed/i);
  assert.doesNotMatch(html, /<script[^>]*type="module"/);
});

test("browser code has no network, persistence, evaluated code or imported-markup sink", () => {
  const browserCode = readArtifact("app.bundle.js");
  assert.doesNotMatch(browserCode, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|sendBeacon|eval)\s*[(.]/);
  assert.doesNotMatch(browserCode, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|serviceWorker)\b/);
  assert.match(browserCode, /\.textContent\s*=/);
  assert.match(browserCode, /editorRevision/);
  assert.match(browserCode, /verifySchedule\(agenda, schedule\)/);
});

test("copied inert input bytes, attribution and bindings match the parent seed verification", () => {
  const provenance = readArtifactJson("provenance.json");
  const parent = JSON.parse(readFileSync(join(repoPath, "evidence/seed-verification.json"), "utf8"));
  const seed = parent.seeds.find(seed => seed.slug === provenance.seedSlug);
  assert.equal(provenance.source, parent.indexUrl);
  assert.equal(provenance.sourceIndexSha256, parent.indexSha256);
  assert.equal(provenance.nativeInitialized, false);
  assert.equal(provenance.downloadedCodeExecuted, false);
  assert.equal(provenance.downloadedCodeImported, false);
  assert.equal(provenance.downloadedCodeEmbedded, false);
  assert.deepEqual(provenance.copiedExecutableFiles, []);
  for (const [name, value] of Object.entries(provenance.bindings)) assert.equal(seed[name], value);
  for (const record of provenance.reviewedFiles) {
    const verified = seed.verifiedFiles.find(item => item.path === record.sourcePath);
    assert.equal(record.sha256, verified.sha256);
    assert.equal(record.bytes, verified.bytes);
    if (record.copiedTo) {
      const bytes = readFileSync(join(repoPath, record.copiedTo));
      assert.equal(bytes.length, record.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sha256);
      assert.match(record.copiedTo, /^projects\/05-planner\/data\/source\/(?:[^/]+\.json|LICENSE)$/);
    }
  }
  assert.match(readArtifact("data/source/LICENSE"), /Copyright \(c\) 2026 Hive Hub contributors/);
});

test("copied historical source data is retained, but optional-topic reference results are not relabeled as this contract", () => {
  const sample = readArtifactJson("data/source/sample-agenda.json");
  const preset = getPreset("library");
  assert.equal(sample.topics.reduce((sum, task) => sum + task.minutes, 0), 68);
  assert.equal(sample.topics.filter(task => task.required).reduce((sum, task) => sum + task.minutes, 0), 35);
  for (const topic of sample.topics) {
    const task = preset.tasks.find(task => task.id === topic.id);
    assert.equal(task.label, topic.label);
    assert.equal(task.duration, topic.minutes);
    assert.equal("required" in task, false);
  }
  const historical = readArtifactJson("data/source/acceptance-cases.json");
  assert.equal(historical.cases.find(item => item.id === "sample-fit").expected.scheduled_minutes, 53);
  assert.match(readArtifact("docs/task-mapping.md"), /historical data/);
  assert.match(readArtifact("docs/task-mapping.md"), /73 minutes cannot fit 60/);
});

test("manifest exposes reproducible argv checks, local artifacts, truthful stage and limitations", () => {
  const manifest = readArtifactJson("manifest.json");
  assert.equal(manifest.id, "05-planner");
  assert.equal(manifest.seedSlug, "product-launch-company");
  assert.equal(manifest.entrypoint, "projects/05-planner/index.html");
  assert.equal(manifest.stage, "work-produced");
  assert.ok(manifest.checks.length >= 3);
  for (const argv of manifest.checks) {
    assert.ok(Array.isArray(argv) && argv.every(arg => typeof arg === "string"));
    assert.equal(argv[0], "node");
    assert.doesNotMatch(argv.join(" "), /https?:|npm |rm |curl /);
  }
  for (const path of manifest.artifacts) {
    assert.match(path, /^projects\/05-planner\//);
    if (!path.includes("/evidence/")) assert.equal(existsSync(join(repoPath, path)), true, path);
  }
  assert.ok(manifest.limitations.some(text => text.includes("unproven")));
  assert.ok(manifest.limitations.some(text => text.includes("not observed")));
});

test("manual and launch gates never substitute static/unit tests for browser observations", () => {
  const manual = readArtifactJson("docs/manual-checks.json");
  assert.equal(manual.overallStatus, "not-observed");
  assert.equal(manual.environment, null);
  assert.ok(manual.checks.every(check => check.status === "not-observed"));
  assert.equal(manual.certificationClaimed, false);
  assert.equal(manual.publicationApproved, false);
  const draft = readArtifact("docs/launch-draft.md");
  assert.match(draft, /HOLD/);
  assert.match(draft, /No audience was contacted/);
  assert.match(readArtifact("docs/FAQ.md"), /no retention policy is activated/);
});
