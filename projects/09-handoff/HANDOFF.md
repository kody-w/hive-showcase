# Sealed midpoint: repeated maintenance receipts

## State at the boundary

This is a real unfinished implementation, not a review of a completed fix.
The clean-room Python maintenance utility exists and its desired-behavior
acceptance command fails. The original failing output is preserved in
`evidence/before-acceptance.stdout.txt`; the regression output is in
`evidence/before-tests.stdout.txt` and `evidence/before-tests.stderr.txt`.
`evidence/before.json` binds those outputs to commands, exit codes, fixture
hashes, expected/actual summaries, and recorded replay frames.

The checkout's starting `HEAD` is the frozen midpoint. Record its actual SHA
before editing. Inputs and the acceptance contract are checksummed in
`evidence/input-hashes.json`. The first context stopped before repairing the
defect. No second-context outcome has yet been observed.

## Purpose and scope

Build a small maintenance kit that the local Pocket Arcade can consume:
explicitly SYNTHETIC open/close receipts become a deterministic per-item
maintenance summary. It is not gameplay telemetry, a service, a queue,
an authority-bearing protocol, or approval to release anything.

The seed is `open-source-infrastructure-foundation`, case
`line-ledger-repair-cycle`. Its issue register specifies `ll-duplicate`,
repeated identical event IDs being counted as additional events. This is
an original bounded reproduction of that named defect, not an upstream
patch or discovery of a new bug. No downloaded source has been executed,
imported, embedded, or packaged. `provenance.json` records the inert sources
reviewed and their verified hashes.

The seed also names `ll-order`. Chronological order with an event-ID tie
break is already implemented here and covered by passing tests. There is no
claim that this single-defect exercise completes the seed's full repair cycle.

## Inputs and decisions that survive the swap

- `ACCEPTANCE.json` is the fixed, scoped contract. Each fixture has three
  unique events. `duplicate.jsonl` has four records because one is replayed.
- Fixtures use original fictional Arcade maintenance identifiers and minutes.
  They are not copied seed fixtures or observations from real players.
- `receipt_ledger.py` is the pure core. `cli.py` reads one selected ordinary
  file and prints a JSON artifact; it does not overwrite any inputs.
- The serialized event shape and limits match the reviewed seed behavior:
  five exact fields, explicit `SYNTHETIC`, restricted IDs, two actions,
  integer minutes, complete validation, conflict rejection, byte/line/count
  bounds, no duplicate JSON keys, and no input mutation.
- The library uses immutable receipt values. A summary contains total events,
  open/closed counts, and item rows sorted by item ID.
- `maintenance_report` wraps the result as `pocket-arcade-maintenance/1`.
  Its open-item list is a local repair queue, never a release authorization.
- There are no runtime dependencies, installation steps, services, credentials,
  external recipients, real team memberships, or approved publication.

## Next action

From the repository root:

```sh
python3 -B projects/09-handoff/tools/verify_inputs.py
python3 -B projects/09-handoff/tools/check_acceptance.py
python3 -B -m unittest discover -s projects/09-handoff/tests -p test_ledger.py -v
```

Reproduce the failing desired-behavior check, inspect the local implementation,
and make the smallest complete repair that satisfies the unchanged contract.
Keep the clean case, ordering, equal-minute tie, input bounds, conflict
rejection, and immutability behavior passing. Do not reinterpret the failure
as success or remove a failing test.

Then run:

```sh
python3 -B projects/09-handoff/tools/capture.py continuation
```

Write `evidence/recovery.json` per the local `AGENTS.md`, honestly including
anything this handoff did not preserve. Commit the actual fix, tests, captured
output, and recovery account within this project only. Report the commit and
commands/results. The coordinator, not you, will integrate and present it.

## Deliberately absent

No transcript or previous provider session is supplied. The handoff carries
artifacts rather than a patch, algorithm prescription, or promised outcome.
Visual presentation, final coordinator evidence, and the actual continuation
agent ID are not known at this midpoint. A real-world input sample, independent
human review, an upstream test run, browser validation, and permission to
publish are absent and are not prerequisites for this bounded local repair.
