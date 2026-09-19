import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT, loadInputs, readJSON, readText, sha256, verifyCopiedData } from "./inputs.mjs";
import { reconcile, backlogImpact, runExperiments } from "../model.mjs";

const jsonText = value => `${JSON.stringify(value, null, 2)}\n`;

export function computeOutputs() {
  const inputs = loadInputs();
  const experiments = readJSON("data/scenarios.json");
  const study = runExperiments(inputs, experiments);
  const provenance = {
    modelSha256: sha256(readText("model.mjs")),
    inputsSha256: sha256(jsonText(inputs)),
    scenarioSpecificationSha256: sha256(readText("data/scenarios.json"))
  };
  const browserStudy = {
    candidate: study.search.candidate,
    evaluatedCount: study.search.evaluatedCount,
    validCount: study.search.validCount,
    rejectedCount: study.search.rejectedCount,
    floorAndFundingSurvivors: study.search.floorAndFundingSurvivors,
    scenarios: study.scenarios.map(row => ({ id: row.id, title: row.title, summary: row.result.summary })),
    thresholds: study.thresholds.grid
  };
  const dataModule = `// Generated from reviewed inert data and original model; reproduce with scripts/build.mjs.\nexport const INPUTS = ${JSON.stringify(inputs, null, 2)};\nexport const EXPERIMENTS = ${JSON.stringify(experiments, null, 2)};\nexport const STUDY = ${JSON.stringify(browserStudy, null, 2)};\n`;
  const stripModule = source => source
    .replace(/^import .+ from "[^"]+";\r?\n/gm, "")
    .replace(/^export (?=(?:const|function|class)\b)/gm, "");
  const offline = `// Generated file:// fallback from ORIGINAL project modules only. No downloaded code.\n(() => {\n"use strict";\n${[readText("model.mjs"), readText("view-model.mjs"), dataModule, readText("app.mjs")].map(stripModule).join("\n")}\n})();\n`;
  const outputs = new Map([
    ["data/inputs.json", jsonText(inputs)],
    ["results/reconciliation.json", jsonText({ ...reconcile(inputs), provenance })],
    ["results/backlog.json", jsonText({ ...backlogImpact(inputs), provenance })],
    ["results/scenarios.json", jsonText({
      schema: "turnaround-frozen-scenarios/1",
      classification: "Conditional synthetic schedules; not observed business outcomes",
      candidateId: study.search.candidate.id, provenance,
      scenarios: study.scenarios
    })],
    ["results/strategy-search.json", jsonText({ ...study.search, provenance })],
    ["results/thresholds.json", jsonText({ ...study.thresholds, provenance })],
    ["data.mjs", dataModule],
    ["offline.js", offline]
  ]);
  return { outputs, study };
}

export function build(mode) {
  if (!["--write", "--check"].includes(mode)) throw new Error("Use --write or --check from the repository root");
  const { outputs, study } = computeOutputs();
  const mismatches = [];
  for (const [name, expected] of outputs) {
    const path = `${PROJECT}/${name}`;
    if (mode === "--write") {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, expected);
    } else if (!existsSync(path) || readText(name) !== expected) {
      mismatches.push(name);
    }
  }
  if (mismatches.length) throw new Error(`Frozen output drift: ${mismatches.join(", ")}. Run --write, then tests and evidence again.`);
  const summary = {
    mode, status: "passed", generatedArtifacts: outputs.size,
    verifiedCopiedDataFiles: verifyCopiedData(),
    candidateId: study.search.candidate.id,
    strategies: study.search.evaluatedCount,
    resourceValid: study.search.validCount,
    floorAndFundingSurvivors: study.search.floorAndFundingSurvivors,
    scenarios: study.scenarios.map(row => ({
      id: row.id, firstFloorDay: row.result.summary.firstFloorDay,
      firstUnfundedDay: row.result.summary.firstUnfundedDay,
      finalScheduledCashCents: row.result.summary.finalScheduledCashCents
    }))
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    build(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
