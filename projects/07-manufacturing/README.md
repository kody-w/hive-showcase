# Stackline / Object Lab 07

An original, offline parametric desk-organizer configurator and **digital
manufacturing-review package**, not a manufacturing order. Open `index.html`
directly in a browser; no server, installation, network, storage, CDN, or CAD
application is needed. This work does not activate a Hive or claim team task
acceptance.

## What is delivered

- A responsive configurator with editable dimensions, original isometric
  geometry, assembled/exploded views, live fit/packing feedback, and real
  local downloads. Invalid inputs clear the preview and disable export.
- Three regenerated review bundles: [Stackline](generated/stackline/review-bundle.zip),
  [Compact](generated/compact/review-bundle.zip), and
  [Pocket Arcade](generated/pocket-arcade/review-bundle.zip).
- Each bundle has **two separate closed STL solids**, a dimensioned SVG
  drawing, preview SVG, parameter/assumption JSON, two-line BOM CSV,
  prospective assembly instructions, unperformed pilot inspection CSV,
  numeric digital review report, and MIT attribution. Preset ZIPs also carry
  the original source and provenance. The live custom ZIP has the same
  review artifacts; download `engine.js` separately for original source.
- Checked-in [artifact SHA-256 inventory](generated/artifact-index.json),
  [source provenance](data/source-provenance.json),
  [independent mesh checks](evidence/mesh-validation.json), and
  [executed-check evidence](evidence/result.json).

**STL has no unit field. Import explicitly as millimetres, at scale 1.**
These are nominal review solids, not toolpaths, slicer profiles, process
settings, or qualified print-ready parts. No printer, renderer, slicer,
physical prototype, material certification, order, or shipment was used.
The SVG is a dimensioned drawing, **not a cut template**. Its width/height
are in mm with matching viewBox units; its 50 mm bar is a scale check.
Printing that drawing at “fit to page” would invalidate its physical scale.

## Three starting configurations

| Configuration | Outer W × D × H, mm | Bays | Solid volume, mm³ | Modeled solid mass, g | Modeled bench effort, min | Synthetic unit USD |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Stackline | 180 × 100 × 32 | 3 equal | 122316 | 151.67184 | 6.00 | 7.61 |
| Compact | 140 × 90 × 28 | 2 equal | 83604 | 103.66896 | 5.67 | 6.23 |
| Pocket Arcade | 180 × 100 × 28 | 1 card + 2 token | 113676 | 140.95824 | 6.75 | 7.60 |

All use one tray and one removable ladder insert. Compact uses about 31.65%
less nominal solid material than Stackline. Pocket Arcade is an **original
user-approved extension**, not a verified interface to real game components.
It assumes a card stack with an 88 × 63 mm footprint and 12 mm height, 20 mm
diameter tokens, and 1 mm allowance around their planar envelopes. Its clear
bay widths are 91.85 / 37.575 / 37.575 mm at 87 mm clear depth. Only nominal
rectangle/circle containment is checked. Actual cards, tokens, stacks, edge
finish, retrieval, and retention remain untested. This is not a child-safety
product.

## Geometry and interfaces

`engine.js` is original dependency-free JavaScript, used unchanged in the
browser and Node. It describes a rectangular tray floor/wall shell and a
ladder insert with two full-width front/back rails and `bays − 1` crossbars.
There are no fasteners, glue joints, snap features, or interference fits.
The insert rests on the floor and is **not retained**: support the tray,
not the insert. Open ladder ends and surrounding clearance mean bays are
not sealed for very small loose objects.

Every solid is generated as the boundary of occupied cells in a **shared
coordinate lattice**. Internal box faces are discarded; neighboring faces
share all edge splits, avoiding overlapping-box STL shells and T-junctions.
Outward quads are triangulated consistently. Coordinates are serialized to
nine decimal places, not scaled. No downloaded SCAD, SVG, planner, starter
test, or other reference code is run, imported, or embedded.

For outer dimensions `W,D,H`, wall `t`, floor `f`, per-side gap `c`, rib
thickness `r`, insert height `h`, and bay count `n`:

```text
inner width/depth = W − 2t, D − 2t
insert width IW  = W − 2t − 2c
insert depth ID  = D − 2t − 2c
clear bay depth  = ID − 2r
sum bay widths   = IW − (n − 1)r
tray volume      = W·D·f + [W·D − (W − 2t)(D − 2t)]·(H − f)
insert volume    = [2·IW·r + (n − 1)·(ID − 2r)·r]·h
insert translation in assembly = [t + c, t + c, f]
```

Each STL starts at its own `[0,0,0]` origin. Use the translation in the
parameter file to review the assembly, rather than fusing the STL files at
the same origin. Default clearances are 1.5 mm on four sides **when centered**;
a loose insert can slide and those individual gaps will change.
Equal-bay layout divides the clear-width sum evenly. Card/token layout
assigns 55% to the first bay and divides the remaining 45% equally.

Validation rejects nonnumeric/nonfinite values, out-of-range parameters,
noninteger bay counts, invalid layouts, bay widths below 12 mm, clear depths
below 20 mm, and insert/floor combinations with less than 2 mm rim recess.
Numeric controls expose the same ranges as `engine.js`. Wall/floor minimum
2 mm and rib minimum 1.5 mm are **design constraints**, not proven strength
or process limits. A dimensionally valid design may still receive a packing
or payload **HOLD**; exports preserve the findings rather than concealing
them. Changing parameters does not alter the three fixed comparison rows.

## Material, effort, economics, and packing method

The inert seed's baseline dimensions/density, synthetic cost table, packing
envelope, and sample rows are preserved with exact source hashes. They are
planning assumptions, not observed production data.

```text
modeled solid mass (g) = total volume (mm³) / 1000 · 1.24 g/cm³
gross feedstock (g)    = solid mass / (1 − 0.08 scrap fraction)
material USD          = gross feedstock / 1000 · 24 USD/kg
modeled bench seconds = 300 + 20·bays + (45 if card/token layout, else 0)
bench USD             = modeled bench seconds / 3600 · 22 USD/hour
unit USD              = material + bench + 0.35 packaging + 1.10 overhead
twenty-kit USD        = unrounded unit USD · 20, then round to two decimals
```

**Assembly effort is modeled**, not time-study evidence. The 300 fixed
seconds comprise pair identification (45), dimensions (90), edges (45),
insertion (40), removal (30), and seating/stability review (50). The estimate
includes handling/inspection and excludes fabrication, postprocessing,
waiting, and tooling. It deliberately reproduces the seed's six-minute
baseline while letting bay and payload checks change effort.

The solid-material estimate is not an infill/support/slicer forecast.
Loss fraction describes gross input at an assumed 92% yield, not material
placed into the parts. Density/feedstock-price/scrap sensitivity, with other
costs fixed, is low `1.18 / $18 / 4%`, base `1.24 / $24 / 8%`, and high
`1.30 / $32 / 15%`. None is a quotation or material selection. Baseline
displayed unit cost is $7.61; independently rounded twenty-kit total is
$152.13. Multiplying the rounded unit display yields $152.20 instead:
rounding after aggregation matters. No sales, revenue, profit, supplier,
spending, or market evidence is claimed.

Packing uses a fixed-orientation synthetic interior of 192 × 112 × 42 mm,
2 mm padding on both sides of each axis, 25 g packaging, and a 250 g maximum
modeled packed mass. Baseline nominal packed dimensions are 184 × 104 × 36 mm.
No diagonal nesting or transit protection is assumed. The seed's requested
**196 mm width is HOLD**: 196 + 4 = 200 mm, 8 mm over the packing width.
[The change report](generated/width-change-review.json) recalculates geometry,
mass, cost, and future limits, and lists all reopened seed tasks. Baseline
synthetic samples do not validate changed designs.

## Prospective assembly and pilot inspection

Only lightweight, dry stationery/cards/tokens on a stable horizontal desk
are in scope. Food, heated items, electrical enclosures, medical uses,
child-safety products, and load-bearing use are excluded.

The per-configuration `assembly.txt` supplies a reversible sequence for
**twenty hypothetical kits**: match revision/pair IDs, check two-part BOM,
record real dimensions only if a future authorized sample exists, review
edges, orient rails front/back, place without forcing, inspect all four
gaps, lift out, review seating/retrieval/flat-desk stability, and segregate
nonconforming pairs. No fabrication or machine-operation procedure is given.

The unperformed inspection CSV proposes bounds and future measurement
methods. Seed-derived outer dimensions use ±0.5 mm; centered width-side gap
uses 1–2 mm at baseline. This original extension also proposes depth-side
gap ±0.5 mm, insert height ±0.5 mm, and wall/floor ±0.3 mm.
These are **review proposals, not validated process tolerances**.
Instruments, uncertainty, reach, squareness, measurement locations and
acceptance authority must be reviewed before any trial. Inspect every pair
if a later pilot is separately approved; this is not a statistical sampling
claim. Unresolved visible defects, binding or rocking are HOLD.

The five copied synthetic rows replay to **3 PASS / 2 HOLD**:
01, 02 and 05 pass the supplied scalar/edge-flag checks; 03 fails width;
04 has zero width-side clearance. Front/back fit, actual individual gaps,
squareness, stability, retrieval, and material suitability were not measured.
No actual batch is accepted.

## Reproduce from the repository root

Node's built-in test runner and Python 3.9+ standard library only:

```sh
node projects/07-manufacturing/tools/generate.mjs --write
python3 projects/07-manufacturing/tests/verify_artifacts.py --write-evidence
node projects/07-manufacturing/tools/verify.mjs --write-evidence
```

Read-only checks used in the manifest:

```sh
node --test --test-reporter=tap projects/07-manufacturing/tests/engine.test.mjs projects/07-manufacturing/tests/app.test.mjs
python3 projects/07-manufacturing/tests/verify_artifacts.py --check
node projects/07-manufacturing/tools/generate.mjs --check
```

After changes, regenerate and rerun in the stated order. `generate --check`
regenerates bytes in memory and compares every output; it does not write.
ZIP entries use fixed timestamps, no compression dependency, and CRC-32.
`tools/verify.mjs --check` additionally confirms the persisted executed-check
record matches a fresh run, without replacing it.

The original independent Python validator parses the actual STL files,
checks finite nondegenerate triangles, facet normals, unique faces,
two oppositely oriented uses per edge, connected vertex links (manifold
vertices), one connected shell, positive signed volume, expected Euler
characteristic, mm-coordinate bounds, BOM consistency, SVG scale/labels,
ZIP CRC/member equality, and artifact hashes. Node tests cover the analytic
geometry, boundary/fuzz cases, seed replay, input rejection, deterministic
exports, source provenance, isometric SVG face visibility against independent
box-ray intersections, and actual `app.js` behavior in a minimal DOM harness.
That harness is **not a real-browser screenshot or rendering test**.
Browser visual/accessibility review remains a separate parent-owned check.

## Sources and authority boundary

`data/source-provenance.json` records all read-only seed/task/intake/team
requirements and copied data against the parent's verified
`evidence/seed-verification.json`. Exact inert data/license bytes are in
`data/seed/`, under MIT, **Copyright (c) 2026 Hive Hub contributors**.
The full permission/disclaimer is in `data/seed/LICENSE` and every ZIP's
`THIRD-PARTY-NOTICES.txt`. The original seed's instruction to run reference
code was not followed: its task board supplies numeric expectations only.
No claim is made that its SCAD was rendered or executed.

The one-time original `tools/capture-provenance.py --seed-dir <verified-cache>`
can recapture only its explicit nonexecutable data allowlist after checking
every byte count and hash against the parent report. Normal builds/tests do
not need or access the downloaded seed cache.

**Outstanding:** separately approved prototype and physical dimensional/fit
tests; actual material and process suitability/safety; strength, stability,
surface and retrieval reviews; actual handling-time study; packing/transit
testing; supplier/cost confirmation; and any spending, fabrication or
shipment authority. No services, publication, ordering, manufacturing,
native Hive setup, or upstream acceptance are included.
