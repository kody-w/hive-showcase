# A lab paid to prove itself wrong

## Local protocol freeze, version 1

This file and `protocol.json` are to be committed **before any original
candidate comparison is executed**. The later evidence records that commit
and both file hashes. This is a prospective **local** freeze, not a blinded
study, independent registration, or external timestamp. The four synthetic
inputs and their supplied expected baseline counts have already been read.
In particular, the dominant heuristic's mixed-classroom regression is known
before this work begins. No new candidate outcomes have been measured.

The input-order reference uses 3, 4, 6, and 3 bins respectively. The reviewed
dominant and volume controls must also reproduce all supplied counts.
Reference Python programs and their tests remain inert; the implementation
will be original browser JavaScript with original Node tests.

## Three different bets, three ways to fail

1. **Dual-capacity best-fit:** change local bin selection, not just sorting.
   The hypothesis is that consuming both kinds of remaining capacity avoids
   stranded slack. A locally tight bin can still destroy a future pairing.
2. **Beam search (128 states):** retain several partial assignments across
   successive incoming items rather than commit to one greedy choice.
   Deduplicate load-equivalent states and bound memory. It can prune away the
   optimum. Keep the input-order incumbent as an explicit fallback; report the
   raw beam count and every pruning count, not an imaginary exact proof.
3. **Bounded exact search:** search all non-symmetric improving assignments
   until proof, 12-item size limit, or 50,000-node limit. Start only with
   incoming-order first-fit. This is not a scalable oracle: the 14-item
   mixed-classroom case can be proved by lower-bound equality, but otherwise
   must be labeled size-skipped and unproven.

Detailed sorting, scoring, symmetry, tie-breaking and stopping rules are
frozen in `protocol.json`. All three are known algorithm families, not claims
of an inventive or patentable algorithm. Implementations will be original.

## Identical cases; no disappearing losses

Preserve all four scenarios, exact per-row item expansion, and two inclusive
integer capacities. Run all six methods on each authored order and on each
of 20 paired permutations per scenario. Preserve seed 1729, but specify an
original xorshift32/FNV-1a/Fisher-Yates stream explicitly rather than borrow
or execute the downloaded Python implementation. Thus this study does **not**
claim matching Python permutation arrays.

There will be **24 authored results and 480 paired method results**.
Every result includes the complete incoming order and assignment, both
loads and slack, lower bound, proof status, and bounded algorithm trace.
Every result is checked again independently from its item IDs. Invalid input
stops the run; no valid trial may be excluded. Report every paired loss as
well as every win. Descriptive means are not population estimates.

## Frozen success / failure gate

Before considering improvement, all 12 supplied reference counts must match;
all 504 method assignments must be valid; every trial must be present; and
fresh-process reruns must agree exactly.

A candidate passes only if it:

- Saves at least one bin in total across the four authored cases, with no
  authored-case regression.
- Saves at least one bin across all 80 paired cases, with no scenario's
  paired total worse than input-order first-fit.

Select the lowest paired total among passing candidates, then the lowest
authored total, then the fixed preference best-fit, beam, exact. Do not pick a
method because one favorable trial looks good. If none passes, the result is
a reproducible negative result under this gate. Do not silently adjust the
gate, search budgets, or seed after execution.

## Proof and non-proof

The aggregate lower bound is
`max(ceil(total volume / 10), ceil(total weight / 10))`. Equality with a valid
packing proves optimal bin count in this scalar model. A larger feasible
count is only an upper bound unless exhaustive search proves it. The known
bulky-gaps case requires three indivisible six-volume items in three bins;
its aggregate lower bound of two is not attainable. Explicitly distinguish
bound equality, exhausted search, size-skipped search, node limit, and beam
pruning. Record workload counts; make no runtime-speed comparison.

## Stop outside the scalar model

The prototype will show exact item IDs, tote loads and remaining capacity,
plus printable instructions. It does not establish geometry, actual mass,
safe lifting, handling time, accessibility, kit cohesion, operator usefulness,
novelty, patentability, cost savings, or demand. Later harmless mock-fit and
comprehension studies require separate approval; their results remain
**not performed**. A useful computational result licenses neither a business
claim nor native Hive setup, human acceptance, outreach, spending or publication.
