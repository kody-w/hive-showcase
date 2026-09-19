import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { PROJECT, readJSON, readText } from "../scripts/inputs.mjs";
import { computeOutputs } from "../scripts/build.mjs";

test("every frozen input/result and the file-protocol bundle reproduce byte-for-byte", () => {
  const { outputs } = computeOutputs();
  assert.equal(outputs.size, 8);
  for (const [name, expected] of outputs) {
    assert.equal(readText(name), expected, `${name} drifted from original model/source data`);
  }
});

test("copied data hashes bind to the exact existing seed verification report", () => {
  const report = JSON.parse(readFileSync("evidence/seed-verification.json", "utf8")).seeds.find(row => row.slug === "turnaround-firm");
  const attribution = readJSON("data/attribution.json");
  assert.equal(attribution.seedObjectRef, report.seedRef);
  assert.equal(`sha256:${attribution.archiveSha256}`, report.archiveRef);
  for (const file of attribution.copiedData) {
    assert.equal(file.sha256, report.verifiedFiles.find(row => row.path === file.source).sha256);
  }
  for (const file of attribution.reviewedAsDataOnly) {
    assert.equal(file.sha256, report.verifiedFiles.find(row => row.path === file.path).sha256);
  }
  assert.notEqual(attribution.extractedSeedJsonSha256, attribution.seedObjectRef.replace("sha256:", ""));
});

test("manifest is root-runnable, scoped and work-produced, with evidence created by the recorder", () => {
  const manifest = readJSON("manifest.json");
  assert.equal(manifest.id, "08-turnaround");
  assert.equal(manifest.seedSlug, "turnaround-firm");
  assert.equal(manifest.stage, "work-produced");
  assert.equal(manifest.entrypoint, `${PROJECT}/index.html`);
  assert.equal(manifest.checks.length, 3);
  for (const argv of manifest.checks) {
    assert.ok(Array.isArray(argv));
    assert.equal(argv[0], "node");
    assert.ok(argv.every(value => typeof value === "string"));
    assert.ok(argv.filter(value => value.endsWith(".mjs")).every(value => value.startsWith(`${PROJECT}/`)));
  }
  for (const path of manifest.artifacts) {
    assert.ok(path.startsWith(`${PROJECT}/`) && !path.includes("/../"));
    if (!path.startsWith(`${PROJECT}/evidence/`)) assert.equal(existsSync(path), true, path);
  }
});

test("scope maps both ready tasks and all blocked work without pretending acceptance", () => {
  const scope = readJSON("data/scope.json");
  assert.equal(scope.stage, "work-produced");
  assert.deepEqual(scope.readyTasks.map(row => row.id), ["reconcile-synthetic-cash", "map-backlog-impact"]);
  assert.ok(scope.readyTasks.every(row => row.sourceState === "ready" && !row.referenceAccepted));
  assert.equal(scope.blockedReferenceTasks.length, 9);
  assert.ok(scope.blockedReferenceTasks.every(row => row.sourceState === "blocked"));
  assert.equal(scope.teamScopes.length, 5);
  assert.equal(scope.reviewedInitialization.executed, false);
});

test("HTML uses shared local styles and relative resources only; controls have unique IDs", () => {
  const html = readText("index.html");
  assert.match(html, /href="\.\.\/\.\.\/assets\/shared.css"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<noscript>/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(reference.startsWith("./") || reference.startsWith("../../assets/") || reference.startsWith("#"), reference);
  }
  assert.ok(existsSync(`${PROJECT}/../../assets/shared.css`));
});

test("runtime is original local code, with no network APIs, storage, eval or copied executable files", () => {
  for (const name of ["model.mjs", "view-model.mjs", "app.mjs", "boot.js", "offline.js"]) {
    const source = readText(name);
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(/);
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|sendBeacon)\b/);
  }
  assert.doesNotMatch(readText("offline.js"), /^import |^export /m);
  assert.ok(readdirSync(`${PROJECT}/data/reference`).every(name => name === "LICENSE" || /\.(json|csv)$/.test(name)));
  assert.match(readText("data/reference/LICENSE"), /Copyright \(c\) 2026 Hive Hub contributors/);
});

test("frozen runs remain conditional and include no native initialization or external effects", () => {
  const frozen = readJSON("results/scenarios.json");
  assert.equal(frozen.scenarios.length, 5);
  for (const row of frozen.scenarios) {
    assert.equal(row.result.authority.nativeInitialized, false);
    assert.equal(row.result.authority.referenceWorkAccepted, false);
    assert.equal(row.result.authority.realRecoveryClaimed, false);
    assert.deepEqual(row.result.authority.externalEffects, []);
    assert.equal(row.result.summary.recoveryExistsWithinHorizon, false);
  }
});
