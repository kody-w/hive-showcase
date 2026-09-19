(function (root) {
  "use strict";

  const VERSION = "1.0.0";
  const BASE = Object.freeze({
    width: 180, depth: 100, height: 32, wall: 3, floor: 3,
    clearance: 1.5, insertHeight: 20, rib: 2, bays: 3, layout: "even"
  });
  const PRESETS = Object.freeze([
    Object.freeze({
      id: "stackline", title: "Stackline", label: "The everyday original",
      description: "Three equal bays for dry desk essentials. Reproduces the synthetic seed's nominal volumes.",
      params: BASE
    }),
    Object.freeze({
      id: "compact", title: "Compact", label: "Less desk. Less material.",
      description: "A smaller two-bay companion with the same loose, reversible drop-in interface.",
      params: Object.freeze({ ...BASE, width: 140, depth: 90, height: 28, insertHeight: 18, bays: 2 })
    }),
    Object.freeze({
      id: "pocket-arcade", title: "Pocket Arcade", label: "Cards meet counters",
      description: "One generous card bay and two token bays. Original extension; payload sizes are assumptions.",
      params: Object.freeze({ ...BASE, height: 28, insertHeight: 18, layout: "card-token" })
    })
  ]);
  const LIMITS = Object.freeze({
    width: [100, 260], depth: [60, 180], height: [18, 60],
    wall: [2, 8], floor: [2, 8], clearance: [0.5, 3],
    insertHeight: [8, 50], rib: [1.5, 6], bays: [2, 5]
  });
  const ASSUMPTIONS = Object.freeze({
    classification: "SYNTHETIC / modeled; not a quotation or time study",
    densityGCM3: 1.24, feedstockUSDPerKG: 24, scrapFraction: 0.08,
    benchUSDPerHour: 22, packagingUSD: 0.35, overheadUSD: 1.10,
    planningQuantity: 20,
    pack: Object.freeze({ width: 192, depth: 112, height: 42, padding: 2, massG: 25, maxMassG: 250 }),
    payload: Object.freeze({ cardWidth: 88, cardDepth: 63, cardStackHeight: 12, tokenDiameter: 20, edgeAllowance: 1 })
  });
  const PHYSICAL_LIMITS = Object.freeze([
    "No material has been selected, purchased, printed, fabricated, handled, inspected, or shipped.",
    "STL files contain nominal millimetre coordinates but STL itself has no unit metadata. Import explicitly as mm.",
    "Solid-volume mass is not a slicer estimate: no infill, supports, shrinkage, machine time, or process settings are modeled.",
    "Clearance is a loose, centered design assumption, not a validated tolerance or friction fit. The insert is not retained.",
    "The open-ended ladder and 1.5 mm nominal surrounding gap do not seal small tokens into bays.",
    "Dimensions, strength, material suitability, surface finish, stability, handling time, and transit behavior require future physical review.",
    "Lightweight dry desk items only; no food, heated items, electrical, medical, child-safety, or load-bearing uses.",
    "Packaging and costs are synthetic scenarios. Digital passes grant no fabrication, spending, shipment, or native Hive authority."
  ]);

  function number(n, digits = 3) {
    return String(Number(n.toFixed(digits)));
  }

  function escapeXML(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
    })[c]);
  }

  function validate(p) {
    const errors = [];
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      if (typeof p?.[key] !== "number" || !Number.isFinite(p[key])) {
        errors.push({ field: key, message: `${key} must be a finite number.` });
      } else if (p[key] < min || p[key] > max) {
        errors.push({ field: key, message: `${key} must be between ${min} and ${max}${key === "bays" ? "" : " mm"}.` });
      }
    }
    if (Number.isFinite(p?.bays) && !Number.isInteger(p.bays)) {
      errors.push({ field: "bays", message: "Bay count must be a whole number." });
    }
    if (!["even", "card-token"].includes(p?.layout)) {
      errors.push({ field: "layout", message: "Choose an equal-bay or card-and-token layout." });
    }
    if (errors.length) return errors;
    if (p.floor + p.insertHeight + 2 > p.height) {
      errors.push({ field: "insertHeight", message: "Insert height + floor + 2 mm rim recess must not exceed outer height." });
    }
    const insertWidth = p.width - 2 * (p.wall + p.clearance);
    const insertDepth = p.depth - 2 * (p.wall + p.clearance);
    const usableWidth = insertWidth - (p.bays - 1) * p.rib;
    const fractions = bayFractions(p);
    if (usableWidth <= 0 || fractions.some((f) => f * usableWidth < 12)) {
      errors.push({ field: "bays", message: "Every clear bay must be at least 12 mm wide; enlarge the tray or reduce bays/ribs." });
    }
    if (insertDepth - 2 * p.rib < 20) {
      errors.push({ field: "depth", message: "Usable bay depth must be at least 20 mm after walls, gaps, and rails." });
    }
    return errors;
  }

  function bayFractions(p) {
    return p.layout === "card-token"
      ? [0.55, ...Array(p.bays - 1).fill(0.45 / (p.bays - 1))]
      : Array(p.bays).fill(1 / p.bays);
  }

  function box(x0, y0, z0, x1, y1, z1) {
    return { min: [x0, y0, z0], max: [x1, y1, z1] };
  }

  // A shared coordinate lattice splits every adjacent face at the same positions.
  // Emit only occupied-to-empty boundaries, never overlapping independent boxes.
  function meshUnion(boxes) {
    const axes = [0, 1, 2].map((a) => [...new Set(
      boxes.flatMap((b) => [b.min[a], b.max[a]]).map((v) => Number(v.toFixed(9)))
    )].sort((a, b) => a - b));
    const occupied = new Set();
    const key = (i, j, k) => `${i},${j},${k}`;
    for (let i = 0; i < axes[0].length - 1; i++) {
      for (let j = 0; j < axes[1].length - 1; j++) {
        for (let k = 0; k < axes[2].length - 1; k++) {
          const center = [i, j, k].map((index, a) => (axes[a][index] + axes[a][index + 1]) / 2);
          if (boxes.some((b) => center.every((v, a) => v > b.min[a] && v < b.max[a]))) {
            occupied.add(key(i, j, k));
          }
        }
      }
    }
    const faces = [];
    const triangles = [];
    for (const cell of occupied) {
      const [i, j, k] = cell.split(",").map(Number);
      const [x0, x1] = axes[0].slice(i, i + 2);
      const [y0, y1] = axes[1].slice(j, j + 2);
      const [z0, z1] = axes[2].slice(k, k + 2);
      const candidates = [
        [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
        [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
        [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
        [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
        [[0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
        [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]]
      ];
      for (const [normal, vertices] of candidates) {
        if (!occupied.has(key(i + normal[0], j + normal[1], k + normal[2]))) {
          faces.push({ normal, vertices });
          triangles.push([vertices[0], vertices[1], vertices[2]], [vertices[0], vertices[2], vertices[3]]);
        }
      }
    }
    return { triangles, faces };
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function subtract(a, b) {
    return a.map((v, i) => v - b[i]);
  }

  function meshStats(mesh) {
    const vertices = new Map();
    const edges = new Map();
    let volume = 0;
    let degenerate = 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const triangle of mesh.triangles) {
      const keys = triangle.map((v) => v.join(","));
      triangle.forEach((v, i) => {
        vertices.set(keys[i], v);
        v.forEach((c, a) => { min[a] = Math.min(min[a], c); max[a] = Math.max(max[a], c); });
        const from = keys[i], to = keys[(i + 1) % 3];
        const id = [from, to].sort().join("|");
        const edge = edges.get(id) || { count: 0, balance: 0 };
        edge.count++;
        edge.balance += from < to ? 1 : -1;
        edges.set(id, edge);
      });
      const [a, b, c] = triangle;
      const n = cross(subtract(b, a), subtract(c, a));
      if (Math.hypot(...n) <= 1e-10) degenerate++;
      const bc = cross(b, c);
      volume += a.reduce((sum, v, i) => sum + v * bc[i], 0) / 6;
    }
    const unpairedEdges = [...edges.values()].filter((e) => e.count !== 2).length;
    const orientationErrors = [...edges.values()].filter((e) => e.balance !== 0).length;
    return {
      triangles: mesh.triangles.length, vertices: vertices.size, edges: edges.size,
      unpairedEdges, orientationErrors, degenerate,
      closedOrientedEdges: unpairedEdges === 0 && orientationErrors === 0 && degenerate === 0,
      signedVolumeMM3: volume, boundsMM: { min, max, size: max.map((v, i) => v - min[i]) },
      eulerCharacteristic: vertices.size - edges.size + mesh.triangles.length
    };
  }

  function effort(p) {
    const operations = [
      { step: "Identify matching revision and pair", seconds: 45 },
      { step: "Record proposed dimensional checks", seconds: 90 },
      { step: "Review edges and condition", seconds: 45 },
      { step: "Place insert without forcing", seconds: 40 },
      { step: "Lift insert out", seconds: 30 },
      { step: "Review seating and desk stability", seconds: 50 },
      { step: `Check ${p.bays} bay openings`, seconds: p.bays * 20 }
    ];
    if (p.layout === "card-token") operations.push({ step: "Review assumed card/token envelopes", seconds: 45 });
    return {
      classification: "MODELED assembly + handling + inspection; not time-study evidence",
      operations, seconds: operations.reduce((sum, row) => sum + row.seconds, 0),
      minutes: operations.reduce((sum, row) => sum + row.seconds, 0) / 60,
      fabricationTimeIncluded: false
    };
  }

  function costFor(volumeMM3, minutes, overrides = {}) {
    const a = { ...ASSUMPTIONS, ...overrides };
    const solidMassG = volumeMM3 / 1000 * a.densityGCM3;
    const grossFeedstockG = solidMassG / (1 - a.scrapFraction);
    const materialUSD = grossFeedstockG / 1000 * a.feedstockUSDPerKG;
    const benchUSD = minutes / 60 * a.benchUSDPerHour;
    const unitUSD = materialUSD + benchUSD + a.packagingUSD + a.overheadUSD;
    return {
      classification: "SYNTHETIC estimate only", solidMassG, grossFeedstockG, materialUSD,
      benchUSD, packagingUSD: a.packagingUSD, overheadUSD: a.overheadUSD,
      unitUSD, displayedUnitUSD: unitUSD.toFixed(2),
      quantity: a.planningQuantity, batchUSD: unitUSD * a.planningQuantity,
      displayedBatchUSD: (unitUSD * a.planningQuantity).toFixed(2)
    };
  }

  function model(p) {
    const errors = validate(p);
    if (errors.length) throw new RangeError(errors.map((e) => e.message).join(" "));
    p = Object.fromEntries([...Object.keys(LIMITS), "layout"].map((k) => [k, p[k]]));
    const { width: W, depth: D, height: H, wall: t, floor: f, clearance: c, rib: r, insertHeight: h } = p;
    const inner = [W - 2 * t, D - 2 * t, H - f];
    const footprint = [inner[0] - 2 * c, inner[1] - 2 * c, h];
    const [IW, ID] = footprint;
    const trayBoxes = [
      box(0, 0, 0, W, D, f), box(0, 0, f, t, D, H), box(W - t, 0, f, W, D, H),
      box(t, 0, f, W - t, t, H), box(t, D - t, f, W - t, D, H)
    ];
    const insertBoxes = [box(0, 0, 0, IW, r, h), box(0, ID - r, 0, IW, ID, h)];
    const bayWidthSum = IW - (p.bays - 1) * r;
    let cursor = 0;
    const bays = bayFractions(p).map((fraction, i) => {
      const width = bayWidthSum * fraction;
      const bay = { id: i + 1, x: cursor, y: r, width, depth: ID - 2 * r, height: h };
      cursor += width;
      if (i < p.bays - 1) {
        insertBoxes.push(box(cursor, r, 0, cursor + r, ID - r, h));
        cursor += r;
      }
      return bay;
    });
    const trayVolumeMM3 = W * D * f + (W * D - inner[0] * inner[1]) * (H - f);
    const insertVolumeMM3 = (2 * IW * r + (p.bays - 1) * (ID - 2 * r) * r) * h;
    const volumeMM3 = trayVolumeMM3 + insertVolumeMM3;
    const handling = effort(p);
    const economics = costFor(volumeMM3, handling.minutes);
    const a = ASSUMPTIONS.pack;
    const packed = [W, D, H].map((v) => v + 2 * a.padding);
    const margins = packed.map((v, i) => [a.width, a.depth, a.height][i] - v);
    const packedMassG = economics.solidMassG + a.massG;
    const payload = ASSUMPTIONS.payload;
    const cardFit = bays[0].width >= payload.cardWidth + 2 * payload.edgeAllowance
      && bays[0].depth >= payload.cardDepth + 2 * payload.edgeAllowance
      && h >= payload.cardStackHeight + 2;
    const tokenFit = bays.slice(1).every((b) => Math.min(b.width, b.depth) >= payload.tokenDiameter + 2 * payload.edgeAllowance);
    const meshes = { tray: meshUnion(trayBoxes), insert: meshUnion(insertBoxes) };
    return {
      schema: "stackline-design/1", generatorVersion: VERSION, units: "mm",
      params: p, innerMM: inner, insertMM: footprint, offsetMM: [t + c, t + c, f],
      rimRecessMM: H - f - h, bays, trayVolumeMM3, insertVolumeMM3, volumeMM3,
      boxes: { tray: trayBoxes, insert: insertBoxes }, meshes,
      meshChecks: { tray: meshStats(meshes.tray), insert: meshStats(meshes.insert) },
      handling, economics,
      pack: {
        classification: "SYNTHETIC nominal envelope only; fixed orientation, no diagonal packing",
        packedMM: packed, marginsMM: margins, packedMassG,
        massMarginG: a.maxMassG - packedMassG,
        pass: margins.every((v) => v >= 0) && packedMassG <= a.maxMassG
      },
      payload: {
        applicable: p.layout === "card-token", cardFit, tokenFit,
        pass: cardFit && tokenFit, assumptions: payload,
        note: "Nominal rectangle/circle containment only. Actual Pocket Arcade items, retrieval, and token retention are untested."
      }
    };
  }

  function stl(m, part) {
    if (!["tray", "insert"].includes(part)) throw new RangeError("STL part must be tray or insert.");
    const lines = [`solid stackline_${part}_nominal_mm`];
    for (const [a, b, c] of m.meshes[part].triangles) {
      const n = cross(subtract(b, a), subtract(c, a));
      const length = Math.hypot(...n);
      lines.push(`  facet normal ${n.map((v) => number(v / length, 9)).join(" ")}`, "    outer loop");
      for (const vertex of [a, b, c]) lines.push(`      vertex ${vertex.map((v) => number(v, 9)).join(" ")}`);
      lines.push("    endloop", "  endfacet");
    }
    lines.push(`endsolid stackline_${part}_nominal_mm`, "");
    return lines.join("\n");
  }

  function bomCSV(m) {
    const rows = [
      ["part_id", "quantity", "x_mm", "y_mm", "z_mm", "solid_volume_mm3", "modeled_mass_g", "density_g_cm3", "classification"],
      ["tray", 1, m.params.width, m.params.depth, m.params.height, m.trayVolumeMM3, m.trayVolumeMM3 / 1000 * ASSUMPTIONS.densityGCM3, ASSUMPTIONS.densityGCM3, "SYNTHETIC solid model"],
      ["insert", 1, ...m.insertMM, m.insertVolumeMM3, m.insertVolumeMM3 / 1000 * ASSUMPTIONS.densityGCM3, ASSUMPTIONS.densityGCM3, "SYNTHETIC solid model"]
    ];
    return rows.map((row) => row.map((v) => typeof v === "number" ? number(v, 9) : v).join(",")).join("\n") + "\n";
  }

  function parameterJSON(m) {
    return JSON.stringify({
      schema: m.schema, generatorVersion: VERSION, units: "mm",
      parameters: m.params, assumptions: ASSUMPTIONS,
      origin: "Each STL has its own local minimum at [0,0,0].",
      assembledInsertTranslationMM: m.offsetMM,
      disposition: "DIGITAL REVIEW ONLY — NOT APPROVED FOR FABRICATION",
      limitations: PHYSICAL_LIMITS
    }, null, 2) + "\n";
  }

  function report(m) {
    return {
      schema: "stackline-digital-review/1", units: "mm", classification: "SYNTHETIC / digital checks",
      params: m.params, innerMM: m.innerMM, insertMM: m.insertMM, offsetMM: m.offsetMM,
      nominalPerSideGapMM: m.params.clearance, rimRecessMM: m.rimRecessMM,
      bays: m.bays, trayVolumeMM3: m.trayVolumeMM3, insertVolumeMM3: m.insertVolumeMM3,
      totalVolumeMM3: m.volumeMM3, meshes: m.meshChecks,
      modeledBenchEffort: m.handling, economics: m.economics, pack: m.pack, payload: m.payload,
      sensitivity: [
        { label: "Low", densityGCM3: 1.18, feedstockUSDPerKG: 18, scrapFraction: 0.04, ...costFor(m.volumeMM3, m.handling.minutes, { densityGCM3: 1.18, feedstockUSDPerKG: 18, scrapFraction: 0.04 }) },
        { label: "Base", densityGCM3: 1.24, feedstockUSDPerKG: 24, scrapFraction: 0.08, ...m.economics },
        { label: "High", densityGCM3: 1.30, feedstockUSDPerKG: 32, scrapFraction: 0.15, ...costFor(m.volumeMM3, m.handling.minutes, { densityGCM3: 1.30, feedstockUSDPerKG: 32, scrapFraction: 0.15 }) }
      ],
      physicalTestsPerformed: [], limitations: PHYSICAL_LIMITS
    };
  }

  function drawingSVG(m) {
    const { width: W, depth: D, height: H, wall: t, floor: f } = m.params;
    const [IW, ID, IH] = m.insertMM;
    const pageW = Math.max(297, W + 68);
    const frontY = D + 88;
    const insertY = frontY + H + 42;
    const pageH = insertY + ID + 58;
    const origin = 30;
    const rect = (x, y, w, h, cls = "outline") =>
      `<rect class="${cls}" x="${number(x, 6)}" y="${number(y, 6)}" width="${number(w, 6)}" height="${number(h, 6)}"/>`;
    const text = (x, y, value, cls = "label") => `<text class="${cls}" x="${number(x)}" y="${number(y)}">${escapeXML(value)}</text>`;
    const dim = (x1, y1, x2, y2, value) =>
      `<g class="dimension"><path d="M ${number(x1)} ${number(y1)} L ${number(x2)} ${number(y2)}"/><path d="M ${number(x1 - 1.5)} ${number(y1 - 1.5)} l 3 3 M ${number(x2 - 1.5)} ${number(y2 - 1.5)} l 3 3"/>${text((x1 + x2) / 2 + 2, (y1 + y2) / 2 - 2, value)}</g>`;
    const top = [
      rect(origin, 42, W, D), rect(origin + t, 42 + t, m.innerMM[0], m.innerMM[1], "hidden"),
      ...m.boxes.insert.map((b) => rect(origin + m.offsetMM[0] + b.min[0], 42 + m.offsetMM[1] + b.min[1], b.max[0] - b.min[0], b.max[1] - b.min[1], "insert")),
      dim(origin, 34, origin + W, 34, `${number(W)} mm`),
      dim(origin - 10, 42, origin - 10, 42 + D, `${number(D)} mm`)
    ].join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(pageW)}mm" height="${number(pageH)}mm" viewBox="0 0 ${number(pageW)} ${number(pageH)}">
<title>Stackline nominal dimensioned review drawing — millimetres</title>
<desc>1 drawing unit equals 1 mm. Not a cut template or machine instruction. Two separate nominal solids.</desc>
<style>text{font-family:monospace;fill:#142734;font-size:3.3px}.heading{font-size:5px;font-weight:bold}.small{font-size:2.9px}.outline{fill:none;stroke:#142734;stroke-width:.35}.hidden{fill:none;stroke:#65767c;stroke-width:.25;stroke-dasharray:2 1}.insert{fill:#d8eee5;stroke:#27715f;stroke-width:.22}.dimension path{fill:none;stroke:#597078;stroke-width:.2}.dimension text{font-size:3px}.bar{stroke:#142734;stroke-width:.5}</style>
<rect width="100%" height="100%" fill="#fff"/>
${text(15, 13, "STACKLINE / DIGITAL DESIGN REVIEW", "heading")}
${text(15, 20, `${W} × ${D} × ${H} mm | ${m.params.bays} bays | ${m.params.layout} | generator ${VERSION}`)}
${top}
${text(origin, D + 51, "TOP / insert shown at its assembled offset", "small")}
${text(origin, D + 57, `Nominal side gap ${m.params.clearance} mm on all four sides; inner ${number(m.innerMM[0])} × ${number(m.innerMM[1])} mm`, "small")}
${text(origin, frontY - 12, "FRONT / outer envelope and hidden floor", "heading")}
${rect(origin, frontY, W, H)}
<path class="hidden" d="M ${origin} ${frontY + H - f} h ${W}"/>
${dim(origin + W + 9, frontY, origin + W + 9, frontY + H, `${H} mm`)}
${text(origin + 3, frontY + H - f - 3, `floor ${f} mm; wall ${t} mm; rim recess ${number(m.rimRecessMM)} mm`, "small")}
${text(origin, insertY - 14, "INSERT / separate part; local origin 0,0,0", "heading")}
${m.boxes.insert.map((b) => rect(origin + b.min[0], insertY + b.min[1], b.max[0] - b.min[0], b.max[1] - b.min[1], "insert")).join("")}
${dim(origin, insertY - 6, origin + IW, insertY - 6, `${number(IW)} mm`)}
${dim(origin - 10, insertY, origin - 10, insertY + ID, `${number(ID)} mm`)}
${m.bays.map((b) => text(origin + b.x + 2, insertY + ID / 2, `${number(b.width, 2)}`, "small")).join("")}
${text(origin, insertY + ID + 8, `Bay widths above; clear depth ${number(ID - 2 * m.params.rib)} mm; rib ${m.params.rib} mm; height ${IH} mm`, "small")}
${text(origin, insertY + ID + 15, "STL is unitless: explicitly import as mm. Scale/check this drawing at 100%.", "small")}
<path class="bar" d="M 30 ${pageH - 23} h 50 M 30 ${pageH - 25} v 4 M 80 ${pageH - 25} v 4"/>
${text(86, pageH - 21, "50 mm scale bar", "small")}
${text(15, pageH - 9, "REVIEW ONLY / No physical tests, fabrication, process qualification, or purchasing performed.", "small")}
</svg>\n`;
  }

  function previewSVG(m, { exploded = false, payload = true } = {}) {
    const offset = [...m.offsetMM];
    if (exploded) offset[2] += m.params.height + 10;
    const project = ([x, y, z]) => [(x - y) * 0.86, (x + y) * 0.42 - z];
    const faces = [];
    const insertBoxes = m.boxes.insert.map((b) => ({
      min: b.min.map((v, i) => v + offset[i]), max: b.max.map((v, i) => v + offset[i])
    }));
    // Split the preview floor at insert boundaries too, so a large floor face
    // cannot paint over raised rails merely because its centroid is nearer.
    const scene = meshUnion([...m.boxes.tray, ...insertBoxes]);
    for (const face of scene.faces) {
      if (face.normal.reduce((sum, v) => sum + v, 0) <= 0) continue;
      const points = face.vertices;
      const inside = [0, 1, 2].map((a) =>
        points.reduce((sum, p) => sum + p[a], 0) / points.length - face.normal[a] * 1e-6);
      const isInsert = insertBoxes.some((b) => inside.every((v, a) => v > b.min[a] && v < b.max[a]));
      const colors = isInsert ? ["#2e8279", "#57ac9e", "#91d9c5"] : ["#a78a64", "#cfb58d", "#e5d3b1"];
      const axis = face.normal.findIndex((v) => v === 1);
      faces.push({
        depth: points.reduce((sum, p) => sum + p[0] + p[1] + p[2] * 0.84, 0) / points.length,
        points: points.map(project), fill: colors[axis]
      });
    }
    const bounds = faces.flatMap((f) => f.points);
    const minX = Math.min(...bounds.map((p) => p[0])) - 40;
    const minY = Math.min(...bounds.map((p) => p[1])) - 24;
    const maxX = Math.max(...bounds.map((p) => p[0])) + 40;
    const maxY = Math.max(...bounds.map((p) => p[1])) + 55;
    const poly = (points) => points.map((p) => p.map((v) => number(v, 3)).join(",")).join(" ");
    const polygons = faces.sort((a, b) => a.depth - b.depth).map((f) =>
      `<polygon points="${poly(f.points)}" fill="${f.fill}" stroke="${f.fill}" stroke-width=".22"/>`
    ).join("");
    const dimension = (a, b, label) => {
      const p = project(a), q = project(b);
      return `<path d="M ${p.map((v) => number(v)).join(" ")} L ${q.map((v) => number(v)).join(" ")}" stroke="#718788" stroke-width=".55"/><circle cx="${number(p[0])}" cy="${number(p[1])}" r="1" fill="#718788"/><circle cx="${number(q[0])}" cy="${number(q[1])}" r="1" fill="#718788"/><text x="${number((p[0] + q[0]) / 2)}" y="${number((p[1] + q[1]) / 2 + 9)}" fill="#496263" font-family="monospace" font-size="6" text-anchor="middle">${escapeXML(label)}</text>`;
    };
    const { width: W, depth: D } = m.params;
    let payloadOverlay = "";
    if (payload && m.payload.applicable && m.payload.pass && !exploded) {
      const b = m.bays[0], a = ASSUMPTIONS.payload;
      const x = offset[0] + b.x + (b.width - a.cardWidth) / 2;
      const y = offset[1] + b.y + (b.depth - a.cardDepth) / 2;
      const z = m.params.floor + a.cardStackHeight;
      const points = [[x, y, z], [x + a.cardWidth, y, z], [x + a.cardWidth, y + a.cardDepth, z], [x, y + a.cardDepth, z]].map(project);
      payloadOverlay = `<polygon points="${poly(points)}" fill="#fbfaf2" fill-opacity=".75" stroke="#547a7a" stroke-width=".6" stroke-dasharray="2 1"/><text x="${number(points[0][0])}" y="${number(points[0][1] - 3)}" fill="#386663" font-family="monospace" font-size="4.5">88 × 63 assumed card envelope</text>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${number(minX)} ${number(minY)} ${number(maxX - minX)} ${number(maxY - minY)}" role="img" aria-label="${escapeXML(`${W} by ${D} by ${m.params.height} mm organizer, ${m.params.bays} bays, ${exploded ? "exploded" : "assembled"} nominal preview`)}">
<title>Original parametric two-piece organizer</title><desc>Orthographic isometric preview; nominal geometry, not a photograph or physical test.</desc>
<ellipse cx="${number((W - D) * 0.43)}" cy="${number((W + D) * 0.26)}" rx="${number((W + D) * 0.4)}" ry="${number((W + D) * 0.13)}" fill="#a6a98e" opacity=".15"/>
${polygons}${payloadOverlay}
${dimension([0, D + 13, 0], [W, D + 13, 0], `${W} mm`)}
${dimension([W + 13, 0, 0], [W + 13, D, 0], `${D} mm`)}
</svg>\n`;
  }

  function inspectionCSV(m) {
    const p = m.params;
    const rows = [
      ["feature", "nominal", "lower", "upper", "unit", "proposed_method", "status"],
      ["tray_width", p.width, p.width - 0.5, p.width + 0.5, "mm", "Caliper at two locations", "NOT PERFORMED"],
      ["tray_depth", p.depth, p.depth - 0.5, p.depth + 0.5, "mm", "Caliper at two locations", "NOT PERFORMED"],
      ["tray_height", p.height, p.height - 0.5, p.height + 0.5, "mm", "Caliper at four corners", "NOT PERFORMED"],
      ["width_side_gap_centered", p.clearance, Math.max(0, p.clearance - 0.5), p.clearance + 0.5, "mm", "(Measured inner width minus insert width) / 2; also check each actual side", "NOT PERFORMED"],
      ["depth_side_gap_centered", p.clearance, Math.max(0, p.clearance - 0.5), p.clearance + 0.5, "mm", "(Measured inner depth minus insert depth) / 2; also check each actual side", "NOT PERFORMED"],
      ["wall_minimum", p.wall, p.wall - 0.3, p.wall + 0.3, "mm", "Review instrument reach and locations before use", "NOT PERFORMED"],
      ["floor", p.floor, p.floor - 0.3, p.floor + 0.3, "mm", "Propose depth and height measurements; instrument review needed", "NOT PERFORMED"],
      ["insert_height", p.insertHeight, p.insertHeight - 0.5, p.insertHeight + 0.5, "mm", "Caliper on both rails", "NOT PERFORMED"],
      ["visible_edge_defects", 0, 0, 0, "observed_defects", "Visual and handling review by approved reviewer; unresolved defects HOLD", "NOT PERFORMED"],
      ["binding_or_rocking", 0, 0, 0, "observed_events", "Separately approved insertion-removal and flat-desk trial; no forcing", "NOT PERFORMED"]
    ];
    return rows.map((row) => row.map((v) => typeof v === "number" ? number(v) : v).join(",")).join("\n") + "\n";
  }

  function assemblyText(m) {
    const lines = [
      "STACKLINE — PROSPECTIVE ASSEMBLY / PILOT REVIEW",
      "DIGITAL WORK ONLY. No physical sample or approved manufacturing process exists in this project.",
      `Revision ${VERSION}; envelope ${m.params.width} × ${m.params.depth} × ${m.params.height} mm; ${m.params.bays} bays.`,
      "",
      "INTENDED INTERFACE",
      `One tray + one ladder insert. Insert footprint ${m.insertMM.map((v) => number(v)).join(" × ")} mm.`,
      `Position insert at [${m.offsetMM.join(", ")}] mm relative to tray origin. Rails run along the front/back edges.`,
      `Centered side gap ${m.params.clearance} mm; rim recess ${number(m.rimRecessMM)} mm. Loose drop-in, not snap-fit.`,
      "The surrounding gap and open ladder ends do not seal compartments. Support the tray, not the unretained insert.",
      "",
      "FUTURE SEQUENCE — ONLY AFTER SEPARATE PROTOTYPE / MATERIAL / PROCESS APPROVAL",
      "1. Assign matching revision and pair IDs; keep different configurations and revisions separate.",
      "2. Check the BOM: one tray and one insert. Verify actual units, dimensions, edges, and condition.",
      "3. Record proposed inspection readings without inventing missing values. Any unresolved defect holds the pair.",
      "4. Orient rails front/back and lower the insert onto the floor without force, adhesive, or fasteners.",
      "5. Review all four side gaps, seating, squareness, each bay, and stability on a flat desk.",
      "6. Lift out without forcing; record any binding, flex, rocking, or poor retrieval as a HOLD.",
      ...(m.payload.applicable ? ["7. Separately review actual cards/tokens against the assumed 88 × 63 × 12 mm card stack and 20 mm token diameter. No compatibility test has occurred."] : []),
      "8. Segregate a mismatched or nonconforming pair. Reopen design/quality review; do not infer a correction process.",
      "9. Packing requires separate approval. A mathematical envelope pass is not transit validation.",
      "",
      "BOUNDED PILOT PLAN",
      "Twenty hypothetical kits; no fabrication authorized. If later approved, identify and inspect every pair.",
      "Do not reuse the seed's five synthetic rows as evidence about new objects or changed dimensions.",
      "Review instruments, uncertainty, proposed tolerances, material/process safety, and record schema before any physical trial.",
      "",
      "MODELED BENCH EFFORT — ASSEMBLY + HANDLING + INSPECTION, NOT A TIME STUDY",
      ...m.handling.operations.map((row) => `${row.seconds} assumed seconds: ${row.step}`),
      `Total: ${number(m.handling.minutes, 2)} modeled minutes per kit. Fabrication, postprocessing, and waiting time excluded.`,
      "",
      "UNPERFORMED PHYSICAL CHECKS",
      ...PHYSICAL_LIMITS.map((v) => `- ${v}`), ""
    ];
    return lines.join("\n");
  }

  root.Stackline = Object.freeze({
    VERSION, BASE, PRESETS, LIMITS, ASSUMPTIONS, PHYSICAL_LIMITS,
    validate, model, meshUnion, meshStats, effort, costFor,
    stl, bomCSV, parameterJSON, report, drawingSVG, previewSVG, inspectionCSV, assemblyText, number
  });
})(globalThis);
