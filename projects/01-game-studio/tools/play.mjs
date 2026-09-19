import "../builds.js";
import "../engine.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engine = globalThis.LittleSignalsEngine;
const [operation, ...args] = process.argv.slice(2);

if (operation === "record") {
  const [version, scenario, policy, filename, seedText = "42"] = args;
  if (!filename || !/^[a-z0-9-]+\.json$/.test(filename)) throw new Error("Use a simple evidence filename ending in .json.");
  if (!["solo", "class", "untaught", "split"].includes(policy)) throw new Error("Policy: solo, class, untaught, or split.");
  const options = { version, scenario, seed: Number(seedText) };
  const game = engine.create(options);
  const lessons = [];
  if (policy !== "untaught") {
    for (let robot = 0; robot < 3; robot++) {
      if (policy === "solo" && robot > 0) {
        lessons.push({ type: "teach", robot, rule: "job", value: "rest" });
      } else {
        lessons.push({ type: "teach", robot, rule: "delivery", value: true });
        lessons.push({ type: "teach", robot, rule: "safety", value: true });
        if (policy === "solo") lessons.push({ type: "teach", robot, rule: "focus", value: "east" });
        if (policy === "split") lessons.push({ type: "teach", robot, rule: "focus", value: ["north", "east", "south"][robot] });
      }
    }
  }
  game.run(lessons);
  while (game.snapshot().status === "playing") game.act({ type: "tick", count: 1 });
  const trace = game.trace();
  const final = engine.replay(trace);
  const report = {
    schema: "little-signals-recording/1",
    recordedAt: new Date().toISOString(),
    observation: "Actual deterministic Node execution of the browser game engine; not a human playtest.",
    policy,
    engineSha256: createHash("sha256").update(await readFile(resolve(root, "engine.js"))).digest("hex"),
    buildsSha256: createHash("sha256").update(await readFile(resolve(root, "builds.js"))).digest("hex"),
    score: { ...engine.score(final), automated: true },
    metrics: final.metrics,
    replayVerified: true,
    trace,
  };
  await mkdir(resolve(root, "evidence/runs"), { recursive: true });
  const output = resolve(root, "evidence/runs", filename);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file: `projects/01-game-studio/evidence/runs/${filename}`, ...report.score, metrics: final.metrics, replayVerified: true }, null, 2));
} else if (operation === "replay") {
  for (const file of args) {
    const data = JSON.parse(await readFile(resolve(file), "utf8"));
    const state = engine.replay(data.trace ?? data);
    console.log(`${file}: verified ${state.tick} beats, ${state.delivered}/${state.goal} delivered, ${state.status}, ${engine.fingerprint(state)}`);
  }
  if (args.length === 0) throw new Error("Pass at least one replay file.");
} else {
  console.error("node projects/01-game-studio/tools/play.mjs record <v1…> <meadow|switchback|narrows> <solo|class|split|untaught> <filename.json> [seed]");
  console.error("node projects/01-game-studio/tools/play.mjs replay <repo-relative replay files…>");
  process.exitCode = 1;
}
