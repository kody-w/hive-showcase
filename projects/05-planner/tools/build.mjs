import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { getPreset } from "../presets.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceNames = ["engine.mjs", "presets.mjs", "editor.mjs", "app.mjs"];

export function bundleSource() {
  const sections = sourceNames.map(name => {
    const source = readFileSync(join(projectRoot, name), "utf8");
    const digest = createHash("sha256").update(source).digest("hex");
    const body = source
      .replace(/^import \{ [^\n]+ \} from "\.\/(?:engine|presets|editor)\.mjs";\n/gm, "")
      .replace(/^export (?=(?:const|function) )/gm, "");
    if (/^(?:import|export)\s/m.test(body)) throw new Error(`Unsupported module syntax in ${name}; do not silently build it.`);
    return `// ${name} sha256:${digest}\n${body}`;
  });
  return `// GENERATED ONLY FROM ORIGINAL LOCAL ES MODULES. Rebuild: node projects/05-planner/tools/build.mjs\n// Classic-script packaging permits direct file:// use; no downloaded starter code is included.\n(() => {\n"use strict";\n${sections.join("\n")}\n})();\n`;
}

export function generatedArtifacts() {
  const artifacts = new Map([["app.bundle.js", bundleSource()]]);
  for (const [file, id] of [["library", "library"], ["pocket-arcade", "arcade"], ["disjoint", "split"], ["boundary", "boundary"]])
    artifacts.set(`fixtures/${file}.json`, JSON.stringify(getPreset(id), null, 2) + "\n");
  return artifacts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [name, expected] of generatedArtifacts()) {
    const output = relative(process.cwd(), join(projectRoot, name));
    if (process.argv.includes("--check")) {
      const actual = readFileSync(output, "utf8");
      if (actual !== expected) {
        console.error(`${output} is stale. Rebuild the original local modules.`);
        process.exitCode = 1;
      } else console.log(`${output} matches original local sources.`);
    } else {
      writeFileSync(output, expected);
      console.log(`Wrote ${output} from original local sources; no dependencies or network.`);
    }
  }
}
