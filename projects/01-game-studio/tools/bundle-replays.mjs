import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "../builds.js";
import "../engine.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = {};
for (const cycle of ["01", "02", "03"]) {
  for (const stage of ["before", "after"]) {
    const id = `cycle-${cycle}-${stage}`;
    const report = JSON.parse(await readFile(resolve(root, `evidence/runs/${id}.json`), "utf8"));
    globalThis.LittleSignalsEngine.replay(report.trace);
    bundle[id] = { score: report.score, trace: report.trace };
  }
}
const output = "/* Generated from this project's six actual engine recordings; never from downloaded seed code. */\n" +
  `globalThis.LittleSignalsReplays = Object.freeze(${JSON.stringify(bundle)});\n`;
if (process.argv.includes("--check")) {
  if (await readFile(resolve(root, "replay-data.js"), "utf8") !== output) throw new Error("Replay bundle is stale. Run tools/bundle-replays.mjs.");
  console.log("Six bundled recordings exactly match their verified JSON evidence.");
} else {
  await writeFile(resolve(root, "replay-data.js"), output);
  console.log(`Bundled six verified original recordings (${Buffer.byteLength(output)} bytes).`);
}
