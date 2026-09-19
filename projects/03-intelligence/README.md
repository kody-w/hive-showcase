# Evidence Bureau / 03

**Question:** Can a solo founder operate a useful software business with AI doing
most of the implementation?

**Verdict:** Conditionally plausible; not established by this bounded public
review. Implementation gains and commercial anecdotes are not direct proof of
sustainable, AI-majority, one-person operation.

Open [`index.html`](index.html) directly from disk. It uses classic local scripts,
`../../assets/shared.css` and no dependency, fetch, account, storage, tracker or
server. Original-source links are explicitly marked **online** and open only when
clicked. The written [research brief](research/brief.md), [claim/source
JSON](research/evidence.json) and [locked protocol](research/protocol.json) remain
readable without JavaScript.

## What is interactive

- Filter twelve claims by support, challenge or context; search claim/source text
  and restrict by evidence method.
- Select claim nodes to inspect facts/attributions, inference, limits, exact
  citations and paired contradictions. Select a source for methods, independence,
  publication/retrieval dates, short saved excerpts and hashes.
- Follow citations through a responsive SVG map; explicit source IDs provide a
  text alternative. Mobile keeps the linked lists and inspection desk.
- Explore seven operating gates, a two-case evidence-gap matrix and three
  **specific** reversal conditions.
- Check a clearly hypothetical gate scenario. This does not edit evidence,
  certify a company, persist user input or change the actual verdict.
- Bookmark `#claim=c-field`, `#source=s-metr-2026` or `#tab=method`.
  Tabs support arrow keys, Home and End; filters have accessible labels and live
  counts. Focus, reduced motion and a no-JavaScript reading path are provided.

## Reproduce (from repository root)

```sh
python3 projects/03-intelligence/tools/build.py --check
node --test projects/03-intelligence/tests/model.test.mjs projects/03-intelligence/tests/app.test.mjs
python3 projects/03-intelligence/tests/check_evidence.py
```

All checks are offline. No installation is needed (Node built-ins; Python 3.9+
standard library). The UI test uses a focused DOM fixture, **not a real browser**.
Actual command outputs and the last validation receipt are in
[`evidence/result.json`](evidence/result.json).

After deliberately editing original local artifacts:

```sh
python3 projects/03-intelligence/tools/build.py
python3 projects/03-intelligence/tools/validate.py
```

The first command regenerates the deterministic classic-script JSON bundle and
integrity receipt; the second runs the manifest commands, preserves bounded
outputs and updates `evidence/result.json`. Do not edit the locked protocol after
collection; a new investigation should version its protocol explicitly.

### Optional public recollection—not part of tests

`tools/collect.py` performs only GET requests to the fixed reviewed URLs in
`research/collection-plan.json`. It never executes returned HTML/JavaScript.
Existing captures are preserved and skipped. Source bodies are bounded to 4 MB,
hashed in memory and discarded; only metadata and at most 220 words of short
excerpts per source are saved.

The original successful News18 retrieval used `web_fetch`; its later direct GET
was blocked. That limitation and the unavailable response hash are explicit in
`evidence/fetches/s-levels-report-web.json`. Recollection may encounter the same
block or changed pages; a response hash is not a full-page archive. Neither a
failed fetch nor a search summary is silently counted as inspected evidence.

## Research, provenance and scope

The criteria were committed **before public discovery**:
`8b58d0e81935da505f8dc0878e8230277c8aa557`, September 19, 2026 at 01:16:43 UTC.
This is a local git chronology, not external preregistration. The hash and full
definitions, evidence thresholds, alternative hypotheses and reversal
observations are preserved in `research/protocol*.json`.

The new work contains nine inspected sources in six provenance families:
controlled/field experiments, an explicitly updated METR pair, original
SWE-bench methods, a DORA summary, a primary acquisition disclosure and carefully
attributed commercial reporting. Every material claim has inspected-source
locators; every inference and missing-evidence statement is labeled. The
collection log preserves discarded discovery errors, access failures and
inspection-depth limits. No numeric probability is manufactured.

### Inert seed baseline—not research evidence

The source seed is **The Public-Source Intelligence Bureau**,
`public-source-intelligence-bureau`. Its ready task is a fictional, synthetic
Juniper Queue kiosk investigation. The original `seed.json`, initialization
declaration, ready task board, intake, team scopes and relevant source/analysis
inputs were read as data only.

`tools/snapshot_seed.py` copied a strict allowlist of 21 data/license files after
comparing every byte hash with the parent's `evidence/seed-verification.json`.
The five synthetic source CSVs contain 18 authored records, 9 reference claims
and 3 conflict cases. No supplied starter code or tests were copied or run.
The synthetic six-hour record has 398 acknowledgments versus 390 recovered IDs;
that eight-ID discrepancy belongs only to the fictional baseline. It is not a
real measurement and does not support any solo-founder claim.

The extension reuses **methods**, not fabricated findings:

| Inert team scope | New, original local artifact |
| --- | --- |
| Collection and provenance | Bounded fetch receipts, source families and hashes |
| Analysis | Twelve claim records with fact/inference/uncertainty labels |
| Competing hypotheses | Locked predictions, strongest cases and five tensions |
| Verification | ID/link/coverage/hash checks and verdict-rule tests |
| Briefing | Cited written brief, interactive map and specific reversal gates |

These are role mappings, not claims of real team activation, accepted seed task
completion, invented collaborators or human review.

### Attribution

Copied inert data: Copyright (c) 2026 Hive Hub contributors, MIT.
The complete original license is retained at
[`inputs/seed/LICENSE`](inputs/seed/LICENSE). UI, analysis, collection utilities
and tests are original work. Public research is attributed by URL, title and
date; short excerpts are retained for evidence identification, not full
copyrighted reproductions.

## Boundaries

No native Hive initialization, shared-browser use, server, deployment, purchase,
outreach, private account access, external mutation or publication occurred.
The result is **work-produced**, not accepted, independently audited or
human-reviewed. Paying retention, all-role labor, accepted AI-work attribution
and complete six-month owner economics remain jointly unverified. See the brief
and machine-readable limitations for the exact scope.
