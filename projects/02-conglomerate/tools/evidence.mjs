import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { initialScenario, rankVentures, recommendedAllocation, auditAllocation, sensitivity } from "../model.mjs";
import { inspectCsv, parseCsv } from "../csv-checker.mjs";

const project = new URL("../", import.meta.url);
const repo = new URL("../../", project);
const prefix = "projects/02-conglomerate/";
const outputPath = `${prefix}evidence/result.json`;
const read = path => readFileSync(new URL(path, project), "utf8");
const input = JSON.parse(read("data/inputs.json"));
const manifest = JSON.parse(read("manifest.json"));
const testArgs = [
  "--test",
  "--test-reporter=tap",
  `${prefix}test/model.test.mjs`,
  `${prefix}test/checker.test.mjs`,
  `${prefix}test/integration.test.mjs`
];

function compute() {
  const scenario = initialScenario(input);
  const ranking = rankVentures(scenario);
  const allocations = recommendedAllocation(scenario);
  const original = structuredClone(scenario);
  original.mode = "seed";
  const reserve = structuredClone(scenario);
  reserve.reserveMinutes = input.sourceCapacity.reservedHours * 60;
  const tied = structuredClone(scenario);
  for (const v of tied.ventures) Object.assign(v, { learning: 3, reuse: 3, confidence: 50, deliveryMinutes: 80, testPrepMinutes: 20 });
  const sourceRows = parseCsv(read("data/allocation-worksheet.csv")).slice(1).map(row => row.cells);
  const reference = sourceRows.filter(row => row[8] === "1");
  const hashes = {};
  for (const artifact of [...manifest.artifacts].sort()) {
    if (artifact === outputPath) continue;
    hashes[artifact] = createHash("sha256").update(readFileSync(new URL(artifact, repo))).digest("hex");
  }
  return {
    schema: "local-work-result/1",
    id: "02-conglomerate",
    stage: "work-produced",
    classification: "Actual local computational outputs from synthetic inputs and explicitly unmeasured assumptions",
    initial: {
      hardBudgetMinutes: 300, objective: input.objective, weights: scenario.weights,
      ranking, allocations, budget: auditAllocation(scenario, allocations),
      dispositions: scenario.ventures.map(v => ({
        id: v.id, status: allocations[v.id] > 0 ? "proposed-active" : "proposed-parked",
        reason: allocations[v.id] > 0 ? "Highest feasible score under the stated learning/reuse objective; owner approval not granted." : "One-offering limit; lower default modeled score, not evidence of business failure."
      }))
    },
    sensitivity: sensitivity(scenario),
    infeasibility: {
      primarySeedDurations: rankVentures(original),
      literalSeedReserveMinutes: reserve.reserveMinutes,
      literalSeedReserveRecommendation: rankVentures(reserve).recommended,
      fiveWaySplit: auditAllocation(scenario, Object.fromEntries(scenario.ventures.map(v => [v.id, 60]))),
      allTenOriginalExperiments: sourceRows.map(row => ({
        id: row[1], originalMinutes: Number(row[3]) * 60,
        withNewReviewAndReserve: Number(row[3]) * 60 + scenario.reviewMinutes + scenario.reserveMinutes,
        feasibleAtInitialCap: Number(row[3]) * 60 + scenario.reviewMinutes + scenario.reserveMinutes <= 300
      }))
    },
    equalScoreEqualMinutesTie: rankVentures(tied),
    originalReference: {
      selected: reference.map(row => row[1]),
      hours: reference.reduce((total, row) => total + Number(row[3]), 0),
      hypotheticalCents: reference.reduce((total, row) => total + Math.round(Number(row[4]) * 100), 0),
      unusedDiscretionaryHours: 13, unusedHypotheticalCents: 41000,
      interpretation: "Reconciliation of synthetic seed data, not actual funds or spend"
    },
    offering: {
      name: "Ledgerleaf CSV Preflight",
      implementation: `${prefix}csv-checker.mjs`,
      input: `${prefix}data/csv-intake.csv`,
      actualReport: inspectCsv(readFileSync(new URL("data/csv-intake.csv", project)), { key: "invoice-id", required: ["invoice-id", "amount-usd"] }),
      expectedInterpretation: "The duplicate-key finding is intentional fixture evidence; a structural finding is not a market result."
    },
    demandTests: input.ventures.map(v => ({
      id: v.id, status: v.plan.status, prepMinutesEstimate: v.testPrepMinutes,
      laterObservationMinutesEstimate: v.plan.laterExecutionMinutes,
      recruitment: "Unknown, excluded; no participants contacted",
      passRule: v.plan.pass, stopRule: v.plan.stop
    })),
    boundaries: {
      nativeObjectsInitialized: false, customersOrRevenueClaimed: false, marketObservations: 0,
      outreachPerformed: false, published: false, spendingAuthorizedOrPerformed: false,
      downloadedStarterCodeReadOrExecuted: false,
      realBrowserReview: "Not performed; automated DOM harness only",
      reviewStatus: "Local work produced, no native task claim or human acceptance"
    },
    artifactSha256: hashes
  };
}

const mode = process.argv[2];
if (!["--write", "--check"].includes(mode) || process.argv.length !== 3) {
  console.error("Usage from repository root: node projects/02-conglomerate/tools/evidence.mjs --write|--check");
  process.exit(2);
}
if (process.cwd() !== fileURLToPath(repo).replace(/\/$/, "")) {
  console.error("Run this evidence command from the repository root.");
  process.exit(2);
}
const run = spawnSync(process.execPath, testArgs, {
  cwd: fileURLToPath(repo), encoding: "utf8", maxBuffer: 2 * 1024 * 1024,
  env: process.env
});
if (run.error || run.status !== 0) {
  console.error(run.error?.message ?? run.stdout);
  if (run.stderr) console.error(run.stderr);
  process.exit(1);
}
const count = name => {
  const match = run.stdout.match(new RegExp(`^# ${name} (\\d+)\\r?$`, "m"));
  if (!match) throw new Error(`Test runner did not emit the ${name} count.`);
  return Number(match[1]);
};
const result = {
  ...compute(),
  validation: {
    command: ["node", ...testArgs], exitCode: run.status,
    tests: count("tests"), passed: count("pass"), failed: count("fail"),
    skipped: count("skipped"), nodeVersion: process.version,
    uiCoverage: "The real original browser module, executed in a local DOM/fetch harness; not a visual browser test."
  }
};
if (mode === "--write") {
  mkdirSync(`${prefix}evidence`, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}: ${result.validation.passed}/${result.validation.tests} tests passed; ${result.initial.ranking.recommended}, ${result.initial.budget.usedMinutes}/300 minutes; fixture ${result.offering.actualReport.findings[0].code}.`);
} else {
  const recorded = JSON.parse(readFileSync(outputPath, "utf8"));
  recorded.validation.nodeVersion = result.validation.nodeVersion;
  if (!isDeepStrictEqual(recorded, result)) {
    console.error("Persisted evidence differs from the current outputs, test results or source hashes. Run --write after reviewing changes.");
    process.exit(1);
  }
  console.log(`Evidence matches: ${result.validation.passed}/${result.validation.tests} tests pass; outputs and all ${Object.keys(result.artifactSha256).length} artifact hashes verified.`);
}
