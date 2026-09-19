import "../builds.js";
import "../engine.js";
import "../replay-data.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(project, "../..");
const engine = globalThis.LittleSignalsEngine;
const read = (file) => readFile(resolve(project, file), "utf8");
const json = async (file) => JSON.parse(await read(file));
const names = ["cycle-01-before", "cycle-01-after", "cycle-02-before", "cycle-02-after", "cycle-03-before", "cycle-03-after", "release-trained", "release-untaught"];

test("all eight persisted runs replay exactly, including unsuccessful cases", async () => {
  let losses = 0;
  for (const name of names) {
    const report = await json(`evidence/runs/${name}.json`);
    const final = engine.replay(report.trace);
    assert.deepEqual(final, report.trace.final);
    assert.deepEqual({ ...engine.score(final), automated: true }, report.score);
    assert.deepEqual(final.metrics, report.metrics);
    assert.equal(report.replayVerified, true);
    assert.match(report.engineSha256, /^[0-9a-f]{64}$/);
    assert.match(report.buildsSha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isFinite(Date.parse(report.recordedAt)));
    if (final.status === "lost") losses++;
  }
  assert.equal(losses, 5, "Do not remove unsuccessful observations.");
});

test("cycle summaries are derived from paired actual runs, not invented success claims", async () => {
  for (const [index, metric] of [[1, "strandedEvents"], [2, "wallBumps"], [3, "blockedMoves"]]) {
    const cycle = await json(`evidence/cycle-0${index}.json`);
    const before = JSON.parse(await readFile(resolve(root, cycle.before), "utf8"));
    const after = JSON.parse(await readFile(resolve(root, cycle.after), "utf8"));
    assert.equal(before.trace.options.version, `v${index}`);
    assert.equal(after.trace.options.version, `v${index + 1}`);
    assert.equal(before.trace.options.scenario, after.trace.options.scenario);
    assert.equal(before.trace.options.seed, after.trace.options.seed);
    assert.equal(before.policy, after.policy);
    assert.ok(Date.parse(after.recordedAt) > Date.parse(before.recordedAt));
    assert.deepEqual(cycle.measurement.delivered, [before.score.delivered, after.score.delivered]);
    assert.deepEqual(cycle.measurement[metric], [before.metrics[metric], after.metrics[metric]]);
    assert.ok(after.metrics[metric] < before.metrics[metric]);
    if (index === 2) assert.equal(after.score.status, "lost");
  }
});

test("bundled offline replays contain exactly the original six trace/score pairs", async () => {
  assert.equal(Object.keys(globalThis.LittleSignalsReplays).length, 6);
  for (const name of names.slice(0, 6)) {
    const report = await json(`evidence/runs/${name}.json`);
    assert.deepEqual(globalThis.LittleSignalsReplays[name], { score: report.score, trace: report.trace });
  }
});

test("manifest has the required scoped schema and portable runtime resources", async () => {
  const manifest = await json("manifest.json");
  assert.equal(manifest.id, "01-game-studio");
  assert.equal(manifest.stage, "work-produced");
  assert.equal(manifest.seedSlug, "independent-game-studio");
  assert.equal(manifest.entrypoint, "projects/01-game-studio/index.html");
  assert.ok(manifest.title && manifest.summary && manifest.limitations.length);
  assert.ok(manifest.checks.every((argv) => Array.isArray(argv) && argv.every((item) => typeof item === "string") && argv[0] === "node"));
  // These two outputs are written by report.mjs after these very checks execute.
  const generatedOutputs = new Set(["projects/01-game-studio/evidence/result.json", "projects/01-game-studio/evidence/validation.tap"]);
  for (const artifact of manifest.artifacts) {
    assert.ok(artifact.startsWith("projects/01-game-studio/") && !artifact.includes(".."));
    if (!generatedOutputs.has(artifact)) await access(resolve(root, artifact));
  }
  const html = await read("index.html");
  for (const match of html.matchAll(/<(?:script|img|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(?:[a-z]+:|\/\/)/i.test(match[1]), `Non-relative runtime resource: ${match[1]}`);
    await access(resolve(project, match[1]));
  }
  assert.match(html, /id="playground"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(await read("style.css"), /prefers-reduced-motion/);
});

test("runtime is local-only and the deterministic engine uses no wall clock or random source", async () => {
  for (const file of ["engine.js", "builds.js", "controller.js", "app.js", "replay-data.js", "index.html", "style.css"]) {
    assert.doesNotMatch(await read(file), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|https?:\/\/|cdn\./, file);
  }
  assert.doesNotMatch(await read("engine.js"), /Math\.random|\bDate\b|setTimeout|setInterval/);
  assert.doesNotMatch((await read("art/colony.svg")).replace('xmlns="http://www.w3.org/2000/svg"', ""), /https?:\/\/|<script|<foreignObject/);
});

test("scope references match the parent's verified seed bindings and file digests", async () => {
  const source = await json("evidence/source-review.json");
  const verified = JSON.parse(await readFile(resolve(root, source.source.verificationArtifact), "utf8"))
    .seeds.find((seed) => seed.slug === "independent-game-studio");
  assert.ok(verified);
  for (const field of ["seedRef", "cardRef", "archiveRef"]) assert.equal(source.source[field], verified[field]);
  for (const file of source.reviewedFiles) assert.equal(file.sha256, verified.verifiedFiles.find((entry) => entry.path === file.path)?.sha256, file.path);
  assert.equal(source.nativeOrganizationActivated, false);
  assert.equal(source.readyTaskMapping.length, 1);
  assert.equal(source.readyTaskMapping[0].seedTaskId, "lock-first-shift");
  assert.equal(source.blockedTaskMapping.length, 9);
  assert.match(await read("SOURCE-NOTICE.txt"), /Copyright \(c\) 2026 Hive Hub contributors/);
});

test("the recording CLI refuses to overwrite preserved observations", async () => {
  const before = await read("evidence/runs/cycle-01-before.json");
  const result = spawnSync(process.execPath, [
    "projects/01-game-studio/tools/play.mjs", "record", "v1", "meadow", "solo", "cycle-01-before.json",
  ], { cwd: root, encoding: "utf8", timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EEXIST/);
  assert.equal(await read("evidence/runs/cycle-01-before.json"), before);
});
