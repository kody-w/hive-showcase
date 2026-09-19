# Falsification Lab — library-kit packing

**Work produced. Synthetic scalar computation, not a validated invention.**
Open [`index.html`](index.html) directly from disk. It is an offline inspector
with scenario/method/trial controls, exact tote assignments, both loads and
remaining capacities, printable instructions, a read-only local recompute
button, the complete failure ledger, and source hashes. No dependency,
network, storage, account, service, or browser bridge is required.

## What the experiment actually found

The frozen selection rule chooses **beam search, width 128**.

| Method | Order trap | Weight trap | Mixed classroom | Bulky gaps | Authored total | Paired total (80 cases) | Wins / ties / losses |
|---|---:|---:|---:|---:|---:|---:|---:|
| Input-order first-fit | 3 | 4 | 6 | 3 | 16 | 323 | 0 / 80 / 0 |
| Dominant first-fit (control) | 2 | 4 | 7 | 3 | 16 | 320 | 8 / 67 / 5 |
| Volume-first (control) | 2 | 5 | 8 | 3 | 18 | 360 | 4 / 40 / 36 |
| Dual-capacity best-fit | 2 | 4 | 7 | 3 | 16 | 320 | 8 / 67 / 5 |
| **Beam, width 128** | **2** | **4** | **6** | **3** | **15** | **300** | **23 / 57 / 0** |
| Bounded exact | 2 | 4 | 6 | 3 | 15 | 315 | 8 / 72 / 0 |

Wins and losses compare the same incoming permutation to input-order
first-fit. The best candidate saves **one bin across four authored cases**
and **23 of 323 bins across the paired study (7.12%)**. These are descriptive
modeled counts, not real tote reductions or financial savings.

The best-fit candidate **fails** the frozen gate: it does not improve the
authored total, regresses on mixed-classroom, and worsens that scenario's
paired mean (7 vs 6.75). Its output counts happen to match the simpler
dominant control on every measured case; that is evidence against needing
its additional scoring here. The mechanisms remain different algorithms.
Bounded exact also passes the improvement gate, but its paired total is
worse than beam's because its declared item limit prevents 15 searches.

| Paired mean, all 20 trials | Input | Dominant | Volume | Best-fit | Beam | Bounded exact |
|---|---:|---:|---:|---:|---:|---:|
| Order trap | 2.20 | 2 | 2 | 2 | 2 | 2 |
| Weight trap | 4.20 | 4 | 5 | 4 | 4 | 4 |
| Mixed classroom | 6.75 | 7 | 8 | 7 | 6 | 6.75 |
| Bulky gaps | 3 | 3 | 3 | 3 | 3 | 3 |

No trial was excluded. The ledger preserves **4 authored regressions and 46
paired regressions**, including the known **6 / 7 / 8** mixed-classroom
counterexample. A plausible heuristic is not universally superior.

## What was frozen, and when

[`PROTOCOL.md`](PROTOCOL.md) and [`protocol.json`](protocol.json) were committed
at **`484b2b39b78f209de59951c836ffce0a4022571f`** before original candidate code
was implemented or comparisons executed. [`protocol-lock.json`](protocol-lock.json)
records their SHA-256 values and the original worktree commit; integration
can create a different cherry-pick commit.

This is a prospective **local** freeze, **not blinded or externally
registered**. The supplied data and expected reference counts, including the
known unfavorable case, were read first. The source-license copy initially
missed one terminal blank line. Source checking blocked the first experiment
launch before any packing ran; that byte-copy issue was corrected, with no
change to protocol, data, seeds, budgets, or acceptance rules. See
[`evidence/development.json`](evidence/development.json). No candidate was
tuned or substituted after measurement.

The study preserves seed **1729**, **20 paired permutations** for every
scenario, and all three seed reference controls. It adds three distinct,
bounded candidates:

- **Dual best-fit:** dominant-load item order, greedily choose the feasible
  tote with the smallest squared two-dimensional normalized residual.
- **Beam:** incoming order, retain up to 128 load-distinct partial packings
  at each depth; keep the input-first-fit incumbent as an explicit fallback.
  There were **zero fallback cases**. Exact integer score numerators avoid
  floating-point tie ambiguity.
- **Bounded exact:** depth-first improving search, scalar-slack lower-bound
  pruning and equal-load symmetry elimination; at most **12 items / 50,000
  nodes**. A baseline incumbent that already meets the bound needs no search.

The original JS xorshift32/FNV-1a/Fisher-Yates stream is completely specified
in the protocol. It is **not Python's random stream**. We reproduce the seed's
authored expected counts, not the unexecuted reference runner's trial arrays.

A candidate must strictly improve both authored and paired totals, with no
authored-case regression and no scenario's paired mean worse. Selection uses
lowest paired total, then authored total, then a fixed simplicity preference.
The same six methods receive the same incoming order on every paired case.

## Proof is more than feasibility

The exact input semantics are 11 CSV rows expanding to **29 instances**
(4 / 8 / 14 / 3). Preserve row order, then expand `sku-01`, `sku-02`, etc.
Each item is indivisible. Volume and weight must **both** be at most 10,
including equality. IDs are local to their scenario; no cross-scenario
packing is allowed. Shape notes are retained, not used as geometric facts.

The aggregate lower bounds are **2 / 4 / 6 / 2**. A valid packing attaining
its bound proves scalar optimality. Bulky-gaps cannot attain two: every pair
of volume-six items exceeds ten. Exhaustive search establishes optimum
three, despite aggregate lower bound two.

Across 84 authored-plus-paired cases:

- Beam closes its own aggregate bound in **63** cases. Its **21** bulky-gaps
  outputs lack a *method-local* proof, but the same-case bounded exact
  results independently certify their count of three.
- Bounded exact proves **69** results: 39 immediate bound equalities, nine
  bound equalities reached by search, and 21 exhausted searches. It is
  **size-skipped and unproven in 15** mixed-classroom permutations.
- No measured search hits 50,000 nodes. Node-limit non-proof behavior is
  exercised by a separate test fixture, not misrepresented as a study trial.
- All methods combined have **228 method-local unproven results**. A
  feasible upper bound is useful, but it is not silently promoted to proof.

The beam actually reaches its 128-state frontier cap and discards **12,423**
states across the 84 cases; this is genuinely bounded search, not hidden
exhaustion. Exact search visits **124** states in total, at most **nine** in
one case. Workload counters are reproducible but are not runtime benchmarks.

Combining beam's equality certificates with the bulky-gaps exhaustive
certificates shows that its counts attain the scalar optimum on every case
in this dataset. This does **not** make bounded beam search an exact general
solver or establish physical fit.

## Reproduce from the repository root

Use Node 20+ (the recorded run used Node v26.7.0). No install step.

```sh
node --test projects/04-invention/test/engine.test.mjs projects/04-invention/test/evidence.test.mjs projects/04-invention/test/ui.test.mjs
node projects/04-invention/scripts/experiment.mjs --check
node projects/04-invention/scripts/replicate.mjs --check
```

The first command passes **30 tests**, covering all reference counts, invalid input, inclusive
capacities, exactly-once verification, PRNG vectors, proof limits, an
independently written exhaustive enumerator on 40 small test fixtures,
complete result/gate recomputation, provenance, and offline UI interactions.
UI tests run original scripts in a minimal Node DOM adapter: they do not
claim actual browser layout, screen-reader or visual review.

`--check` is read-only and fails on changed input/protocol/code hashes,
assignments, traces, summaries or offline snapshot bytes. Repetition starts
two fresh Node processes, compares their complete output and saved evidence,
and independently reconstructs all 504 assignments from IDs and source
loads rather than trusting a solver's validity flag.

To explicitly regenerate only this project's evidence:

```sh
node projects/04-invention/scripts/experiment.mjs --write
node projects/04-invention/scripts/replicate.mjs --write
node projects/04-invention/scripts/checks.mjs --write
```

The last command records the actual manifest check commands, exit codes,
stdout/stderr, runtime and tested-code hashes in `evidence/checks.json`.
Repetition is by the same implementation in fresh processes, **not an
independent human replication**.

## Evidence map

- [`source/sources.json`](source/sources.json): exact seed/card/archive refs,
  copied data hashes, reviewed document refs, and inert executable exclusions.
- [`source/LICENSE`](source/LICENSE): MIT attribution, © 2026 Hive Hub
  contributors, for copied data and baseline expectations.
- [`evidence/dataset-audit.json`](evidence/dataset-audit.json): expanded IDs,
  all shape notes, scenario totals, capacities and lower bounds.
- [`evidence/baseline.json`](evidence/baseline.json): all 24 authored method
  results and 12 supplied reference-count checks.
- [`evidence/trials.json`](evidence/trials.json): all 480 paired method
  results, complete permutations, start/end PRNG state, exact tote contents,
  load/slack values, proof labels and per-method bounded traces.
- [`evidence/counterexamples.json`](evidence/counterexamples.json): every
  regression, unproven result, failed candidate gate, and beam fallback.
- [`evidence/result.json`](evidence/result.json): numeric summaries and the
  frozen decision. [`evidence/snapshot.js`](evidence/snapshot.js) is a
  generated **data-only** wrapper used by the offline UI; it contains no
  downloaded executable source.
- [`evidence/reproducibility.json`](evidence/reproducibility.json): two
  fresh-process output hashes and saved-artifact byte agreement.
- [`docs/assumptions.csv`](docs/assumptions.csv),
  [`docs/next-study.csv`](docs/next-study.csv),
  [`docs/decision.md`](docs/decision.md): assumption/falsifier ledger,
  unperformed next-study criteria and a conditional stop/continue decision.

## Hard boundaries

No physical tote packing, geometry, handling, real mass, lifting safety,
operator comprehension, cost, demand, novelty, patentability or market
validation was performed. No customer, savings, revenue, collaborator,
receipt or real-world observation is invented. A local worksheet may be
simpler than an integration-heavy service; that remains a hypothesis.

Seed `seed.json`, `initialize.json`, task board, synthetic intake, team scopes
and relevant documentation were reviewed as inert data. No downloaded
reference executable was read, imported, embedded or run. The logical seed
team roles informed the artifacts but were not claimed as activated teams
or independent reviewers. No native Hive setup, human acceptance, browser
session, external mutation, service, spending, outreach or publication occurred.
