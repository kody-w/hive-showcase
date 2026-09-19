import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeAgenda, verifySchedule } from "../engine.mjs";
import { getPreset, PRESET_INFO } from "../presets.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "../..");
if (resolve(process.cwd()) !== repoRoot) throw new Error("Run this evidence recorder from the repository root.");
const project = "projects/05-planner";
const evidence = `${project}/evidence`;
mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(readFileSync(`${project}/manifest.json`, "utf8"));
const checks = [];
for (const [index, argv] of manifest.checks.entries()) {
  const start = performance.now();
  const outcome = spawnSync(argv[0], argv.slice(1), {
    cwd: repoRoot, encoding: "utf8", timeout: 120000, maxBuffer: 10 * 1024 * 1024,
  });
  const logFile = `${evidence}/check-${String(index + 1).padStart(2, "0")}.${index === 0 ? "tap" : "txt"}`;
  const log = (outcome.stdout ?? "") + (outcome.stderr ? `\n--- stderr ---\n${outcome.stderr}` : "")
    + (outcome.error ? `\n--- execution error ---\n${outcome.error.message}\n` : "");
  writeFileSync(logFile, log);
  checks.push({
    argv, exitCode: outcome.status, signal: outcome.signal, status: outcome.status === 0 ? "passed" : "failed",
    durationMs: Math.round((performance.now() - start) * 100) / 100, log: logFile,
    ...(outcome.error ? { error: outcome.error.message } : {}),
  });
  console.log(`${checks.at(-1).status}: ${argv.join(" ")} (exit ${outcome.status})`);
}

const fixtureData = JSON.parse(readFileSync(`${project}/fixtures/adversarial.json`, "utf8"));
const fixtureResults = fixtureData.cases.map(fixture => {
  const analysis = analyzeAgenda(fixture.agenda, fixture.options);
  const actual = {
    status: analysis.feasibility.status, proofKind: analysis.feasibility.proof.kind,
    coreStatus: analysis.conflict.status, coreSize: analysis.conflict.taskIds?.length ?? null,
    repairStatus: analysis.repairs.status, cost: analysis.repairs.optimum ?? null,
    choices: analysis.repairs.choices.length,
    validRepairWitnesses: analysis.repairs.choices.every(choice => verifySchedule(choice.agenda, choice.schedule).valid),
  };
  const matches = actual.status === fixture.expected.status && actual.proofKind === fixture.expected.proofKind
    && actual.repairStatus === fixture.expected.repairStatus && actual.validRepairWitnesses
    && (fixture.expected.coreSize === undefined || actual.coreSize === fixture.expected.coreSize)
    && (fixture.expected.coreStatus === undefined || actual.coreStatus === fixture.expected.coreStatus)
    && (fixture.expected.choices === undefined || actual.choices === fixture.expected.choices)
    && (!fixture.expected.cost || JSON.stringify(actual.cost) === JSON.stringify(fixture.expected.cost));
  return { id: fixture.id, expected: fixture.expected, actual, matches, analysis };
});
const presetResults = PRESET_INFO.map(({ id }) => {
  const analysis = analyzeAgenda(getPreset(id));
  return { id, analysis };
});
writeFileSync(`${evidence}/fixture-results.json`, JSON.stringify({
  schema: "agenda-planner-fixture-results/1", classification: "synthetic-model-evidence",
  cases: fixtureResults, presets: presetResults,
}, null, 2) + "\n");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.name === "evidence") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}
const artifactHashes = sourceFiles(project).map(path => {
  const bytes = readFileSync(path);
  return { path: path.split("\\").join("/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
});
const tap = readFileSync(checks[0].log, "utf8");
const tapCount = name => Number(tap.match(new RegExp(`^# ${name} (\\d+)$`, "m"))?.[1] ?? 0);
const passed = checks.every(check => check.status === "passed") && fixtureResults.every(fixture => fixture.matches);
const result = {
  schema: "local-workstream-result/1", id: "05-planner", title: manifest.title,
  stage: "work-produced", status: passed ? "passed" : "failed",
  recordedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  scope: "Local original implementation and synthetic numerical verification only.",
  checks,
  tests: { total: tapCount("tests"), passed: tapCount("pass"), failed: tapCount("fail"), skipped: tapCount("skipped"), cancelled: tapCount("cancelled") },
  adversarialFixtures: {
    total: fixtureResults.length, matched: fixtureResults.filter(fixture => fixture.matches).length,
    results: `${evidence}/fixture-results.json`,
    sha256: createHash("sha256").update(readFileSync(`${evidence}/fixture-results.json`)).digest("hex"),
  },
  independentOracleCorpora: { startDomainModels: 1000, finiteRepairPolicies: 250, taskCoreModels: 150, method: "Separate exhaustive test implementations, not the engine's own search" },
  semantics: {
    feasibility: "All tasks required, nonpreemptive, within both availability unions, fixed starts, finish-to-start dependencies, and a declared discrete same-day single-track model.",
    infeasibility: "Sound arithmetic/cycle/domain/fixed-collision proof or completed exhaustive search only. Bound exhaustion is unproven.",
    conflict: "Minimum task-cardinality core only when all smaller induced task subsets are conclusively feasible; not a minimum atomic-constraint set.",
    repairObjective: "Lexicographic changedFields then totalMinutes over only declared cutoff extensions and permitted unfixed-task duration reductions.",
    minimum: "Every cheaper permitted vector proven infeasible before a complete repair witness; truncated ties are disclosed separately.",
  },
  manualBrowserChecks: "not-observed",
  manualProtocol: `${project}/docs/manual-checks.json`,
  automatedUiScope: "Node DOM-double execution of the original bundle and static asset checks; no browser-rendering or assistive-technology claim.",
  userStudyPerformed: false, tractionClaimed: false, published: false, nativeInitialized: false,
  externalEffectsPerformed: false, sharedBrowserUsed: false, servicesStarted: false,
  releaseRecommendation: "HOLD for external release; manual review and separate owner publication authorization remain outstanding.",
  provenance: `${project}/provenance.json`,
  limitations: manifest.limitations,
  artifactHashes,
  logHashes: checks.map(check => ({ path: check.log, sha256: createHash("sha256").update(readFileSync(check.log)).digest("hex") })),
};
writeFileSync(`${evidence}/result.json`, JSON.stringify(result, null, 2) + "\n");
console.log(`${result.status}: ${result.tests.passed}/${result.tests.total} tests, ${result.adversarialFixtures.matched}/${result.adversarialFixtures.total} fixture outcomes; wrote ${relative(repoRoot, resolve(evidence, "result.json"))}.`);
if (!passed) process.exitCode = 1;
