import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { projectRoot, jsonText, readJson, read, sha256 } from "../src/study.mjs";

if (process.argv.length !== 3 || process.argv[2] !== "--write") {
  console.error("Usage: node projects/04-invention/scripts/checks.mjs --write");
  process.exitCode = 2;
} else {
  const root = resolve(projectRoot, "../..");
  const checks = readJson("manifest.json").checks;
  const report = {
    schema: "local-invention-checks/1", status: "running",
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    commandFromRepositoryRoot: ["node", "projects/04-invention/scripts/checks.mjs", "--write"],
    scope: "Actual local Node tests, deterministic experiment replay and two fresh-process repetitions. DOM tests use a minimal Node VM adapter; no browser layout or physical test occurred.",
    checks: [],
    codeHashes: Object.fromEntries([
      "index.html", "style.css", "src/app.js", "src/engine.js",
      "src/study.mjs", "scripts/experiment.mjs", "scripts/replicate.mjs",
      "scripts/checks.mjs", "test/engine.test.mjs", "test/evidence.test.mjs", "test/ui.test.mjs"
    ].map((path) => [path, sha256(read(path))]))
  };
  const destination = join(projectRoot, "evidence/checks.json");
  writeFileSync(destination, jsonText(report));
  for (const argv of checks) {
    if (argv[0] !== "node") throw new Error("Only the declared original Node commands are supported");
    const run = spawnSync(process.execPath, argv.slice(1), {
      cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024
    });
    report.checks.push({
      argv, exitCode: run.status, signal: run.signal,
      stdout: run.stdout ?? "", stderr: run.stderr ?? "",
      error: run.error?.message ?? null
    });
    console.log(`${run.status === 0 ? "PASS" : "FAIL"} ${argv.join(" ")}`);
  }
  report.status = report.checks.every((check) => check.exitCode === 0 && !check.error) ? "pass" : "fail";
  writeFileSync(destination, jsonText(report));
  console.log(`Evidence: projects/04-invention/evidence/checks.json (${report.status})`);
  if (report.status !== "pass") process.exitCode = 1;
}
