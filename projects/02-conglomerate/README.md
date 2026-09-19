# Five-hour Office

An original, offline decision tool for the actual five ventures in **The
One-Person Conglomerate** seed, with a working **Ledgerleaf CSV Preflight**
offering. This is local work produced, **not an activated company, accepted
native task, approved public contribution or validated business**.

## Use

Open `projects/02-conglomerate/index.html` through the repository-root HTTP
preview supplied by the parent showcase. ES modules and frozen local JSON
require HTTP rather than `file://`. Nothing contacts an external service.
No service, shared browser, package installation or native Hive initialization
was used for this workstream.

1. Compare the default learning/reuse objective with **Speed-first**.
2. Change weights, reserve, review, per-venture timing, subjective scores,
   prerequisite readiness and proposed allocations. The cap stays **300**.
3. Apply a recommendation explicitly; changing assumptions never silently
   reallocates the proposal. Export an unapproved decision snapshot if useful.
4. Expand all ten original uncertainties and compare falsifiable test plans.
5. Run the checker on the frozen fictional CSV, paste another fictional CSV,
   or select one local UTF-8 file. Download its value-free JSON findings.

No browser storage, analytics, uploads, remote fonts, external dependencies,
outreach, purchases, publication or account setup. Inputs remain in page
memory; reload resets the model. Downloads happen only on an explicit click.

## Why Ledgerleaf, under which objective?

The objective is **one useful local artifact, favoring learning and reusable
work**, not revenue, all-venture activity or full utilization. Initial weights
are learning **3**, reuse **2**, speed **1**. Scores are:

```
C × (wL × L/5 + wR × R/5 + wS × S) / (wL + wR + wS)
S = max(0, (300 − delivery − test preparation − shared review) / 300)
```

`L` and `R` are ordinal 1–5 scores; `C` is synthetic subjective confidence
0–100, **not a calibrated probability**. The precision is arithmetic, not
knowledge about markets. Ordinal scores and confidence come from each named
primary seed direction and are **assumed**, not remeasured, to transfer to
the smaller offering. Timing estimates and weights are new demo assumptions.

| Venture | Primary seed direction | New delivery / test prep | Need incl. 30m review | Default score |
| --- | --- | ---: | ---: | ---: |
| Ledgerleaf Tools | `lf-schema` | 150 / 30 min | 210 min | 53.00 |
| Quietbench Templates | `qb-keyboard` | 100 / 35 min | 165 min | 49.29 |
| Tinylesson Studio | `tl-sample` | 110 / 35 min | 175 min | 36.81 |
| Fieldnote Guides | `fn-outline` | 60 / 25 min | 115 min | 35.14 |
| Routepaper Planners | `rp-sheet` | 50 / 20 min | 100 min | 33.61 |

Ledgerleaf wins because the inherited learning/reuse scores outweigh its
larger time requirement. It also allows actual, narrow artifact checking
without importing customer files. **That is tool evidence, not demand.**
Its recommendation uses **180 venture + 30 review + 30 protected = 240
minutes**, leaving **60 uncommitted**. The other four ventures are parked
in the initial proposal, with their own offer, non-goals and test plans.

This choice is not robust to every reasonable objective:

- Speed weight **4** with the other weights unchanged selects **Quietbench**.
- Reducing Ledgerleaf confidence from **60 to 50** selects **Quietbench**.
- Speed-only selects **Routepaper**, the smallest initial time commitment.
  The speed-only score still includes the confidence discount; it is not an
  unconditional sort by minutes after arbitrary input edits.
- All delivery/preparation estimates **+25%** retain Ledgerleaf in this model.
- Withhold Ledgerleaf's prerequisite and Quietbench becomes the leader.
- Score ties report all tied contenders, then prefer fewer required minutes,
  then lexical venture ID. Zero weights are invalid. Zero scores recommend
  no venture rather than manufacture a strategic preference.

The UI recomputes sensitivity from current assumptions. It does not claim
probabilistic risk modeling, causal learning, a representative sample,
economic value, actual founder effort spent, or willingness to pay. Reuse and
learning scores may overlap. Fatigue, correlated failure, rework and
recruitment remain unmodeled.

## The important scope change

The original seed is **40 hours / hypothetical $600**, protecting **8 hours /
$100**, with **32 discretionary hours / $500**, at most three units and one
experiment each. Its reference selection is `lf-schema`, `fn-outline`,
`rp-sheet`: **19 hours / $90**, leaving **13 hours / $410** discretionary.

The user explicitly requested **300 founder minutes in the whole week** and
one useful offering. The original **480-minute reserve alone is infeasible**.
We do not pretend to preserve that time reserve inside five hours:

- Original capacity, all ten experiment rows, selected flags, cash and source
  scores are preserved byte-for-byte in `data/`.
- The new scenario assumes a **30-minute reserve**, **30-minute shared
  review**, **one active venture at most** and **no authorized spending**.
- New offerings are narrower, not scaled-down promises to complete the full
  seed experiment. Minute rationales and excluded work are in `inputs.json`.
- “Original primary seed durations” is a **time-only stress scenario** for
  the five named directions. It does not authorize the original cash values.
  All ten full seed candidates fail the initial 300-minute cap with the
  additional 30-minute reserve and 30-minute review.
- Review is charged once for any nonempty allocation, not once per venture.
  An empty plan incurs no review. Allocations below a minimum, multiple
  funded units, missing prerequisites and overruns are explicitly infeasible.
  Unused time is acceptable.

`scope.json` maps the unclaimed ready **`portfolio-intake`** task to five
intake rows and the explicit user extension. Related seed tasks remain
blocked/unclaimed/unreviewed; no source task board has been updated.

## Falsifiable demand tests, not outreach

Each of the five briefs contains an audience hypothesis, the smallest proposed
test, an observable pass criterion, a disconfirming outcome and a stop rule.
All ten original evidence-register rows are represented. **Zero sessions,
customers, revenue or real observations exist.**

The plans use three hypothetical future consented participants choosing a
prototype versus a plain alternative, with a simple task rubric. Even a pass
would be weak convenience-sample utility evidence, not commercial validation.
Ledgerleaf's rule is: at least **2 of 3** choose the checker for a second
fictional import **and** explain the duplicate in five minutes; otherwise
park or simplify. No participant has been recruited.

Current planning includes only test **preparation** estimates. Later
observation/review estimates are Ledgerleaf **45**, Fieldnote **30**,
Quietbench **45**, Routepaper **30**, Tinylesson **40** founder minutes,
**excluding unknown recruitment**. They must be replanned and separately
approved, with consent, before any execution. These are lowest-scope proposals
among the documented directions, not a proven global minimum cost.

## The useful offering: Ledgerleaf CSV Preflight

Original `csv-checker.mjs` implements strict comma-separated parsing,
escaped quotes, multiline fields, LF/CRLF/CR line endings and optional UTF-8
BOM. It checks:

- blank/duplicate headers and missing configured columns;
- variable-width records and blank required cells;
- trimmed, case-sensitive duplicate keys, linked to the first record;
- formula-looking cells without evaluating anything.

It refuses invalid UTF-8 bytes, binary controls, malformed quoting, more
than **1 MiB** or **10,000 data records**. Findings contain stable code,
logical record (header = 1), physical starting line, column and sometimes
related record—**never cell values or header names**. Reports show the first
**200 findings** and preserve the full count. File bytes are never changed.
Oversized selected files are rejected before reading. Editing input
invalidates the prior report; asynchronous file reads cannot overwrite a
newer pasted input.

The seed fixture produces **one `duplicate-key` finding at record 5, line 5,
column 2, referring to record 4**. That intentionally non-clean result is
successfully tested, not treated as a checker failure.

This is not accounting software, financial certification, file repair,
spreadsheet sanitization or guaranteed importer compatibility. Negative
numbers can conservatively trigger the formula-looking check. The small UI
uses comma-separated required-column names and cannot configure names that
themselves contain commas; the parser can still read such headers. Empty key
and required options explicitly disable those checks. Avoid real financial
files in this demonstrator.

## Reuse, with separate venture boundaries

| Other venture | Reusable asset | Still needed |
| --- | --- | --- |
| Fieldnote | Fictional inventory CSV checks; readable finding labels; pass/stop template | An original one-page count/group/label/return/undo guide and comprehension test |
| Quietbench | Labeled controls, value-free finding schema, required-field export checks | Request-form content, keyboard/print review; no accessibility certification is inherited |
| Routepaper | Local-only input pattern and category/time-window checks | Address-free grouping sheet and evidence that it beats a plain list |
| Tinylesson | Fictional failure fixtures and stable codes as answer rubrics | Original lesson, transfer exercise and actual consented learner observation |

These are possible integrations, not already delivered products. A
counterfactual model winner changes no implementation claim: only
Ledgerleaf's offering is built here.

## Reproduce from repository root

Node **20 or later**, built-ins only. No install step.

```sh
node --test projects/02-conglomerate/test/model.test.mjs projects/02-conglomerate/test/checker.test.mjs projects/02-conglomerate/test/integration.test.mjs
node --check projects/02-conglomerate/app.mjs
node projects/02-conglomerate/tools/evidence.mjs --check
```

Regenerate actual deterministic model/checker output and rerun the tests:

```sh
node projects/02-conglomerate/tools/evidence.mjs --write
```

`--write` writes only `projects/02-conglomerate/evidence/result.json`.
`--check` reruns tests, recomputes the outputs and all artifact hashes, and
compares them to the persisted result. It tolerates a different recorded Node
version, not changed outputs, tests or source hashes. No timestamp or
benchmark duration is fabricated.

Coverage includes exact/over-budget invariants across 310 capacity scenarios,
ranking ties, missing prerequisites, literal-seed infeasibility,
recommendation sensitivity, parser edge cases/limits, seed provenance and
browser-module interactions in an original lightweight DOM harness.
The harness is **not a real browser**, visual review or accessibility
certification. No shared browser or preview server was used by this worker.

## Provenance

`sources.json` links exact seed/archive references to root
`evidence/seed-verification.json`, records the reviewed inert data/document
hashes and identifies byte-matched local copies. `data/inputs.json` is the
attributed transformation plus explicitly new assumptions.

Synthetic seed data and derived names/claims: **Copyright (c) 2026 Hive Hub
contributors, MIT**; see the full notice in `data/LICENSE`. Source:
`one-person-conglomerate` from Hive Hub. The browser code, model, checker,
plans and tests are original. **No downloaded starter executable or starter
test was read, imported, embedded or run.**

The byte-frozen upstream license includes a final blank line. The local
`.gitattributes` permits that one end-of-file whitespace condition for that
file only, preserving its verified hash without weakening code checks.
