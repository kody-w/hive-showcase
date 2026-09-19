# 08 · The corporate escape room

**Cedarline Desk · synthetic operational model · work produced, not accepted.**

An original, dependency-free cash-and-capacity model built from the verified
`turnaround-firm` seed. The interactive interface exposes the price of each
intervention, the timing of bills and receipts, finite staff minutes, and failure.
It does **not** manufacture new sales, financing, completed support work, or a
guaranteed rescue.

## Open and reproduce

Open `projects/08-turnaround/index.html` directly from disk with the repository's
`assets/` directory intact. A generated classic-script fallback makes `file://`
work without module CORS problems. When the parent provides its local preview,
the same interface uses the original ES modules. There are no remote fonts,
images, fetches, trackers, accounts, storage, packages, or runtime dependencies.
This workstream starts no service and uses no browser.

From the **repository root**:

```sh
node --test --test-reporter=tap projects/08-turnaround/tests/model.test.mjs projects/08-turnaround/tests/ui.test.mjs projects/08-turnaround/tests/artifacts.test.mjs
node projects/08-turnaround/scripts/build.mjs --check
node projects/08-turnaround/scripts/evidence.mjs --check
```

To deliberately regenerate after editing original sources or assumptions:

```sh
node projects/08-turnaround/scripts/build.mjs --write
node projects/08-turnaround/scripts/evidence.mjs --write
node projects/08-turnaround/scripts/evidence.mjs --check
```

The builder normalizes reviewed **data**, runs the original model, freezes every
experiment, and assembles only this project's original modules into `offline.js`.
The recorder actually runs the first two manifest checks, persists TAP/build
output, hashes all scoped files except its own self-referential result record,
and verifies that artifact set. No downloaded reference code is run, imported,
copied or embedded. No dependencies are installed.

## The result: containment is not an exit

The finite search evaluates **128 strategies**: every subset of six actions
under two fixed start schedules. **49** meet resource/sequence constraints;
**79** are rejected. **Zero** protect both the cash floor and funding through
the 90-day window. This is not a proof about every possible real-world strategy.

The selected candidate, `early-010111`, conditionally:

1. Starts the 360-minute engineering review/repair sequence on D1. Its working
   days are D1, D2 and D5, with readiness on D6.
2. Starts contractor-scope review on D1: a **$300 irreversible assumed fee** and
   60 review minutes. Readiness is D15. The first $3,000 bill remains intact;
   only cycles starting D31 and D61 may use the seed's $1,500 rate.
3. Starts earlier-receipt coordination on D1: **$150 irreversible assumed fee**,
   90 support minutes and 60 review minutes. Readiness D8 permits an assumed
   65% of each existing receipt pool to move from D30 to D20 of its cycle.
   Nothing is added to the pool.
4. Starts a **300-minute prospective support slice on D6**, after queue
   readiness, selecting tickets `001`, `010`, `007`, `011`. The blocked ticket
   and seven eligible deferred tickets stay visible. No ticket is completed.

Totals: **360/360 engineering**, **390/420 support** (including collections),
**120/180 assumed review minutes**, and **$450** in assumed sunk fees.
Hosting work would require another 120 engineering minutes, so it cannot be
silently added to that plan. Full 420-minute support plus collections also
exceeds the one-time support budget.

All money below is modeled USD. Negative scheduled cash is a funding
requirement, **not** an actual overdraft. The executable prefix ends at the first
unfunded bill. Later figures are explicitly counterfactual schedule arithmetic.

| Frozen experiment | First floor breach | First unfunded bill | First bill's funding gap | Lowest scheduled bank cash | Scheduled D90 endpoint |
| --- | --- | --- | ---: | ---: | ---: |
| No intervention | D28 / Oct 28 | D59 / Nov 28 | $2,100 | −$14,600 | −$100 |
| Recovery candidate | D58 / Nov 27 | D90 / Dec 29 | $925 | −$2,625 | $2,450 |
| Candidate, receipts +10 days | D28 / Oct 28 | D59 / Nov 28 | $1,050 | −$12,050 | −$2,625 |
| Candidate, demand −20% | D30 / Oct 30 | D88 / Dec 27 | $5,310 | −$10,310 | −$6,250 |
| Candidate, both stresses | D28 / Oct 28 | D58 / Nov 27 | $2,450 | −$17,850 | −$10,310 |

The candidate's **positive $2,450 endpoint does not rescue it**. On D90,
scheduled bank cash of $875 cannot fund the $1,800 hosting bill before receipts;
the first gap is $925. The following refund obligation expands that day's
counterfactual trough to −$2,625. A later receipt cannot retroactively pay on
time. More importantly, the $12,000 guardrail already failed on D58.

The candidate still burns **$7,500 per normalized 30-day cycle** once its
contractor assumption is active. The seed's separate two-cost containment
scenario has $7,300 burn, versus $9,000 at baseline, but both cost changes are
not assumed free or automatically feasible in this candidate.

### Earliest failure warning

**D0 (2026-09-30)** is the earliest forecast warning in all five experiments:
the deterministic future schedule already reveals failure. This is not an
unobserved predictive signal or a fabricated real-world alert.

The separate rolling alert policy uses a seven-day lead:

| Experiment | Floor escalation | Funding escalation |
| --- | --- | --- |
| No intervention | D21 | D52 |
| Recovery candidate | D51 | D83 |
| Delayed receipts | D21 | D52 |
| Weaker demand | D23 | D81 |
| Combined stress | D21 | D51 |

Thresholds are strict: available cash **below** $12,000 breaches the floor;
exact equality does not. A bill leaving exactly zero bank cash can be funded;
one cent less cannot. Every event is tested, including the trough before a
same-day receipt, not just closing balances. A frozen 60-cell sensitivity grid
(15 delays × four demand levels) reports discrete results without interpolating
a safe threshold.

## Seed facts and new assumptions

### Reviewed synthetic facts

- Fifteen cash rows: **$52,000 + $48,500 − $68,100 = $32,400**.
- Monthly net cash: **−$4,000**, **−$6,600**, **−$9,000**.
- Six subscription rows reconcile monthly billings to the cash receipts, under
  the seed's explicit same-month collection assumption. This is not a general
  revenue-recognition assertion.
- Incremental prior-period obligations are **$1,200 on Oct 2**, **$1,800 on
  Oct 5**, and **$2,500 on Oct 10**: **$5,500** not paid in the historical ledger
  and not included in recurring scenario expenses.
- Cash after these reserves: **$26,900**; headroom above the $12,000 floor:
  **$14,900**. The seed's smoothed 30-day arithmetic gives **49.7 days to the
  floor**, **89.7 to zero**, after reserves.
- Twelve authored open tickets, four urgent, one blocked urgent. Per-ticket
  affected-account counts may overlap and are not summed into unique customers.
- One-time five-working-day budgets: **360 engineering** and **420 support**
  minutes. The original selector independently reproduces the six-ticket,
  exactly 420-minute data expectation, but no source task is accepted.

### Explicit added assumptions

Full definitions and action terms are in [`data/assumptions.json`](data/assumptions.json)
and visible in the interface:

- D1 is **2026-10-01**, D90 is **2026-12-29**. Three **normalized 30-day**
  billing cycles are used, not actual calendar months. Work is Monday–Friday,
  without holiday adjustments.
- Repeat September amounts; payroll on cycle offset 28, contractors 29,
  hosting/refunds/receipts 30. These dates extend the seed posting pattern as an
  assumption, not a contract claim. **All same-day outflows precede receipts.**
  Lumpy dates explain the earlier D28 floor failure versus the smoothed 49.7
  days. The model is intentionally not a straight-line cash extrapolation.
- Action working days, leads, fees, daily staff caps and conditional outcomes
  are assumptions. Engineering/support totals are not refreshed weekly.
  Review has an added 180-minute budget. Work is spread evenly across the
  action's working days; daily caps are 120 engineering / 210 support / 90
  review minutes.
- Six interventions have unique IDs and explicit dependencies. An invalid
  proposal is rejected **as a whole before execution**. The UI then labels its
  cash path a no-action diagnostic rather than showing unearned partial benefits.
- Successful contractor/hosting changes affect only later **complete** cycles.
  Failed consent/validation still loses validly started work and its start fee.
  No support or engineering action creates cash, retention or refund reductions.
- Earlier receipts are a **timing transfer**, normally 65% of the same
  demand-adjusted pool by D20 if ready in time. Consent is unverified. Both
  pieces receive the stress delay; the original regular receipt is reduced by
  exactly the shifted amount.
- Receipt demand retention is 100% by default and 80% in weaker-demand stress.
  Costs do not fall automatically. Demand retention cannot exceed 100%;
  there is no new-sales or financing variable.
- Deferring the $2,500 support catch-up bill requires assumed consent and
  readiness by its original due day. It moves the bill to D40, adds a **$100
  sunk negotiation fee**, **$125 payable fee**, and loses **120 support minutes**.
  The original principal and added payable fee stay reserved even outside a
  short horizon. Consent failure keeps D10 and still loses the negotiation
  fee. No reserve release is counted as a receipt.

### Accounting identities and scope of execution

All monetary arithmetic uses integer cents:

```text
scheduled bank = reconciled opening bank + scheduled receipts − required outflows
available cash = scheduled bank − outstanding prior-period payable reserves
cycle receipts = earlier receipt portion + regular receipt portion
total assumed receipts = receipts inside window + receipts outside window
```

For the candidate:
`$32,400 + $43,500 − $73,450 = $2,450` scheduled endpoint.
Under ten-day delay, `$38,425` arrives inside the window and `$5,075` later;
the pool is still `$43,500`. Combined stress gives `$30,740 + $4,060 = $34,800`.
No out-of-window receipt is available to pay an in-window bill.

At an unfunded event the modeled executable prefix terminates. The stored
`status` marks that event and **all later events** counterfactual, even if the
signed schedule later becomes positive. Their future reserve releases are not
actual payments or cures of default. Quantified legal/default penalties or
service shutoffs are not invented; missed obligations are explicit terminal
feasibility failures. Support-payable deferral has the separately labeled
assumed fee/capacity consequences above.

## Search, artifacts and ownership boundary

[`data/scenarios.json`](data/scenarios.json) documents the exact 128-choice
space and ranking: later floor breach, later funding failure, more prospective
urgent tickets, higher endpoint, lower fees, then stable ID. A null breach is
right-censored at horizon + 1. The candidate is selected once; the four
candidate-based experiments never re-optimize after stress.

| Artifact | Purpose |
| --- | --- |
| `model.mjs` | Original pure cash, schedule, resource, triage and search functions |
| `app.mjs`, `view-model.mjs` | Original controls, chart, weekly/day tables and causal explanation |
| `data/reference/` | Nine byte-identical reviewed data/license files; no reference executable code |
| `data/inputs.json`, `data.mjs` | Frozen normalized inputs and generated browser data |
| `data/attribution.json` | MIT attribution, copied and reviewed-data SHA-256 values |
| `data/scope.json` | Two ready tasks, all nine blocked tasks, team boundaries and requested extension |
| `results/reconciliation.json` | Original cash/billing/reserve reconciliation |
| `results/backlog.json` | Risk mapping and the original prospective 420-minute selector result |
| `results/scenarios.json` | Every day's cash, every event, commitments, warnings and resources |
| `results/strategy-search.json` | All accepted-for-model or rejected-for-model strategy evaluations—not reference acceptance |
| `results/thresholds.json` | 60-cell discrete delay/demand scan |
| `evidence/tests.tap`, `evidence/build-check.json` | Actual local test/build-check output |
| `evidence/result.json` | Command outcomes, model outcomes, source bindings, limitations and artifact hashes |

The source ledger SHA-256 is
`17728ba9a34df12dcd0997dad08ec922babc3d6d504c2e47e1ab0ac3aad69d8e`.
The source archive SHA-256 is
`d2f818c10c0af2b0af010ae280eec8bd94e80f5fb7609a71993694827810a6da`.
The extracted `seed.json` hash
`011c89dd7a9ab8c1ee966f2e7914d55b0cfeae41562c47b7d984dc3ab30b6cd4`
is intentionally different from the verification report's seed descriptor
object reference. Exact source bindings are tested against the existing
repository `evidence/seed-verification.json`.

Copied data and adapted case facts: **Copyright (c) 2026 Hive Hub contributors,
MIT**. The complete source license is retained in
[`data/reference/LICENSE`](data/reference/LICENSE). All application/model/test
code here is original. A narrowly scoped `.gitattributes` rule preserves the
verified license's final blank line instead of changing its bytes for lint.
Seed initialization was read only as data. The reference
Python dispatcher, analysis utility and tests were not executed, imported or
embedded; expected legacy behavior is not claimed as an observed reproduction.

## Validation and limitations

Node built-in tests cover reconciliation, duplicate rejection, exact cents,
lead times, weekends, prerequisites, daily/total capacity, sunk costs, consent
failure, deferral reserves and fees, timing-only receipt conservation,
beyond-horizon receipts, demand stress, event-level cash, early-warning timing,
strict threshold equality, finite search, and all five scenario outcomes.
Original UI behavior is tested by running its generated bundle with a **minimal
Node DOM harness**, including controls, invalid inputs, stress, counterfactual
status and reset. Reproducible artifacts and source hashes are checked too.

No actual browser or visual/accessibility audit was performed in this workstream.
The harness is not a browser certification. The parent owns any separate browser
preview. No service, external mutation, publication, customer communication,
purchase, money movement, native Hive initialization, or accepted upstream work
occurred.

This is **synthetic operational modeling**, not personalized investment advice,
a solvency opinion, a real forecast, or evidence that a business recovered.
The finite model omits full accrual statements, taxes, interest, detailed
contracts, litigation, legal remedies, real staffing calendars, demand
probabilities and quantified outage/churn effects. Agreement, service continuity,
collections timing and outcome probabilities need evidence not present here.
New evidence could invalidate every proposed intervention. Further real-world
actions would require separate qualified and owner review; this demonstration
does not supply that authority.
