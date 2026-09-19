import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runStudy, independentAssignmentAudit, projectRoot, jsonText } from "../src/study.mjs";

const mode = process.argv[2];
if (process.argv.length !== 3 || !["--write", "--check", "--emit"].includes(mode)) {
  console.error("Usage: node projects/04-invention/scripts/experiment.mjs --write|--check|--emit");
  process.exitCode = 2;
} else {
  try {
    const artifacts = runStudy();
    const audit = independentAssignmentAudit(artifacts);
    if (mode === "--emit") {
      process.stdout.write(jsonText(artifacts));
    } else {
      for (const [path, content] of Object.entries(artifacts)) {
        const destination = join(projectRoot, path);
        if (mode === "--write") {
          mkdirSync(dirname(destination), { recursive: true });
          writeFileSync(destination, content);
        } else if (readFileSync(destination, "utf8") !== content) {
          throw new Error(`Reproduction mismatch: ${path}`);
        }
      }
      const result = JSON.parse(artifacts["evidence/result.json"]);
      console.log(jsonText({
        mode, artifacts: Object.keys(artifacts).length, assignmentsIndependentlyChecked: audit.checked,
        referenceCountsMatched: result.checks.referenceChecks.length,
        totalTrialMethodResults: result.execution.pairedMethodResults,
        authoredTotals: Object.fromEntries(result.methods.map((summary) => [summary.method, summary.authoredTotal])),
        pairedTotals: Object.fromEntries(result.methods.map((summary) => [summary.method, summary.pairedTotal])),
        decision: result.decision
      }));
    }
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
