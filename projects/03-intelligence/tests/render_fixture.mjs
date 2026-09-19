import { readFileSync } from "node:fs";
import vm from "node:vm";

const project = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, project), "utf8");
const sandbox = { URL, URLSearchParams, Intl };
vm.createContext(sandbox);
for (const name of ["data.js", "model.js", "render.js"]) vm.runInContext(read(name), sandbox);
const bundle = sandbox.INTELLIGENCE_DATA;
const model = sandbox.EvidenceModel;
const render = sandbox.EvidenceRender;
const state = model.initialState(bundle.research);
const claims = model.filterClaims(bundle.research, state);
let html = read("index.html");
for (const [id, content] of [
  ["source-nodes", render.sourceNodes(bundle.research, state, claims)],
  ["claim-nodes", render.claimNodes(bundle.research, state, claims)],
  ["inspector-content", render.inspector(bundle, state)],
  ["strongest-cases", render.strongestCases(bundle.research)],
  ["gates-content", render.gates(bundle, state)],
  ["method-content", render.method(bundle)],
]) {
  html = html.replace(new RegExp(`(<div id="${id}"[^>]*>)(</div>)`), (_match, open, close) => open + content + close);
}
process.stdout.write(JSON.stringify({
  fullPage: html,
  sources: Array.from(bundle.research.sources, (source) => render.sourceInspector(bundle, source)),
  claims: Array.from(bundle.research.claims, (claim) => render.claimInspector(bundle, claim)),
}));
