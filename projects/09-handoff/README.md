# 09 · The receipt that counted twice — public projection

An original offline maintenance utility reproduces the seed's specified
`ll-duplicate` defect. **One real separate Astra continuation performed the
original repair. No new continuation was run for this publication projection.**
This is a clean-room synthetic exercise, not an upstream patch.

Open [index.html](index.html) directly from disk or beneath the site's repository
prefix. Its relative local scripts play back recorded Python frames preserved
in **redacted, derived historical records**. They do not run Python in-browser.

## Public versus private evidence

The canonical private checkout and its original sealed records were not changed.
Only this isolated public projection has been edited.

- [HANDOFF.md](HANDOFF.md), [ACCEPTANCE.json](ACCEPTANCE.json), the three fixtures,
  and [provenance.json](provenance.json) retain their original bytes. The handoff
  describes the **historical unfinished midpoint**, not today's assignment.
- The repaired utility, CLI, original strict checker, and 19 ledger tests retain
  their original repaired bytes.
- The [original midpoint source snapshot](evidence/midpoint-receipt-ledger.py)
  matches the historical source SHA-256. It is this project's original code,
  not downloaded reference code. The [one-line diff](evidence/repair.diff)
  changes reduction from all validated receipts to validated unique IDs.
- `before.json`, `continuation.json`, `after.json`, and the pre-edit baseline are
  explicitly labeled historical derivatives. Numeric observations, exit codes,
  test counts, acceptance targets, and fixtures are unchanged. Machine paths
  are omitted or rebased; log hashes now identify the **published** bytes.
- `recovery.json` is a selected, derived historical recovery summary.
  `historical-continuation.json` preserves the truthful historical fact and
  limitations. Raw invocation records, private execution identifiers, internal
  coordination instructions, and registry metadata are excluded.
- `input-hashes.json` labels original historical hashes separately from the
  six preserved public inputs and four unchanged source/test files.
  `public-integrity.json` independently hashes **all current project files**
  except itself. A matching public hash does not imply an unredacted transcript.
- The `publication_checks` binding in `result.json` selects the current **new
  local public-projection checks**, not a new continuation or a replay of the
  historical session. Earlier genuine publication checks are retained separately.

### What remains publicly verifiable?

The original code snapshots, exact one-line fix, all fixture bytes, unchanged
criteria, every before/after replay frame, CLI output, and current public hashes.
The verifier executes both included original implementations against the same
synthetic fixtures; it cannot simply accept a claimed success flag.

The underlying private invocation, executor identity, inaccessible original
records, or provider-internal isolation cannot be independently reverified from
this public edition. The original no-earlier-chat account remains **executor
self-report**, not an external attestation.

The continuation recovered the contract, failure, already-working ordering,
validation boundaries, raw-versus-unique accounting, and next action. Missing
context included the earlier conversation, undocumented reasoning, independently
rechecked source archive, real data, human review, and upstream/browser validation.

## Historical outcomes — not rewritten for publication

| Historical phase | Strict acceptance | Ledger regressions |
| --- | --- | --- |
| Frozen midpoint | 2 pass / 1 fail; exit 1 | 15 pass / 1 fail; exit 1 |
| Separate continuation | 3 pass / 0 fail; exit 0 | 19 pass / 0 fail; exit 0 |
| Original coordinator recheck | 3 pass / 0 fail; exit 0 | 19 pass / 0 fail; exit 0 |

The failing fixture has four records but three unique IDs. Before repair it
counts 4 global events / 3 cache-item events; afterward it counts 3 / 2.
The clean and ordering cases already worked. The seed's full two-defect
release gate is not claimed complete.

Historical private commit hashes are retained as informational references:
`97dac1b6bdcfcfbae5ebdb43bbfdc0854335030e` (midpoint) and
`849660c39cd53277f37ba3dddf8f7ccd553cf910` (repair).
**Their Git objects are absent from fresh public history.** No check needs them,
an old checkout, a provider session, or any machine-specific location.

## Reproduce from an exported snapshot

Python 3.9+ standard library and Node 18+ built-ins; no installation or service.
Run every manifest command from the repository root:

```sh
python3 -B projects/09-handoff/tools/verify_inputs.py
python3 -B projects/09-handoff/tools/check_acceptance.py
python3 -B -m unittest discover -s projects/09-handoff/tests -p test_ledger.py -v
python3 -B projects/09-handoff/tools/build_demo.py --check
node --test projects/09-handoff/tests/replay.test.cjs
python3 -B -m unittest discover -s projects/09-handoff/tests -p test_public_projection.py -v
python3 -B projects/09-handoff/tools/verify_evidence.py
```

The last command verifies the current public-byte inventory and reproduces the
historical frames from the included original midpoint and repaired code. It
reports the historical invocation's public-verification limit explicitly.
Privacy tests reject nested private metadata; integrity tests reject changed
bytes, extra files, changed numerical observations, and false success flags.
DOM tests are not a real browser or visual review.

### Maintaining publication evidence

`tools/build_demo.py` regenerates the data-only replay and CLI export.
`tools/capture.py` captures the manifest checks preceding the final binding
audit, refuses overwrites, and labels them as new publication checks. Its
output contains only repository-relative paths; rebased process-output paths
are disclosed per channel and remaining private metadata aborts capture.
Historical phase names are not accepted.

```sh
python3 -B projects/09-handoff/tools/capture.py --output evidence/publication-recheck.json
python3 -B projects/09-handoff/tools/seal_public.py
python3 -B projects/09-handoff/tools/verify_evidence.py
```

An additional capture is supplementary until a maintainer explicitly updates
the result's check-record binding. Regenerate the public integrity manifest
after intentional changes; never change acceptance targets or numerical history
to make a check pass. `seal_public.py --check` is read-only.

## Pocket Arcade maintenance consumer

```sh
python3 -B projects/09-handoff/cli.py projects/09-handoff/fixtures/duplicate.jsonl
```

The [maintenance JSON](artifacts/pocket-arcade-maintenance.json) remains
byte-identical and retains `pocket-arcade-maintenance/1`. Its
[consumer contract](artifacts/maintenance-contract.json) remains unchanged.
It reports 4 raw records, 3 unique events, 1 replay, `arcade-input` open, and
`release_authority: false`. No consumer change is needed for this artifact.

Evidence consumers must adapt: `result.json` is now `handoff-public-result/1`;
historical validation and new publication checks are separate; private identity
and invocation fields are gone. `continuation-run.json` is excluded, replaced by
`historical-continuation.json`. Replay metadata is `handoff-browser-replay/2`;
historical commit fields are explicitly named, and no executor identifier is
embedded. Consumers binding evidence hashes must rebind the actual public files.
Project 10 is not modified here.

## Bounds, attribution, and limits

Inputs require exactly five allowlisted fields and explicit `SYNTHETIC`.
Limits remain 1 MiB, 16 KiB per line, 5,000 raw records, 40-character restricted
IDs, and integer minutes in 0–1,000,000. Identical IDs count once; conflicts are
rejected after complete validation. Different IDs remain distinct. Ordering is
minute then event ID, items are sorted, and inputs are not mutated. The CLI
reads one selected regular non-symlink file and writes only stdout/stderr.

The reviewed `open-source-infrastructure-foundation` seed declares the MIT
license. Its source identities and original attribution/provenance are preserved
unchanged in `provenance.json`. No downloaded starter code, reference code,
copied event fixtures, or prose passages are distributed as this utility.

All observations are synthetic. No new human, real-user, upstream, or browser
validation is claimed. Public byte integrity is neither a signature nor proof
of executor identity. This work performs no remote operations; only the
coordinating publisher may publish the reviewed showcase.
