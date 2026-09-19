import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PROJECT, readJSON, readText, sha256, verifyCopiedData } from "./inputs.mjs";

function scopedFiles(directory = PROJECT) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return scopedFiles(path);
    if (!entry.isFile()) throw new Error(`Unsupported artifact type: ${path}`);
    return path === `${PROJECT}/evidence/result.json` ? [] : [path];
  }).sort();
}

function artifactHashes() {
  return scopedFiles().map(path => {
    const bytes = readFileSync(path);
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
}

function parseTestCounts(tap) {
  const counts = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const match = tap.match(new RegExp(`^# ${key} (\\d+)$`, "m"));
    if (!match) throw new Error(`Missing TAP summary: ${key}`);
    counts[key] = Number(match[1]);
  }
  if (!counts.tests || counts.tests !== counts.pass || counts.fail || counts.cancelled || counts.skipped || counts.todo) {
    throw new Error("Evidence requires every test to pass without skips or pending work");
  }
  return counts;
}

function verifyEvidence() {
  const report = readJSON("evidence/result.json");
  if (report.id !== "08-turnaround" || report.stage !== "work-produced" || report.status !== "passed") {
    throw new Error("Evidence identity/status is invalid");
  }
  const actual = artifactHashes();
  if (JSON.stringify(actual) !== JSON.stringify(report.artifacts)) {
    const expected = new Map(report.artifacts.map(row => [row.path, row.sha256]));
    const changed = actual.filter(row => row.sha256 !== expected.get(row.path)).map(row => row.path);
    throw new Error(`Artifact integrity drift (${changed.join(", ") || "removed files"}); rerun evidence --write after validation.`);
  }
  if (sha256(JSON.stringify(actual)) !== report.artifactSetSha256) throw new Error("Artifact-set digest mismatch");
  if (JSON.stringify(parseTestCounts(readText("evidence/tests.tap"))) !== JSON.stringify(report.tests)) {
    throw new Error("Recorded test count mismatch");
  }
  if (report.checks.some(row => row.exitCode !== 0)) throw new Error("A recorded command failed");
  const manifest = readJSON("manifest.json");
  if (JSON.stringify(report.checks.map(row => row.argv)) !== JSON.stringify(manifest.checks.slice(0, 2))) {
    throw new Error("Recorded commands differ from manifest");
  }
  if (report.browserUsed || report.nativeInitialized || report.referenceTasksAccepted || report.externalEffects.length) {
    throw new Error("Authority boundary changed");
  }
  const sources = verifyCopiedData();
  return { status: "passed", checkedArtifacts: actual.length, sourceFilesMatched: sources, tests: report.tests.tests, artifactSetSha256: report.artifactSetSha256 };
}

function writeEvidence() {
  mkdirSync(`${PROJECT}/evidence`, { recursive: true });
  const manifest = readJSON("manifest.json");
  const environment = { ...process.env, NO_COLOR: "1" };
  delete environment.FORCE_COLOR;
  const checks = [];
  for (let index = 0; index < 2; index++) {
    const argv = manifest.checks[index];
    const start = Date.now();
    const run = spawnSync(argv[0], argv.slice(1), {
      cwd: process.cwd(), env: environment, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024
    });
    const artifact = index === 0 ? "evidence/tests.tap" : "evidence/build-check.json";
    if (index === 0) writeFileSync(`${PROJECT}/${artifact}`, run.stdout ?? "");
    else writeFileSync(`${PROJECT}/${artifact}`, `${JSON.stringify({
      argv, exitCode: run.status,
      output: run.status === 0 ? JSON.parse(run.stdout) : run.stdout,
      stderr: run.stderr ?? ""
    }, null, 2)}\n`);
    if (run.error || run.status !== 0) {
      throw new Error(`Validation failed: ${argv.join(" ")}\n${run.error?.message ?? ""}\n${run.stdout ?? ""}\n${run.stderr ?? ""}`);
    }
    checks.push({
      argv, exitCode: run.status, durationMs: Date.now() - start,
      stdoutArtifact: `${PROJECT}/${artifact}`, stderr: run.stderr ?? ""
    });
  }
  const tests = parseTestCounts(readText("evidence/tests.tap"));
  const scenarios = readJSON("results/scenarios.json");
  const search = readJSON("results/strategy-search.json");
  const sources = readJSON("data/attribution.json");
  const artifacts = artifactHashes();
  const report = {
    schema: "local-hive-project-result/1",
    id: "08-turnaround",
    title: manifest.title,
    stage: "work-produced",
    status: "passed",
    recordedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, dependencyInstalls: 0 },
    summary: "Original bounded cash model and offline interface produced and locally tested. No sustainable rescue was found in the documented strategy space.",
    checks,
    integrityCheck: {
      argv: manifest.checks[2],
      method: "This same artifact-set verification runs after recording. evidence/result.json excludes itself from the digest to avoid a self-hash cycle."
    },
    tests,
    sourceVerification: {
      copiedInertFilesMatched: verifyCopiedData(),
      report: "evidence/seed-verification.json",
      seedObjectRef: sources.seedObjectRef,
      archiveSha256: sources.archiveSha256,
      extractedSeedJsonSha256: sources.extractedSeedJsonSha256
    },
    strategySearch: {
      evaluated: search.evaluatedCount, valid: search.validCount, rejected: search.rejectedCount,
      floorAndFundingSurvivors: search.floorAndFundingSurvivors,
      candidateId: search.candidate.id, candidatePlan: search.candidate.plan,
      remainingCandidateBurnPer30DaysCents: search.candidate.endingCycleRecurringBurnCents
    },
    modeledOutcomes: scenarios.scenarios.map(row => ({
      id: row.id, ...row.result.summary,
      firstUnfundedPayment: row.result.firstUnfundedPayment,
      receiptConservation: row.result.receiptConservation
    })),
    earliestWarning: {
      day: 0,
      interpretation: "With a fully specified deterministic schedule, every default/stress experiment already shows a future failure at day 0. Rolling seven-day alerts are separately recorded; they do not postpone discovery."
    },
    browserUsed: false,
    uiValidation: "Original bundled application executed against a minimal Node DOM harness. No browser, screenshot, visual inspection or real-browser accessibility certification performed.",
    nativeInitialized: false,
    downloadedCodeExecuted: false,
    downloadedCodeImportedOrEmbedded: false,
    referenceTasksAccepted: false,
    externalEffects: [],
    limitations: manifest.limitations,
    artifacts,
    artifactSetSha256: sha256(JSON.stringify(artifacts))
  };
  writeFileSync(`${PROJECT}/evidence/result.json`, `${JSON.stringify(report, null, 2)}\n`);
  return verifyEvidence();
}

try {
  const mode = process.argv[2];
  if (!["--write", "--check"].includes(mode)) throw new Error("Use --write or --check from the repository root");
  const result = mode === "--write" ? writeEvidence() : verifyEvidence();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
