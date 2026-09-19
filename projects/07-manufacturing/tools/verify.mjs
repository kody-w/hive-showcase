import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(project, "../..");
const args = process.argv.slice(2);
if (args.length !== 1 || !["--write-evidence", "--check"].includes(args[0])) {
  throw new Error("Usage: node projects/07-manufacturing/tools/verify.mjs --write-evidence|--check");
}
const manifest = JSON.parse(fs.readFileSync(path.join(project, "manifest.json"), "utf8"));
const checks = [];
for (const argv of manifest.checks) {
  const run = spawnSync(argv[0], argv.slice(1), { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (run.error || run.status !== 0) {
    console.error(run.stdout, run.stderr);
    throw new Error(`Check failed: ${argv.join(" ")}; ${run.error || `exit ${run.status}`}`);
  }
  const record = { argv, cwd: "repository-root", exitCode: run.status, status: "pass" };
  const tests = run.stdout.match(/# tests (\d+)/);
  if (argv.includes("--test") && !tests) throw new Error("Expected TAP test totals were not reported.");
  if (tests) {
    record.tests = Number(tests[1]);
    record.passed = Number(run.stdout.match(/# pass (\d+)/)?.[1]);
    record.failed = Number(run.stdout.match(/# fail (\d+)/)?.[1]);
    record.cancelled = Number(run.stdout.match(/# cancelled (\d+)/)?.[1]);
    record.skipped = Number(run.stdout.match(/# skipped (\d+)/)?.[1]);
    if (record.failed !== 0 || record.cancelled !== 0 || record.skipped !== 0 || record.passed !== record.tests) {
      throw new Error("Test results are incomplete.");
    }
  } else {
    record.summary = run.stdout.trim();
  }
  checks.push(record);
  console.log(`PASS ${argv.join(" ")}${record.tests ? ` (${record.passed}/${record.tests} tests)` : ""}`);
}

const hash = (relative) => crypto.createHash("sha256").update(fs.readFileSync(path.join(project, relative))).digest("hex");
const sources = [
  "engine.js", "archive.js", "app.js", "index.html", "styles.css", "README.md", "manifest.json",
  "tools/generate.mjs", "tools/capture-provenance.py", "tools/verify.mjs",
  "tests/engine.test.mjs", "tests/app.test.mjs", "tests/verify_artifacts.py",
  "data/source-provenance.json", "generated/artifact-index.json", "evidence/mesh-validation.json"
];
const result = {
  schema: "local-hive-work-result/1",
  id: "07-manufacturing", seedSlug: "micro-manufacturing-company", stage: "work-produced",
  status: "digital-checks-passed", classification: "Original digital work and synthetic modeled estimates only",
  entrypoint: "projects/07-manufacturing/index.html",
  implementation: "Original shared-lattice parametric solids; plain offline browser JS and Node/Python standard library",
  runtimes: { node: process.version, python: spawnSync("python3", ["--version"], { cwd: root, encoding: "utf8" }).stdout.trim() },
  checks,
  sourceSHA256: Object.fromEntries(sources.map((source) => [source, hash(source)])),
  outputs: {
    configurations: ["stackline", "compact", "pocket-arcade"],
    nominalSTLSolids: 6, closedManifoldSolids: 6,
    dimensionedSVGDrawings: 3, twoPartBOMs: 3, reviewZIPs: 3,
    manifestArtifactPaths: manifest.artifacts,
    independentlyValidated: "projects/07-manufacturing/evidence/mesh-validation.json"
  },
  baseline: {
    trayInteriorMM: [174, 94], insertFootprintMM: [171, 91], nominalGapMM: 1.5,
    solidVolumeMM3: 122316, modeledSolidMassG: 151.67184,
    syntheticUSDPerKit: "7.61", syntheticUSDTwentyKitAggregate: "152.13",
    syntheticInspection: { pass: 3, hold: 2 }
  },
  widthChange: { outerWidthMM: 196, paddedWidthMM: 200, packInteriorWidthMM: 192, disposition: "HOLD" },
  downloadedStarterCodeExecuted: false, browserAccessedByWorkstream: false,
  nativeHiveInitialized: false, fabricationOrOrdersPerformed: false,
  servicesStarted: false, publicationOrSpendingPerformed: false, physicalTestsPerformed: [],
  limitations: manifest.limitations
};
const encoded = JSON.stringify(result, null, 2) + "\n";
const destination = path.join(project, "evidence/result.json");
if (args[0] === "--write-evidence") {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, encoded);
  console.log("Persisted truthful executed-check evidence in projects/07-manufacturing/evidence/result.json.");
} else {
  if (fs.readFileSync(destination, "utf8") !== encoded) throw new Error("Persisted execution evidence is stale; rerun --write-evidence.");
  console.log("Persisted execution evidence matches the fresh checks and source hashes.");
}
