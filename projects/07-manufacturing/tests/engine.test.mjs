import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import "../engine.js";
import "../archive.js";
import { outputs, parseCSV, project, replaySynthetic } from "../tools/generate.mjs";

const E = globalThis.Stackline;
const A = globalThis.StacklineArchive;
const root = path.resolve(project, "../..");
const read = (relative) => fs.readFileSync(path.join(project, relative), "utf8");
const load = (relative) => JSON.parse(read(relative));
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test("baseline dimensions and material values match attributed inert data", () => {
  const source = load("data/seed/parameters.json");
  const map = { insert_height: "insertHeight" };
  for (const [key, value] of Object.entries(source.dimensions)) assert.equal(E.BASE[map[key] || key], value);
  assert.equal(E.ASSUMPTIONS.densityGCM3, Number(source.material_density_g_cm3));
  const m = E.model(E.BASE);
  assert.deepEqual(m.innerMM, [174, 94, 29]);
  assert.deepEqual(m.insertMM, [171, 91, 20]);
  assert.deepEqual(m.offsetMM, [4.5, 4.5, 3]);
  assert.equal(m.trayVolumeMM3, 101676);
  assert.equal(m.insertVolumeMM3, 20640);
  close(m.economics.solidMassG, 151.67184);
});

test("the original effort and cost model reproduces the synthetic baseline", () => {
  const costs = Object.fromEntries(parseCSV(read("data/seed/cost-assumptions.csv")).map((r) => [r.key, Number(r.value)]));
  const m = E.model(E.BASE);
  assert.equal(E.ASSUMPTIONS.feedstockUSDPerKG, costs.feedstock_usd_per_kg);
  assert.equal(E.ASSUMPTIONS.scrapFraction, costs.scrap_fraction);
  assert.equal(E.ASSUMPTIONS.benchUSDPerHour, costs.bench_usd_per_hour);
  assert.equal(E.ASSUMPTIONS.packagingUSD, costs.packaging_usd_per_kit);
  assert.equal(E.ASSUMPTIONS.overheadUSD, costs.overhead_usd_per_kit);
  assert.equal(m.handling.minutes, costs.bench_minutes_per_kit);
  assert.equal(m.economics.displayedUnitUSD, "7.61");
  assert.equal(m.economics.displayedBatchUSD, "152.13");
  assert.notEqual((Number(m.economics.displayedUnitUSD) * 20).toFixed(2), m.economics.displayedBatchUSD);
});

for (const preset of E.PRESETS) {
  test(`${preset.id}: both solids have paired oriented edges, expected topology, volume and dimensions`, () => {
    const m = E.model(preset.params);
    assert.deepEqual(E.validate(preset.params), []);
    for (const part of ["tray", "insert"]) {
      const mesh = m.meshChecks[part];
      assert.equal(mesh.closedOrientedEdges, true);
      assert.equal(mesh.unpairedEdges, 0);
      assert.equal(mesh.orientationErrors, 0);
      assert.equal(mesh.degenerate, 0);
      close(mesh.signedVolumeMM3, part === "tray" ? m.trayVolumeMM3 : m.insertVolumeMM3);
      assert.deepEqual(mesh.boundsMM.min, [0, 0, 0]);
      assert.deepEqual(mesh.boundsMM.size, part === "tray" ? [m.params.width, m.params.depth, m.params.height] : m.insertMM);
      assert.equal(mesh.eulerCharacteristic, part === "tray" ? 2 : 2 - 2 * (m.params.bays - 2));
    }
    assert.equal(m.pack.pass, true);
    assert.ok(m.bays.every((b) => b.width >= 12 && b.depth >= 20));
    close(m.bays.reduce((sum, b) => sum + b.width, 0) + (m.params.bays - 1) * m.params.rib, m.insertMM[0]);
  });
}

test("insert nominal gaps are noninterfering at all four walls with a floor contact only", () => {
  for (const preset of E.PRESETS) {
    const m = E.model(preset.params), p = m.params;
    close(m.offsetMM[0] - p.wall, p.clearance);
    close(m.offsetMM[1] - p.wall, p.clearance);
    close(p.width - p.wall - (m.offsetMM[0] + m.insertMM[0]), p.clearance);
    close(p.depth - p.wall - (m.offsetMM[1] + m.insertMM[1]), p.clearance);
    assert.equal(m.offsetMM[2], p.floor);
    assert.ok(m.rimRecessMM >= 2);
    for (const box of m.boxes.insert) {
      assert.ok(box.min.every((value, i) => value < box.max[i]));
      assert.ok(box.min.every((value) => value >= 0));
      assert.ok(box.max.every((value, i) => value <= m.insertMM[i] + 1e-6));
    }
  }
});

test("changing parameters alters exported coordinates and preserves dimensional units", () => {
  const a = E.model(E.BASE);
  const b = E.model({ ...E.BASE, width: 187.125, depth: 110.75, floor: 3.6, insertHeight: 22.25, rib: 2.125 });
  assert.notEqual(E.stl(a, "tray"), E.stl(b, "tray"));
  assert.deepEqual(b.meshChecks.tray.boundsMM.size, [187.125, 110.75, 32]);
  close(b.meshChecks.tray.signedVolumeMM3, b.trayVolumeMM3);
  close(b.meshChecks.insert.signedVolumeMM3, b.insertVolumeMM3);
  const p = JSON.parse(E.parameterJSON(b));
  assert.equal(p.units, "mm");
  assert.equal(p.parameters.width, 187.125);
  assert.deepEqual(p.assembledInsertTranslationMM, [4.5, 4.5, 3.6]);
});

test("all numeric parameters reject missing, string, NaN and infinity inputs", () => {
  for (const key of Object.keys(E.LIMITS)) {
    for (const value of [undefined, null, "", "180", NaN, Infinity, -Infinity]) {
      const p = { ...E.BASE, [key]: value };
      assert.ok(E.validate(p).some((error) => error.field === key), `${key}=${value}`);
      assert.throws(() => E.model(p), RangeError);
    }
  }
  assert.ok(E.validate(null).length > 0);
});

test("range, layout, integer and small-bay constraints cannot produce negative geometry", () => {
  for (const [field, [min, max]] of Object.entries(E.LIMITS)) {
    for (const value of [min - 0.01, max + 0.01]) {
      assert.ok(E.validate({ ...E.BASE, [field]: value }).some((e) => e.field === field));
    }
  }
  assert.ok(E.validate({ ...E.BASE, bays: 2.5 }).some((e) => e.field === "bays"));
  assert.ok(E.validate({ ...E.BASE, layout: '<svg onload="bad()">' }).some((e) => e.field === "layout"));
  assert.ok(E.validate({ ...E.BASE, height: 18 }).some((e) => e.field === "insertHeight"));
  assert.ok(E.validate({ ...E.BASE, width: 100, wall: 8, clearance: 3, rib: 6, bays: 5 }).some((e) => e.field === "bays"));
  assert.ok(E.validate({ ...E.BASE, depth: 60, wall: 8, clearance: 3, rib: 6, width: 200, bays: 3 }).length === 0);
  assert.equal(E.validate({ ...E.BASE, height: 25 }).length, 0);
  assert.ok(E.validate({ ...E.BASE, height: 24.99 }).some((e) => e.field === "insertHeight"));
});

test("deterministic parameter sweep preserves closed mesh and analytic volume", () => {
  let checked = 0;
  for (let i = 0; i < 180; i++) {
    const p = {
      ...E.BASE,
      width: 100 + ((i * 73) % 320) / 2,
      depth: 60 + ((i * 31) % 240) / 2,
      height: 26 + i % 30,
      floor: 2 + (i % 7) / 2,
      wall: 2 + (i % 10) / 2,
      rib: 1.5 + (i % 6) / 2,
      clearance: 0.5 + (i % 6) / 2,
      insertHeight: 8 + i % 14,
      bays: 2 + i % 4, layout: i % 2 ? "even" : "card-token"
    };
    if (E.validate(p).length) continue;
    const m = E.model(p);
    for (const part of ["tray", "insert"]) {
      assert.ok(m.meshChecks[part].closedOrientedEdges, `${i}/${part}`);
      close(m.meshChecks[part].signedVolumeMM3, part === "tray" ? m.trayVolumeMM3 : m.insertVolumeMM3, 1e-4);
    }
    checked++;
  }
  assert.ok(checked >= 120, `${checked} accepted parameter cases`);
});

test("Pocket Arcade contains the assumed payload but correctly holds too-small custom bays", () => {
  const m = E.model(E.PRESETS[2].params);
  close(m.bays[0].width, 91.85);
  close(m.bays[1].width, 37.575);
  assert.equal(m.bays[0].depth, 87);
  assert.equal(m.payload.pass, true);
  const small = E.model({ ...E.PRESETS[2].params, width: 140 });
  assert.equal(small.payload.pass, false);
  assert.equal(small.payload.cardFit, false);
  assert.equal(small.payload.applicable, true);
  assert.equal(E.model(E.BASE).payload.applicable, false);
  assert.match(m.payload.note, /untested/);
});

test("packing includes both-side padding and packaging mass, and holds the 196 mm request", () => {
  const source = load("data/seed/pack-spec.json");
  assert.equal(E.ASSUMPTIONS.pack.width, source.internal_mm.width);
  assert.equal(E.ASSUMPTIONS.pack.depth, source.internal_mm.depth);
  assert.equal(E.ASSUMPTIONS.pack.height, source.internal_mm.height);
  assert.equal(E.ASSUMPTIONS.pack.massG, source.packaging_mass_g);
  assert.equal(E.ASSUMPTIONS.pack.padding, source.padding_each_side_mm);
  const m = E.model(E.BASE);
  assert.deepEqual(m.pack.packedMM, [184, 104, 36]);
  close(m.pack.packedMassG, m.economics.solidMassG + 25);
  const wide = E.model({ ...E.BASE, width: 196 });
  assert.equal(wide.pack.pass, false);
  assert.equal(wide.pack.packedMM[0], 200);
  assert.equal(wide.pack.marginsMM[0], -8);
  assert.equal(E.model({ ...E.BASE, width: 188 }).pack.pass, true);
  assert.equal(E.model({ ...E.BASE, width: 188.1 }).pack.pass, false);
  assert.equal(E.model({ ...E.BASE, depth: 110 }).pack.pass, false);
  assert.equal(E.model({ ...E.BASE, height: 40 }).pack.pass, false);
});

test("material and effort estimates have explicit monotonic sensitivity", () => {
  const m = E.model(E.BASE);
  const scenarios = E.report(m).sensitivity;
  assert.ok(scenarios[0].unitUSD < scenarios[1].unitUSD && scenarios[1].unitUSD < scenarios[2].unitUSD);
  assert.ok(m.economics.grossFeedstockG > m.economics.solidMassG);
  assert.equal(E.effort({ ...E.BASE, bays: 2 }).seconds, 340);
  assert.equal(E.effort({ ...E.BASE, layout: "card-token" }).seconds, 405);
  assert.equal(m.handling.fabricationTimeIncluded, false);
  assert.match(m.handling.classification, /not time-study evidence/);
});

test("inert gauge fixtures replay to exactly 3 pass and 2 explained holds", () => {
  const samples = parseCSV(read("data/seed/inspection-samples.csv"));
  const limits = parseCSV(read("data/seed/dimensions.csv"));
  const result = replaySynthetic(samples, limits);
  assert.deepEqual(result.map((r) => r.status), ["PASS", "PASS", "HOLD", "HOLD", "PASS"]);
  assert.deepEqual(result[2].failures, ["tray_width_mm"]);
  assert.deepEqual(result[3].failures, ["side_clearance_mm"]);
  const boundary = { ...samples[0], tray_width_mm: "179.5", tray_depth_mm: "100.5", tray_height_mm: "31.5", inner_width_mm: "173", insert_width_mm: "171" };
  assert.equal(replaySynthetic([boundary], limits)[0].status, "PASS");
  assert.equal(replaySynthetic([{ ...boundary, edge_pass: "0" }], limits)[0].status, "HOLD");
  assert.equal(replaySynthetic([{ ...boundary, tray_width_mm: "NaN" }], limits)[0].status, "HOLD");
  assert.ok(result.every((r) => r.unmeasured.includes("squareness")));
});

test("BOM exports exactly two nonnegative correctly dimensioned parts", () => {
  for (const preset of E.PRESETS) {
    const m = E.model(preset.params);
    const bom = parseCSV(E.bomCSV(m));
    assert.equal(bom.length, 2);
    assert.deepEqual(bom.map((r) => r.part_id), ["tray", "insert"]);
    assert.ok(bom.every((r) => r.quantity === "1"));
    close(bom.reduce((sum, r) => sum + Number(r.solid_volume_mm3), 0), m.volumeMM3);
    close(bom.reduce((sum, r) => sum + Number(r.modeled_mass_g), 0), m.economics.solidMassG);
  }
});

test("STL normals and serialized vertices describe the model without unit conversion", () => {
  const m = E.model(E.BASE);
  for (const part of ["tray", "insert"]) {
    const text = E.stl(m, part);
    const triangles = [...text.matchAll(/vertex ([^\n]+)/g)].map((match) => match[1].trim().split(" ").map(Number));
    assert.equal(triangles.length, m.meshes[part].triangles.length * 3);
    assert.ok(triangles.flat().every(Number.isFinite));
    assert.match(text, /^solid stackline_\w+_nominal_mm\n/);
    assert.match(text, /endsolid stackline_\w+_nominal_mm\n$/);
  }
  assert.throws(() => E.stl(m, "assembly"), RangeError);
});

test("drawing declares millimetres, scale bar, nominal dimensions, and review-only boundary", () => {
  const m = E.model(E.BASE);
  const svg = E.drawingSVG(m);
  assert.match(svg, /width="297mm"/);
  assert.match(svg, /viewBox="0 0 297 /);
  assert.match(svg, /50 mm scale bar/);
  assert.match(svg, /180 mm/);
  assert.match(svg, /171 mm/);
  assert.match(svg, /not a cut template/i);
  assert.notEqual(E.previewSVG(m), E.previewSVG(m, { exploded: true }));
  assert.match(E.previewSVG(m), /<title>/);
});

test("isometric SVG visibility agrees with independent box-ray intersections", () => {
  const palette = { tray: ["#a78a64", "#cfb58d", "#e5d3b1"], insert: ["#2e8279", "#57ac9e", "#91d9c5"] };
  const colors = Object.values(palette).flat();
  let compared = 0;
  for (const preset of E.PRESETS) {
    for (const exploded of [false, true]) {
      const m = E.model(preset.params);
      const offset = [...m.offsetMM];
      if (exploded) offset[2] += m.params.height + 10;
      const boxes = Object.entries(m.boxes).flatMap(([part, boxes]) => boxes.map((b) => ({
        part,
        min: b.min.map((v, a) => v + (part === "insert" ? offset[a] : 0)),
        max: b.max.map((v, a) => v + (part === "insert" ? offset[a] : 0))
      })));
      const svg = E.previewSVG(m, { exploded, payload: false });
      const polygons = [...svg.matchAll(/<polygon points="([^"]+)" fill="([^"]+)"/g)]
        .filter((match) => colors.includes(match[2]))
        .map((match) => ({ points: match[1].split(" ").map((p) => p.split(",").map(Number)), color: match[2] }));
      const points = polygons.flatMap((p) => p.points);
      const minX = Math.min(...points.map((p) => p[0])), maxX = Math.max(...points.map((p) => p[0]));
      const minY = Math.min(...points.map((p) => p[1])), maxY = Math.max(...points.map((p) => p[1]));
      for (let i = 0; i < 24; i++) {
        for (let j = 0; j < 22; j++) {
          const u = minX + (maxX - minX) * (i + 0.381) / 24;
          const v = minY + (maxY - minY) * (j + 0.617) / 22;
          let painted = null, boundary = false;
          for (const polygon of polygons) {
            const sides = polygon.points.map((a, k) => {
              const b = polygon.points[(k + 1) % polygon.points.length];
              return ((b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
            });
            if (sides.every((s) => s >= -0.01) || sides.every((s) => s <= 0.01)) {
              if (sides.some((s) => Math.abs(s) < 0.01)) boundary = true;
              painted = polygon.color;
            }
          }
          if (boundary) continue;
          const base = [u / 1.72, -u / 1.72, -v], direction = [1, 1, 0.84];
          let distance = -Infinity, expected = null;
          for (const b of boxes) {
            const enter = Math.max(...b.min.map((c, a) => (c - base[a]) / direction[a]));
            const exits = b.max.map((c, a) => (c - base[a]) / direction[a]);
            const exit = Math.min(...exits);
            if (enter <= exit && exit > distance) {
              distance = exit;
              expected = palette[b.part][exits.indexOf(exit)];
            }
          }
          assert.equal(painted, expected, `${preset.id}/${exploded ? "exploded" : "assembled"} at ${u},${v}`);
          if (expected) compared++;
        }
      }
    }
  }
  assert.ok(compared > 1000, `${compared} interior rays compared`);
});

test("review and inspection artifacts cannot be mistaken for measured physical outcomes", () => {
  const m = E.model(E.PRESETS[2].params);
  const report = E.report(m);
  assert.deepEqual(report.physicalTestsPerformed, []);
  assert.ok(report.limitations.some((l) => l.includes("No material")));
  const inspection = parseCSV(E.inspectionCSV(m));
  assert.ok(inspection.every((row) => row.status === "NOT PERFORMED"));
  assert.ok(inspection.every((row) => Number(row.lower) <= Number(row.nominal) && Number(row.nominal) <= Number(row.upper)));
  assert.ok(inspection.some((row) => row.feature === "depth_side_gap_centered"));
  assert.match(E.assemblyText(m), /Twenty hypothetical kits; no fabrication authorized/);
});

test("original ZIP implementation matches standard CRC vector and deterministic headers", () => {
  assert.equal(A.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const files = A.reviewFiles(E, E.model(E.BASE));
  const a = A.zip(files), b = A.zip(files);
  assert.deepEqual(a, b);
  assert.equal(new DataView(a.buffer).getUint32(0, true), 0x04034b50);
  assert.throws(() => A.zip({ "../escape.txt": "no" }), RangeError);
  assert.throws(() => A.zip({ "/absolute.txt": "no" }), RangeError);
  assert.match(files["THIRD-PARTY-NOTICES.txt"], /Permission is hereby granted/);
  assert.match(files["THIRD-PARTY-NOTICES.txt"], /Copyright \(c\) 2026 Hive Hub contributors/);
});

test("copied inert files and all reviewed reference hashes match parent verification", () => {
  const provenance = load("data/source-provenance.json");
  const parentBytes = fs.readFileSync(path.join(root, provenance.parentEvidence));
  assert.equal(crypto.createHash("sha256").update(parentBytes).digest("hex"), provenance.parentEvidenceSHA256);
  const seed = JSON.parse(parentBytes).seeds.find((s) => s.slug === provenance.seedSlug);
  const verified = Object.fromEntries(seed.verifiedFiles.map((r) => [r.path, r]));
  assert.equal(provenance.seedRef, seed.seedRef);
  assert.equal(provenance.records.length, 30);
  for (const row of provenance.records) {
    assert.equal(row.sha256, verified[row.seedPath].sha256);
    assert.equal(row.bytes, verified[row.seedPath].bytes);
    if (row.localPath) {
      const data = fs.readFileSync(path.join(root, row.localPath));
      assert.equal(data.length, row.bytes);
      assert.equal(crypto.createHash("sha256").update(data).digest("hex"), row.sha256);
      assert.ok(!/\.(js|py|scad|svg)$/.test(row.localPath));
    }
  }
});

test("all generated files match fresh in-memory generation byte for byte", () => {
  for (const [relative, content] of outputs()) {
    const actual = fs.readFileSync(path.join(project, relative));
    assert.ok(actual.equals(Buffer.from(content)), relative);
  }
});

test("manifest has scoped paths, concrete artifacts and reproducible root argv checks", () => {
  const manifest = load("manifest.json");
  assert.equal(manifest.id, "07-manufacturing");
  assert.equal(manifest.seedSlug, "micro-manufacturing-company");
  assert.equal(manifest.stage, "work-produced");
  assert.equal(manifest.entrypoint, "projects/07-manufacturing/index.html");
  assert.ok(manifest.checks.every((argv) => Array.isArray(argv) && argv.length > 1));
  assert.ok(manifest.artifacts.length >= 20);
  for (const artifact of manifest.artifacts) {
    assert.ok(artifact.startsWith("projects/07-manufacturing/"));
    assert.ok(!artifact.includes(".."));
    if (!artifact.endsWith("/evidence/result.json")) assert.ok(fs.existsSync(path.join(root, artifact)), artifact);
  }
  assert.ok(manifest.limitations.some((l) => /physical/i.test(l)));
});
