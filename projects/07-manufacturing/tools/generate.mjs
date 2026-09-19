import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import "../engine.js";
import "../archive.js";

const E = globalThis.Stackline;
const A = globalThis.StacklineArchive;
export const project = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(project, relative), "utf8");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function parseCSV(text) {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const columns = header.split(",");
  return rows.map((row) => Object.fromEntries(row.split(",").map((value, i) => [columns[i], value])));
}

export function replaySynthetic(samples, limits) {
  const gates = Object.fromEntries(limits.map((row) => [row.feature_id, row]));
  return samples.map((row) => {
    const values = {
      tray_width_mm: Number(row.tray_width_mm),
      tray_depth_mm: Number(row.tray_depth_mm),
      tray_height_mm: Number(row.tray_height_mm),
      side_clearance_mm: (Number(row.inner_width_mm) - Number(row.insert_width_mm)) / 2
    };
    const failures = Object.entries(values).filter(([feature, value]) =>
      !Number.isFinite(value) || value < Number(gates[feature].lower_mm) || value > Number(gates[feature].upper_mm)
    ).map(([feature]) => feature);
    if (row.edge_pass !== "1") failures.push("edge_pass");
    return {
      sampleId: row.sample_id, classification: "SYNTHETIC fixture, not a physical measurement",
      values, status: failures.length ? "HOLD" : "PASS", failures,
      unmeasured: ["depth-side clearance", "individual actual gaps", "squareness", "stability", "retrieval", "material suitability"]
    };
  });
}

export function outputs() {
  const files = new Map();
  const add = (name, content) => files.set(name, content);
  const source = {
    "source/engine.js": read("engine.js"),
    "source/archive.js": read("archive.js"),
    "source/source-provenance.json": read("data/source-provenance.json"),
    "source/seed-LICENSE.txt": read("data/seed/LICENSE"),
    "source/README.md": read("README.md")
  };
  const comparisons = [];
  for (const preset of E.PRESETS) {
    const m = E.model(preset.params);
    const reviewFiles = A.reviewFiles(E, m);
    for (const [name, content] of Object.entries(reviewFiles)) add(`generated/${preset.id}/${name}`, content);
    add(`generated/${preset.id}/review-bundle.zip`, A.zip({ ...reviewFiles, ...source }));
    comparisons.push({
      id: preset.id, title: preset.title, units: "mm", envelopeMM: [m.params.width, m.params.depth, m.params.height],
      bays: m.params.bays, parts: 2, volumeMM3: m.volumeMM3, solidMassG: m.economics.solidMassG,
      grossFeedstockG: m.economics.grossFeedstockG, modeledBenchMinutes: m.handling.minutes,
      syntheticUnitUSD: m.economics.displayedUnitUSD, syntheticTwentyKitUSD: m.economics.displayedBatchUSD,
      pack: m.pack, payload: m.payload,
      deltaVolumeFromBaselinePercent: (m.volumeMM3 / E.model(E.BASE).volumeMM3 - 1) * 100
    });
  }
  add("generated/comparison.json", json({
    classification: "SYNTHETIC estimates / original three-configuration digital comparison",
    method: {
      mass: "g = volume_mm3 / 1000 * assumed_density_g_cm3",
      grossFeedstock: "solid_mass_g / (1 - assumed_scrap_fraction)",
      bench: "300 fixed seconds + 20 seconds per bay + 45 seconds for card-token layout; no time study or fabrication time",
      costs: "gross feedstock kg * 24 USD/kg + bench hours * 22 USD/h + 0.35 packaging + 1.10 overhead",
      rounding: "Round the unrounded unit total and twenty-kit aggregate independently to two decimal places."
    },
    configurations: comparisons, assumptions: E.ASSUMPTIONS, limitations: E.PHYSICAL_LIMITS
  }));

  const baseline = E.model(E.BASE);
  const wide = E.model({ ...E.BASE, width: 196 });
  add("generated/width-change-review.json", json({
    changeId: "wide-note-request", source: "data/seed/change-request.json",
    classification: "SYNTHETIC change-impact exercise; not approved or physically implemented",
    decision: "HOLD", reason: "196 + 2*2 = 200 mm exceeds the 192 mm pack interior by 8 mm.",
    baseline: E.report(baseline), proposal: E.report(wide),
    delta: {
      trayVolumeMM3: wide.trayVolumeMM3 - baseline.trayVolumeMM3,
      insertVolumeMM3: wide.insertVolumeMM3 - baseline.insertVolumeMM3,
      solidMassG: wide.economics.solidMassG - baseline.economics.solidMassG,
      syntheticUnroundedUnitUSD: wide.economics.unitUSD - baseline.economics.unitUSD
    },
    reopenSeedTasks: [
      "freeze-desk-use", "verify-parametric-fit", "bound-material-assumptions", "plan-dry-assembly",
      "define-inspection-gates", "replay-inspection-samples", "check-pack-envelope",
      "calculate-pilot-economics", "trace-width-change", "decide-pilot-hold"
    ],
    inspection: "New proposed width range 195.5–196.5 mm, not validated. Baseline synthetic readings do not apply.",
    recommendation: "Retain baseline-only digital investigation; revise design or pack and review again before any separately authorized physical work.",
    physicalChecksPerformed: []
  }));

  const samples = replaySynthetic(parseCSV(read("data/seed/inspection-samples.csv")), parseCSV(read("data/seed/dimensions.csv")));
  add("generated/synthetic-inspection.json", json({
    classification: "SYNTHETIC fixture replay only; no samples exist as a result of this project",
    pass: samples.filter((s) => s.status === "PASS").length,
    hold: samples.filter((s) => s.status === "HOLD").length, rows: samples,
    scope: "Only the baseline dimensions and authored edge flags are classified. Unmeasured characteristics remain unverified."
  }));
  add("generated/seed-review.json", json({
    seedSlug: "micro-manufacturing-company",
    scope: "Read-only seed task/scope review; no native task claims, organization, registration, SDK, CAD renderer, or downloaded starter execution.",
    baseline: {
      trayInteriorMM: baseline.innerMM.slice(0, 2), insertFootprintMM: baseline.insertMM.slice(0, 2),
      trayVolumeMM3: baseline.trayVolumeMM3, insertVolumeMM3: baseline.insertVolumeMM3,
      nominalSideGapMM: E.BASE.clearance, solidMassG: baseline.economics.solidMassG,
      syntheticUnitUSD: baseline.economics.displayedUnitUSD, syntheticTwentyKitUSD: baseline.economics.displayedBatchUSD,
      dimensionsAndVolumesMatchInertTaskBoard: true,
      originalSCADExecutedOrCertified: false
    },
    inspectionExercise: { pass: 3, hold: 2, report: "generated/synthetic-inspection.json" },
    changeRequest: { widthMM: 196, decision: "HOLD", report: "generated/width-change-review.json" },
    roleScopeResponse: [
      { team: "industrial-design", artifact: "README.md", disposition: "Dry lightweight desk envelope, three nominal configurations, future pilot only." },
      { team: "engineering", artifact: "engine.js", disposition: "Original parametric solid geometry and dimension/fit reports; no downloaded reference execution." },
      { team: "sourcing", artifact: "generated/stackline/review.json", disposition: "Density/price/yield low/base/high synthetic sensitivity; no vendors or purchasing." },
      { team: "production-planning", artifact: "generated/stackline/assembly.txt", disposition: "Prospective reversible twenty-kit sequence; no process settings." },
      { team: "quality", artifact: "generated/synthetic-inspection.json", disposition: "Three passing and two held synthetic rows; proposed future inspections separate." },
      { team: "logistics", artifact: "generated/width-change-review.json", disposition: "All-axis padding and packaging mass modeled; wider proposal held." },
      { team: "finance", artifact: "generated/comparison.json", disposition: "Baseline 7.61 USD unit / 152.13 USD twenty-kit aggregate; wholly hypothetical." }
    ],
    physicallyAccepted: false, limitations: E.PHYSICAL_LIMITS
  }));

  const artifacts = [...files].map(([name, value]) => ({
    path: `projects/07-manufacturing/${name}`,
    bytes: typeof value === "string" ? Buffer.byteLength(value) : value.length, sha256: hash(value)
  }));
  add("generated/artifact-index.json", json({
    schema: "stackline-artifact-index/1", generatorVersion: E.VERSION,
    deterministic: true, timestamps: "none in generated content; ZIP DOS dates fixed to 1980-01-01",
    sourceHashes: Object.fromEntries(["engine.js", "archive.js", "README.md", "tools/generate.mjs"].map((p) => [p, hash(read(p))])),
    artifacts
  }));
  return files;
}

export function regenerate(check = false) {
  const files = outputs();
  const mismatches = [];
  for (const [name, value] of files) {
    const full = path.join(project, name);
    const expected = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
    if (check) {
      if (!fs.existsSync(full) || !fs.readFileSync(full).equals(expected)) mismatches.push(name);
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, expected);
    }
  }
  if (mismatches.length) throw new Error(`Stale/missing artifacts:\n${mismatches.join("\n")}`);
  return files.size;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--write", "--check"].includes(args[0])) {
    console.error("Usage: node projects/07-manufacturing/tools/generate.mjs --write|--check");
    process.exitCode = 2;
  } else {
    const count = regenerate(args[0] === "--check");
    console.log(`${args[0] === "--check" ? "Verified deterministic bytes of" : "Generated"} ${count} original review artifacts across 3 configurations.`);
  }
}
