import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import "./engine.js";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const Engine = globalThis.PackingLab;
export const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const read = (path) => readFileSync(join(projectRoot, path));
export const readJson = (path) => JSON.parse(read(path).toString("utf8"));
const insist = (condition, message) => { if (!condition) throw new Error(message); };

export function loadInputs() {
  const sources = readJson("source/sources.json");
  for (const ref of sources.copied_data) {
    const bytes = read(ref.local);
    insist(bytes.length === ref.bytes && sha256(bytes) === ref.sha256, `Source bytes changed: ${ref.local}`);
  }
  const protocol = readJson("protocol.json"), freeze = readJson("protocol-lock.json");
  insist(sha256(read("protocol.json")) === freeze.protocol_sha256, "Frozen protocol JSON changed");
  insist(sha256(read("PROTOCOL.md")) === freeze.protocol_markdown_sha256, "Frozen protocol prose changed");
  const capacity = readJson("source/capacity.json");
  const plan = readJson("source/experiment-plan.json"), expected = readJson("source/expected-baseline.json");
  insist(protocol.permutations.master_seed === plan.random_seed, "Master seed differs from source plan");
  insist(protocol.permutations.repetitions_per_scenario === plan.repetitions, "Repetitions differ from source plan");
  insist(protocol.exact_item_limit === capacity.exact_item_limit && protocol.exact_node_limit === capacity.exact_node_limit, "Search limits differ");
  insist(JSON.stringify(protocol.methods.map((method) => method.id)) === JSON.stringify(Engine.METHODS), "Methods differ from freeze");
  const scenarios = Engine.parseDataset(read("source/items.csv").toString("utf8"), capacity);
  insist(JSON.stringify(scenarios.map((scenario) => scenario.id)) === JSON.stringify(protocol.scenarios), "Scenario set/order changed");
  insist(scenarios.reduce((sum, scenario) => sum + scenario.rowCount, 0) === 11, "Wrong row count");
  insist(scenarios.reduce((sum, scenario) => sum + scenario.items.length, 0) === 29, "Wrong instance count");
  const implementationPaths = ["src/engine.js", "src/study.mjs", "scripts/experiment.mjs"];
  const implementation = Object.fromEntries(implementationPaths.map((path) => [path, sha256(read(path))]));
  const inputHashes = Object.fromEntries(sources.copied_data.map((ref) => [ref.local, ref.sha256]));
  return { sources, protocol, freeze, capacity, plan, expected, scenarios, implementation, inputHashes };
}

function evaluateCase(scenario, incomingOrder, input) {
  const byId = new Map(scenario.items.map((item) => [item.id, item]));
  insist(incomingOrder.length === scenario.items.length && new Set(incomingOrder).size === incomingOrder.length, "Invalid paired order");
  const items = incomingOrder.map((id) => {
    insist(byId.has(id), `Unexpected permutation item: ${id}`);
    return byId.get(id);
  });
  return Object.fromEntries(Engine.METHODS.map((method) => [method, Engine.pack(items, input.capacity, method, {
    beamWidth: input.protocol.beam_width,
    exactItemLimit: input.protocol.exact_item_limit,
    exactNodeLimit: input.protocol.exact_node_limit
  })]));
}

function summarize(input, authored, trials) {
  const baselineId = "input-first-fit";
  const baselineAuthored = authored.reduce((sum, entry) => sum + entry.methods[baselineId].count, 0);
  const baselinePaired = trials.reduce((sum, entry) => sum + entry.methods[baselineId].count, 0);
  const allCases = [...authored, ...trials];
  const summaries = Engine.METHODS.map((method) => {
    const role = input.protocol.methods.find((candidate) => candidate.id === method).role;
    const scenarios = input.scenarios.map((scenario) => {
      const original = authored.find((entry) => entry.scenario === scenario.id);
      const paired = trials.filter((entry) => entry.scenario === scenario.id);
      const counts = paired.map((entry) => entry.methods[method].count);
      const deltas = paired.map((entry) => entry.methods[method].count - entry.methods[baselineId].count);
      const total = counts.reduce((sum, count) => sum + count, 0);
      return {
        scenario: scenario.id,
        authoredCount: original.methods[method].count,
        authoredBaseline: original.methods[baselineId].count,
        authoredDelta: original.methods[method].count - original.methods[baselineId].count,
        counts, total, mean: total / counts.length, min: Math.min(...counts), max: Math.max(...counts),
        pairedDelta: deltas.reduce((sum, delta) => sum + delta, 0),
        wins: deltas.filter((delta) => delta < 0).length,
        ties: deltas.filter((delta) => delta === 0).length,
        losses: deltas.filter((delta) => delta > 0).length
      };
    });
    const authoredTotal = scenarios.reduce((sum, scenario) => sum + scenario.authoredCount, 0);
    const pairedTotal = scenarios.reduce((sum, scenario) => sum + scenario.total, 0);
    const reasons = [];
    if (authoredTotal >= baselineAuthored) reasons.push("No strict total improvement across authored cases");
    if (scenarios.some((scenario) => scenario.authoredDelta > 0)) reasons.push("At least one authored-case regression");
    if (pairedTotal >= baselinePaired) reasons.push("No strict total improvement across paired cases");
    if (scenarios.some((scenario) => scenario.pairedDelta > 0)) reasons.push("At least one scenario's paired total regressed");
    const statuses = {}, proofs = {};
    for (const entry of allCases) {
      const proof = entry.methods[method].proof;
      statuses[proof.searchStatus] = (statuses[proof.searchStatus] ?? 0) + 1;
      proofs[proof.status] = (proofs[proof.status] ?? 0) + 1;
    }
    return {
      method, role, authoredTotal, authoredDelta: authoredTotal - baselineAuthored,
      pairedTotal, pairedMean: pairedTotal / trials.length, pairedDelta: pairedTotal - baselinePaired,
      wins: scenarios.reduce((sum, scenario) => sum + scenario.wins, 0),
      ties: scenarios.reduce((sum, scenario) => sum + scenario.ties, 0),
      losses: scenarios.reduce((sum, scenario) => sum + scenario.losses, 0),
      gate: role === "candidate" ? { pass: reasons.length === 0, reasons } : null,
      proofCounts: proofs, searchStatuses: statuses, scenarios
    };
  });
  const preference = ["dual-best-fit", "beam-128", "bounded-exact"];
  const eligible = summaries.filter((summary) => summary.gate?.pass).sort((a, b) =>
    a.pairedTotal - b.pairedTotal || a.authoredTotal - b.authoredTotal ||
    preference.indexOf(a.method) - preference.indexOf(b.method));
  const chosen = eligible[0] ?? null;
  return {
    baselineAuthored, baselinePaired, methods: summaries,
    decision: {
      kind: chosen ? "measured-model-improvement" : "rigorous-negative-result",
      selectedMethod: chosen?.method ?? null,
      eligibleMethods: eligible.map((summary) => summary.method),
      authoredBinsSaved: chosen ? baselineAuthored - chosen.authoredTotal : 0,
      pairedBinsSaved: chosen ? baselinePaired - chosen.pairedTotal : 0,
      pairedReductionPercent: chosen ? 100 * (baselinePaired - chosen.pairedTotal) / baselinePaired : 0,
      inference: "Descriptive results on these four synthetic cases only. No population, physical or market inference."
    }
  };
}

function counterexamples(authored, trials, result) {
  const regressions = (cases) => cases.flatMap((entry) =>
    Engine.METHODS.filter((method) => entry.methods[method].count > entry.methods["input-first-fit"].count)
      .map((method) => ({
        caseId: entry.caseId, scenario: entry.scenario, trial: entry.trial ?? 0, method,
        baselineCount: entry.methods["input-first-fit"].count,
        methodCount: entry.methods[method].count,
        extraBins: entry.methods[method].count - entry.methods["input-first-fit"].count
      })));
  const mixed = authored.find((entry) => entry.scenario === "mixed-classroom");
  const bulky = authored.find((entry) => entry.scenario === "bulky-gaps");
  return {
    schema: "local-invention-counterexamples/1",
    knownRegression: {
      caseId: mixed.caseId,
      input: mixed.methods["input-first-fit"].count,
      dominant: mixed.methods["dominant-first-fit"].count,
      volume: mixed.methods["volume-first-fit"].count,
      status: "Known before local freeze; reproduced, not newly discovered."
    },
    unattainableAggregateBound: {
      caseId: bulky.caseId, aggregateLowerBound: bulky.methods["input-first-fit"].lowerBound,
      provenOptimum: bulky.methods["bounded-exact"].proof.optimalBinCount,
      proofMethod: bulky.methods["bounded-exact"].proof.method,
      explanation: "Three indivisible items have volume 6 each. Every pair totals 12 > 10, so each needs its own tote. Aggregate volume only gives ceil(18/10) = 2."
    },
    authoredRegressions: regressions(authored),
    pairedRegressions: regressions(trials),
    unprovenResults: [...authored, ...trials].flatMap((entry) =>
      Engine.METHODS.filter((method) => entry.methods[method].proof.status === "bounded-unknown")
        .map((method) => ({
          caseId: entry.caseId, scenario: entry.scenario, trial: entry.trial ?? 0, method,
          lowerBound: entry.methods[method].lowerBound, upperBound: entry.methods[method].count,
          reason: entry.methods[method].proof.searchStatus
        }))),
    beamFallbacks: [...authored, ...trials].filter((entry) => entry.methods["beam-128"].trace.fallbackUsed)
      .map((entry) => ({
        caseId: entry.caseId, rawBeamCount: entry.methods["beam-128"].trace.rawBeamCount,
        returnedCount: entry.methods["beam-128"].count
      })),
    rejectedCandidates: result.methods.filter((summary) => summary.gate && !summary.gate.pass)
      .map((summary) => ({ method: summary.method, reasons: summary.gate.reasons }))
  };
}

export function runStudy(input = loadInputs()) {
  const { capacity, scenarios, protocol, expected } = input;
  const authored = scenarios.map((scenario) => ({
    caseId: `${scenario.id}/authored`, scenario: scenario.id, trial: 0,
    incomingOrder: scenario.items.map((item) => item.id),
    methods: evaluateCase(scenario, scenario.items.map((item) => item.id), input)
  }));
  const referenceChecks = [];
  for (const entry of authored) {
    const reference = expected.scenarios[entry.scenario];
    const scenario = scenarios.find((value) => value.id === entry.scenario);
    insist(scenario.itemCount === reference.item_count && scenario.lowerBound === reference.lower_bound, "Scenario audit differs from reference data");
    for (const method of input.plan.algorithms) {
      const actual = entry.methods[method].count;
      referenceChecks.push({ scenario: entry.scenario, method, expected: reference[method], actual, pass: actual === reference[method] });
      insist(actual === reference[method], `Reference mismatch: ${entry.scenario}/${method}`);
    }
  }
  const trials = scenarios.flatMap((scenario) =>
    Engine.trialOrders(scenario.items, scenario.id, protocol.permutations.master_seed, protocol.permutations.repetitions_per_scenario)
      .map((trial) => ({
        caseId: `${scenario.id}/trial-${String(trial.trial).padStart(2, "0")}`,
        scenario: scenario.id, trial: trial.trial,
        scenarioSeed: Engine.scenarioSeed(protocol.permutations.master_seed, scenario.id),
        stateBefore: trial.stateBefore, stateAfter: trial.stateAfter, incomingOrder: trial.itemIds,
        methods: evaluateCase(scenario, trial.itemIds, input)
      })));
  const summary = summarize(input, authored, trials);
  const audit = {
    schema: "local-invention-dataset-audit/1", classification: "SYNTHETIC",
    rowCount: scenarios.reduce((sum, scenario) => sum + scenario.rowCount, 0),
    instanceCount: scenarios.reduce((sum, scenario) => sum + scenario.itemCount, 0),
    capacity, scenarios, inputHashes: input.inputHashes,
    checks: { exactSourceBytes: true, idsUniqueWithinScenario: true, allItemsIndividuallyFeasible: true, sourceOrderPreserved: true },
    interpretation: "Integer volume/weight proxies only; shape notes are retained but not solver constraints."
  };
  const result = {
    schema: "local-invention-result/1", id: "04-invention",
    title: "Falsification Lab · Two capacities, no easy claims",
    stage: "work-produced", classification: "SYNTHETIC",
    protocolId: protocol.id, freeze: input.freeze,
    inputHashes: input.inputHashes, implementationHashes: input.implementation,
    execution: {
      engine: "Original JavaScript; no downloaded reference executable imported, copied or run.",
      masterSeed: protocol.permutations.master_seed, repetitionsPerScenario: protocol.permutations.repetitions_per_scenario,
      authoredCases: authored.length, pairedCases: trials.length, methods: Engine.METHODS.length,
      authoredMethodResults: authored.length * Engine.METHODS.length,
      pairedMethodResults: trials.length * Engine.METHODS.length,
      totalAssignmentsVerified: (authored.length + trials.length) * Engine.METHODS.length
    },
    checks: { referenceChecks, allAssignmentsValid: true, completeTrialSet: true, sourceAndProtocolHashesMatch: true },
    ...summary,
    limitations: [
      "Four synthetic scenarios are not a sample of real libraries; descriptive paired means are not population estimates.",
      "The local prospective freeze followed review of supplied data and known baseline expectations; it is not blinded or externally registered.",
      "Original xorshift32 permutations preserve seed 1729 and 20 paired trials but are not a reproduction of unexecuted Python random arrays.",
      "Beam width is capped at 128. Exact search stops above 12 items or at 50000 nodes; unclosed bounds are explicitly unknown.",
      "Scalar feasibility/optimality is not three-dimensional fit, compression, accessibility, kit cohesion, real mass or safe handling.",
      "Physical fit, operator comprehension, time, cost, novelty, intellectual property and demand were not measured.",
      "Fresh-process computational repetition is not independent human replication; no browser or physical UI review is claimed.",
      "Native Hive initialization, owner review, publication, outreach, spending and services were not performed."
    ]
  };
  const failures = counterexamples(authored, trials, result);
  const baselineArtifact = {
    schema: "local-invention-authored-results/1", classification: "SYNTHETIC",
    protocolId: protocol.id, referenceChecks, cases: authored
  };
  const trialArtifact = {
    schema: "local-invention-paired-trials/1", classification: "SYNTHETIC",
    protocolId: protocol.id, permutationProtocol: protocol.permutations, cases: trials
  };
  const snapshot = {
    schema: "local-invention-offline-snapshot/1", audit, result,
    authored, trials, counterexamples: failures,
    sources: input.sources, protocol, freeze: input.freeze
  };
  return {
    "evidence/dataset-audit.json": jsonText(audit),
    "evidence/baseline.json": jsonText(baselineArtifact),
    "evidence/trials.json": jsonText(trialArtifact),
    "evidence/counterexamples.json": jsonText(failures),
    "evidence/result.json": jsonText(result),
    "evidence/snapshot.js": `/* Generated DATA from original local algorithms. Not downloaded executable code. */\nglobalThis.INVENTION_SNAPSHOT = ${JSON.stringify(snapshot).replaceAll("<", "\\u003c")};\n`
  };
}

export function independentAssignmentAudit(artifacts) {
  const audit = JSON.parse(artifacts["evidence/dataset-audit.json"]);
  const cases = [
    ...JSON.parse(artifacts["evidence/baseline.json"]).cases,
    ...JSON.parse(artifacts["evidence/trials.json"]).cases
  ];
  let checked = 0;
  for (const entry of cases) {
    const scenario = audit.scenarios.find((value) => value.id === entry.scenario);
    const lookup = Object.fromEntries(scenario.items.map((item) => [item.id, item]));
    const expectedIds = Object.keys(lookup).sort();
    for (const [method, packed] of Object.entries(entry.methods)) {
      insist(method === packed.method, "Method identity mismatch");
      insist(JSON.stringify(entry.incomingOrder) === JSON.stringify(packed.incomingOrder), "Unpaired method input");
      const ids = packed.bins.flatMap((bin) => bin.itemIds).sort();
      insist(JSON.stringify(ids) === JSON.stringify(expectedIds), `Independent exactly-once failure: ${entry.caseId}/${method}`);
      insist(packed.count === packed.bins.length, "Bin count mismatch");
      for (const bin of packed.bins) {
        const volume = bin.itemIds.reduce((sum, id) => sum + lookup[id].volume, 0);
        const weight = bin.itemIds.reduce((sum, id) => sum + lookup[id].weight, 0);
        insist(bin.itemIds.length > 0 && volume <= audit.capacity.volume_units && weight <= audit.capacity.weight_units, "Independent capacity failure");
        insist(bin.volume === volume && bin.weight === weight, "Independent load mismatch");
        insist(bin.remainingVolume === audit.capacity.volume_units - volume && bin.remainingWeight === audit.capacity.weight_units - weight, "Independent slack mismatch");
      }
      const lower = Math.max(
        Math.ceil(scenario.items.reduce((sum, item) => sum + item.volume, 0) / audit.capacity.volume_units),
        Math.ceil(scenario.items.reduce((sum, item) => sum + item.weight, 0) / audit.capacity.weight_units)
      );
      insist(packed.lowerBound === lower && packed.count >= lower, "Independent lower-bound failure");
      if (packed.proof.status === "proven-model-optimum") {
        insist(packed.count === lower || (method === "bounded-exact" && packed.trace.status === "exhausted"), "Unsupported proof label");
      } else insist(packed.proof.optimalBinCount === null, "Unknown result claims an optimum");
      checked += 1;
    }
  }
  insist(cases.length === 84 && checked === 504, "Missing cases or methods");
  return { checked, errors: 0, verifier: "Separate traversal of serialized IDs and input loads, not solver validation flags." };
}
