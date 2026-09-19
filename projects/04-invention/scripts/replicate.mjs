import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot, sha256, jsonText, independentAssignmentAudit } from "../src/study.mjs";

const mode = process.argv[2];
if (process.argv.length !== 3 || !["--write", "--check"].includes(mode)) {
  console.error("Usage: node projects/04-invention/scripts/replicate.mjs --write|--check");
  process.exitCode = 2;
} else {
  try {
    const argv = [join(projectRoot, "scripts/experiment.mjs"), "--emit"];
    const runs = [1, 2].map(() => {
      const run = spawnSync(process.execPath, argv, {
        cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000
      });
      if (run.status !== 0 || run.error) throw new Error(`Fresh-process failure: ${run.error ?? run.stderr}`);
      return run.stdout;
    });
    if (runs[0] !== runs[1]) throw new Error("Fresh-process outputs differ");
    const artifacts = JSON.parse(runs[0]);
    for (const [path, content] of Object.entries(artifacts)) {
      if (readFileSync(join(projectRoot, path), "utf8") !== content) throw new Error(`Saved evidence differs: ${path}`);
    }
    const assignmentAudit = independentAssignmentAudit(artifacts);
    const report = {
      schema: "local-invention-repetition/1",
      status: "pass",
      runtime: { node: process.version, platform: process.platform, architecture: process.arch },
      commandFromRepositoryRoot: ["node", "projects/04-invention/scripts/replicate.mjs", "--write"],
      repeatedCommandFromRepositoryRoot: ["node", "projects/04-invention/scripts/experiment.mjs", "--emit"],
      freshProcesses: 2, outputHashes: runs.map(sha256),
      byteIdentical: true, savedEvidenceMatches: true, assignmentAudit,
      artifactHashes: Object.fromEntries(Object.entries(artifacts).map(([path, content]) => [path, sha256(content)])),
      scope: "Two fresh original-JavaScript processes plus a separate serialized-assignment audit. Not independent human replication or a browser/physical test."
    };
    if (mode === "--write") writeFileSync(join(projectRoot, "evidence/reproducibility.json"), jsonText(report));
    else {
      const saved = JSON.parse(readFileSync(join(projectRoot, "evidence/reproducibility.json"), "utf8"));
      if (!saved.byteIdentical || !saved.savedEvidenceMatches ||
          JSON.stringify(saved.artifactHashes) !== JSON.stringify(report.artifactHashes) ||
          JSON.stringify(saved.outputHashes) !== JSON.stringify(report.outputHashes) ||
          JSON.stringify(saved.assignmentAudit) !== JSON.stringify(report.assignmentAudit)) {
        throw new Error("Saved reproducibility record does not match");
      }
    }
    console.log(jsonText({ mode, byteIdentical: true, checked: assignmentAudit.checked, outputSha256: report.outputHashes[0] }));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
