import "../builds.js";
import "../engine.js";
import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(project, "../..");
const engine = globalThis.LittleSignalsEngine;
const manifest = JSON.parse(await readFile(resolve(project, "manifest.json"), "utf8"));
const path = (file) => relative(root, resolve(project, file)).split(sep).join("/");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const logPath = path("evidence/validation.tap");
const checks = [];
let log = "";
let firstOutput = "";
for (const [index, argv] of manifest.checks.entries()) {
  const started = performance.now();
  const run = spawnSync(argv[0], argv.slice(1), { cwd: root, encoding: "utf8", timeout: 120000 });
  const output = (run.stdout ?? "") + (run.stderr ?? "") + (run.error ? `\n${run.error.message}\n` : "");
  if (index === 0) firstOutput = output;
  log += `# Command: ${argv.join(" ")}\n`;
  log += index === 0 ? output : output.split("\n").map((line) => `# ${line}`).join("\n") + "\n";
  checks.push({ argv, exitCode: run.status ?? 1, durationMs: Math.round(performance.now() - started), output: logPath });
}
await writeFile(resolve(project, "evidence/validation.tap"), log);

const names = ["cycle-01-before", "cycle-01-after", "cycle-02-before", "cycle-02-after", "cycle-03-before", "cycle-03-after", "release-trained", "release-untaught"];
const runs = [];
for (const name of names) {
  const bytes = await readFile(resolve(project, `evidence/runs/${name}.json`));
  const report = JSON.parse(bytes);
  const final = engine.replay(report.trace);
  assert.deepEqual({ ...engine.score(final), automated: true }, report.score);
  assert.deepEqual(final.metrics, report.metrics);
  runs.push({
    id: name,
    artifact: path(`evidence/runs/${name}.json`),
    sha256: sha256(bytes),
    recordedAt: report.recordedAt,
    policy: report.policy,
    score: report.score,
    metrics: report.metrics,
    actions: report.trace.entries.length,
    frames: report.trace.entries.reduce((sum, entry) => sum + entry.frames.length, 0),
    finalFingerprint: engine.fingerprint(final),
    replayVerified: true,
    recordingEngineSha256: report.engineSha256,
    recordingBuildsSha256: report.buildsSha256,
  });
}

const sweep = [];
for (const scenario of Object.keys(engine.scenarios)) {
  for (const seed of [0, 1, 7, 42, 99, 713, 4294967295]) {
    const game = engine.create({ version: "v4", scenario, seed });
    game.run([0, 1, 2].flatMap((robot) => [
      { type: "teach", robot, rule: "delivery", value: true },
      { type: "teach", robot, rule: "safety", value: true },
    ]));
    while (game.snapshot().status === "playing") game.act({ type: "tick" });
    const final = engine.replay(game.trace());
    sweep.push({ scenario, seed, status: final.status, tick: final.tick, delivered: final.delivered,
      strandedEvents: final.metrics.strandedEvents, deadlockTicks: final.metrics.deadlockTicks, replayVerified: true });
  }
}

async function inventory(directory = project) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(absolute));
    else if (entry.isFile() && absolute !== resolve(project, "evidence/result.json")) {
      const bytes = await readFile(absolute);
      files.push({ path: relative(root, absolute).split(sep).join("/"), bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
const cycles = await Promise.all(["01", "02", "03"].map(async (number) =>
  JSON.parse(await readFile(resolve(project, `evidence/cycle-${number}.json`), "utf8"))));
const metric = (name) => Number(firstOutput.match(new RegExp(`^# ${name} (\\d+)$`, "m"))?.[1] ?? 0);
const result = {
  schema: "local-hive-game-result/1",
  id: "01-game-studio",
  stage: "work-produced",
  generatedAt: new Date().toISOString(),
  title: manifest.title,
  entrypoint: manifest.entrypoint,
  verified: checks.every((check) => check.exitCode === 0),
  observationType: "Actual deterministic automated execution of original browser/Node game rules; DOM contract tests are not a browser or human playtest.",
  nativeOrganizationActivated: false,
  interface: {
    global: "window.hiveGame",
    contract: "little-signals-api/1",
    scoreSchema: "little-signals-score/1",
    replaySchema: "little-signals-replay/1",
    documentation: path("README.md"),
    limits: engine.limits,
    defaultOptions: { version: "v4", scenario: "switchback", seed: 42 },
    readyEvent: "hive-game-ready",
    scoreEvent: "hive-game-score",
    eventTarget: "child window; no external messaging",
  },
  sourceReview: path("evidence/source-review.json"),
  builds: globalThis.LittleSignalsBuilds,
  currentEngineSha256: sha256(await readFile(resolve(project, "engine.js"))),
  checks,
  tests: { total: metric("tests"), passed: metric("pass"), failed: metric("fail"), evidence: logPath },
  cycles,
  runs,
  seedSweep: {
    policy: "class",
    version: "v4",
    execution: "Actual additional deterministic engine executions in tools/report.mjs; each re-executed through replay validation.",
    cases: sweep,
    wins: sweep.filter((row) => row.status === "won").length,
    losses: sweep.filter((row) => row.status === "lost").length,
  },
  releaseScore: runs.find((run) => run.id === "release-trained").score,
  negativeControlScore: runs.find((run) => run.id === "release-untaught").score,
  unperformed: ["real browser rendering", "manual keyboard-only review", "screen-reader and mobile-device review", "human playtesting", "native Hive activation", "publication", "purchases", "external mutations", "physical or business activity"],
  limitations: manifest.limitations,
  artifactDigests: await inventory(),
};
await writeFile(resolve(project, "evidence/result.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({
  result: path("evidence/result.json"), verified: result.verified, tests: result.tests,
  recordingsVerified: runs.length, sweepWins: result.seedSweep.wins, sweepCases: sweep.length,
  releaseScore: result.releaseScore,
}, null, 2));
if (!result.verified) process.exitCode = 1;
