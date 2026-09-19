# Agenda Pocket — room for reality

**Workstream 05 · original, offline local work product · not a public launch or
activated Hive.** The signature is an honest “cannot fit,” accompanied by a
proof and, where provable, a smallest **explicitly permitted** renegotiation.
No commitment disappears to make the numbers look better.

## Open and use

Open `projects/05-planner/index.html` directly from disk in a modern browser.
No server, account, install, external dependency, font download or network
request is needed. The existing shared stylesheet remains at
`../../assets/shared.css`; keep the repository layout when copying files.
This workstream did not start a service or use the shared browser.

1. Load a synthetic scenario. Pocket Arcade is the federation preset.
2. Edit the day, actual availability, cutoff, tasks and negotiation limits.
   Expand a task to edit windows, predecessor IDs, fixed start and duration floor.
3. **Check the whole agenda.** A feasible result contains every task. An
   infeasible result contains no purported schedule; an unknown result is not
   called impossible.
4. Review the conflict and the repair objective. **Approve this change** is an
   explicit edit of the input, not a booking. The new complete schedule is checked.
5. Export input or the current analysis as JSON. Reports import their input
   only; imported assertions of feasibility/minimality are discarded.

Nothing automatically persists. Reload discards unsaved edits. A failed import
does not replace the editor. Any input change invalidates old results, repair
buttons and analysis export. Import is capped at 64 KiB. Literal task labels
are rendered with DOM text/value properties, not interpreted as HTML.

### Sources and direct-file packaging

The source is plain ES modules: `engine.mjs`, `editor.mjs`, `presets.mjs` and
`app.mjs`. `app.bundle.js` is a dependency-free, mechanically generated
classic-script wrapper of **only those four original modules**, allowing
`file://` use without browser module-import restrictions. It is not downloaded
starter code. No eval or runtime source loading is used.

After editing these modules, from the **repository root**:

```sh
node projects/05-planner/tools/build.mjs
node projects/05-planner/tools/build.mjs --check
node --test --test-reporter=tap projects/05-planner/tests/engine.test.mjs projects/05-planner/tests/oracle.test.mjs projects/05-planner/tests/editor.test.mjs projects/05-planner/tests/artifacts.test.mjs projects/05-planner/tests/ui.test.mjs
node projects/05-planner/tools/record-evidence.mjs
```

Use Node 20+ with its built-in test runner; the actual tested version is recorded
in `evidence/result.json`. There is no package installation step.

## Stable coordinator API — v1

```js
import {
  validateAgenda, solveAgenda, verifySchedule,
  explainConflict, findRepairs, applyRepair, analyzeAgenda
} from "./projects/05-planner/engine.mjs";
import { getPreset } from "./projects/05-planner/presets.mjs";

const input = getPreset("arcade");
const analysis = analyzeAgenda(input);
// analysis.feasibility.status === "infeasible"
// analysis.repairs.optimum === { changedFields: 1, totalMinutes: 10 }
const choice = analysis.repairs.choices[0];
const revisedInput = applyRepair(input, choice); // does not mutate input
const proof = solveAgenda(revisedInput);
verifySchedule(revisedInput, proof.schedule);   // { valid: true, issues: [] }
```

All functions are synchronous, deterministic, and free of I/O. JSON input is
not mutated. `analyzeAgenda` is the preferred integration point. It returns
`agenda-planner-analysis/1` with `engineVersion`, normalized `agenda`,
`feasibility`, `conflict`, `repairs`, `limits`, and actual `settings`.
There is no event bus, calendar write, network protocol, or native Hive call.

| Function | Return contract |
|---|---|
| `validateAgenda(input)` | `{status: "valid" \| "invalid" \| "unsupported", issues, agenda}`. Normalized copy only when valid. Issues contain `path`, `code`, `message`. |
| `solveAgenda(input, options?)` | `agenda-planner-solution/1`; `status`, `schedule`, `message`, `proof`, `stats`. A complete schedule exists **only** for `feasible`. |
| `verifySchedule(input, schedule)` | `{valid, issues}`; independently checks all task IDs exactly once, duration, grid, both availability sets, bounds, fixed starts, overlap and dependencies. |
| `explainConflict(input, options?)` | `minimum-proven`, `unproven-minimum`, `unproven`, `not-applicable`, `invalid`, or `unsupported`; task IDs, included constraints, proof and subset/node counts where assessed. |
| `findRepairs(input, options?)` | `minimum-proven`, `none-within-policy`, `unproven`, `not-needed`, `invalid`, or `unsupported`; objective, choices and enumeration proof where assessed. |
| `applyRepair(input, choice)` | New normalized agenda. Rechecks permitted changes against the current input and verifies the choice's complete witness. Rejects stale/forged/disallowed changes by throwing. It does not authenticate an imported claim of optimality. |
| `analyzeAgenda(input, options?)` | All three phases. Invalid/unsupported input has `agenda: null` and conflict/repairs `not-assessed`. Unknown feasibility has no conflict/minimum claim. |

### Feasibility statuses

- **`feasible`** — a complete witness exists and can be independently verified.
- **`infeasible`** — a sound contradiction or exhaustive finite search proves
  there is no schedule **in this declared discrete model**.
- **`unproven`** — a node bound interrupted search. No schedule, impossibility,
  or minimum repair is inferred from the interruption.
- **`invalid`** — malformed input; not an infeasibility proof.
- **`unsupported`** — unknown constraints or model/size limits exceeded;
  feasibility not assessed. Unknown fields are never silently ignored.

`schedule` is `null` for every non-feasible status, not an optimistic prefix.
Schedule entries are `{taskId, start, end, duration}`, sorted by start then ID.
All times are integer minutes since midnight, not date/time strings.

## Input format — `agenda-planner/1`

Example standalone coordinator input: [`fixtures/pocket-arcade.json`](fixtures/pocket-arcade.json).
The other ready-to-import presets are `fixtures/library.json`,
`fixtures/disjoint.json`, and `fixtures/boundary.json`.

```json
{
  "schema": "agenda-planner/1",
  "title": "A declared small agenda",
  "classification": "synthetic",
  "day": {
    "start": 540,
    "end": 600,
    "stepMinutes": 5,
    "availability": [[540, 615]]
  },
  "tasks": [
    {
      "id": "opening",
      "label": "Opening",
      "duration": 10,
      "availability": [[540, 615]],
      "dependsOn": [],
      "fixedStart": 540,
      "kind": "event"
    },
    {
      "id": "round",
      "label": "Game round",
      "duration": 55,
      "availability": [[550, 615]],
      "dependsOn": ["opening"],
      "fixedStart": null,
      "kind": "task"
    }
  ],
  "repairs": {
    "latestEnd": 615,
    "durationFloors": {"round": 50}
  }
}
```

### Exact supported constraints and limits

- One same-day, single-track resource. **0–8 mandatory, nonpreemptive tasks**.
  Breaks are ordinary mandatory tasks, never background gaps.
- Positive integer durations; supported grids are **1, 5, 10, 15, 30, 60**
  minutes, anchored at midnight. Starts, ends, windows and floors align to the
  grid. There is no rounding or invented fractional time.
- `day.start < day.end <= 1440`. A task may finish at **24:00**, but not start
  there. No date, time zone, overnight rollover or DST interpretation.
- **120 grid slots maximum**, measured from `day.start` to
  `repairs.latestEnd`, including the full permitted extension envelope.
  The bound applies even if an input's current cutoff is smaller.
- Explicit **day and per-task availability** are both required. Each allows
  at most 16 `[start, end]` intervals within the same day. Empty arrays mean no
  availability. Overlapping/touching windows are union-normalized on a copy.
  A task must fit continuously in both unions; it cannot cross a gap.
- Intervals are half-open `[start, end)`: one task can start when another ends.
  Availability outside the cutoff is merely declared possible time, unusable
  until an explicit cutoff change is approved.
- `dependsOn` is required; it lists IDs that must **finish before or at**
  this task's start. IDs must exist and be unique; cycles/self-dependencies
  are supported input and provably infeasible with positive durations.
- Optional `fixedStart` is an integer or `null` (default `null`). A fixed task's
  start **and duration** cannot be repaired. `kind` defaults to `task`;
  `task`, `break`, `event` are display categories, not extra scheduling rules.
- IDs match `^[a-z][a-z0-9-]{0,31}$`; nonblank titles/labels are at most 120
  characters. `classification` is `synthetic` or `user-entered`, a declaration
  rather than a verification of the origin of the content.
- `repairs` can be omitted for **no permitted changes**. `latestEnd` defaults
  to the current cutoff. Missing duration floors mean the existing duration
  cannot change. Floors must be positive, aligned and no greater than the
  current duration. Fixed-event floors cannot be lower than their durations.
- Optional tasks, dropped commitments, parallel resources, split tasks,
  priorities, task-value optimization, recurrence, transport/setup buffers,
  ambiguous natural-language times and extra constraints are not supported.
  Model explicit setup/travel/break durations as tasks if needed.

## Proof semantics, not heuristic promises

### Feasibility

Each task's finite domain contains **every** grid start for which its full
duration lies inside both declared availability unions, the day bounds and
its fixed-start constraint. Exact depth-first search chooses the most
constrained unassigned task, but tries every remaining value. Pruning uses
only occupied time or assigned finish-to-start constraints. Both predecessor
and successor assignments are checked; input order does not impose chronology.

Sound early proofs cover positive-duration dependency cycles, total duration
exceeding the union of available time within the day, empty legal domains and
overlapping fixed events. Otherwise only complete search proves infeasibility.
A search bound propagates `unproven` immediately. An arithmetic proof can be
valid even at zero search nodes; a node limit is not itself a proof.

### Conflict core

The engine enumerates task subsets by increasing cardinality. For a diagnostic
subset it keeps the day, single-track rule, all included task attributes, and
**induced dependencies** whose endpoints are both included. A subset found
infeasible after all smaller subsets were conclusively feasible is a
**minimum-cardinality task core**. One tied core is returned.

This is **not** a minimum atomic-constraint set, and it never authorizes
dropping those tasks from the actual agenda. If subset/node bounds interrupt
the proof, the already-proven full task set is returned as a valid conflict,
with `unproven-minimum` and `minimumCardinalityProven: false`.

### Smallest repair

Objective ID: **`fewest-fields-then-minutes/1`**. The cost is lexicographic:

1. Minimize the count of changed fields (`day.end` is one field, each changed
   task duration is one more).
2. Among equal field counts, minimize the sum of absolute changed minutes.

The complete finite repair family comprises only:

- Increase the cutoff by grid steps, up to the declared `latestEnd`.
- Decrease an explicitly negotiable **unfixed** task duration by grid steps,
  no lower than its declared floor.

All tasks, availability, dependencies, fixed starts and fixed-event durations
remain unchanged. A shortened duration is an explicit proposed scope/timebox
renegotiation; it is **not** a claim that the same work now takes less time.
The objective does not measure importance, utility, or work lost. The
`lexicographic-repair` fixture deliberately prefers one 25-minute extension
over two reductions totaling 10 minutes.

Enumeration proceeds in increasing `(changedFields, totalMinutes)` order,
with exact feasibility checking of each candidate. A first complete feasible
witness proves minimum cost **only after all cheaper candidates have been
proven infeasible**. A lower-cost interrupted candidate stops the minimum
search with `unproven`, not a heuristic best guess.

`minimum-proven` includes `optimum`, `choices`, and a proof recording checked
candidate counts, the exact candidate-space size (decimal string), and cheaper
candidate completeness. Up to four tied optima are normally displayed.
`tiesComplete: false` means more equally optimal choices may exist, not that
the displayed minimum is unproven. `none-within-policy` is returned only after
the entire finite family is ruled out; it says nothing about repairs outside
that family. Merely extending the cutoff cannot invent availability.

### Reproducible search bounds

Options are nonnegative integers, except `maxChoices >= 1`:

| Option | Default | Meaning / hard limit |
|---|---:|---|
| `maxNodes` | 20,000 | Feasibility DFS nodes; max 1,000,000 |
| `maxCoreNodes` | 20,000 | Shared node budget across all core subset searches; max 1,000,000 |
| `maxCoreChecks` | 255 | Task subsets considered; max 255 |
| `maxRepairNodes` | 60,000 | Shared node budget across repair feasibility searches; max 1,000,000 |
| `maxRepairCandidates` | 2,500 | Nonzero change vectors checked; max 100,000 |
| `maxChoices` | 4 | Tied verified choices retained; max 20 |

Each entered partial-assignment DFS call, including a completed assignment,
counts as one node. Domain construction and sound arithmetic/cycle checks
are bounded by model limits but do not consume nodes. Budgets are independent
between feasibility, core and repair phases. Pure API calls throw for malformed
options; agenda data errors are returned as statuses. The browser uses the
default core/repair bounds and exposes three feasibility bounds. It runs
synchronously after yielding for paint; a difficult bounded case may still
briefly occupy the main thread. There is no claimed wall-clock SLA.

## JSON exports and federation handoff

`editor.mjs` exports `createExport(agenda, analysisOrNull)`, `parseImport(text)`,
clock/window codecs and `timelineSegments(agenda, validSchedule)`.
An export has schema `agenda-planner-export/1`, `content` (`input-only` or
`current-analysis`), explicit `status`, normalized `agenda`, and `analysis`
or `null`. A stale analysis throws rather than being attached to edited input.
Invalid/unsupported text cannot replace the editor or masquerade as a result.

**Pocket Arcade:** `getPreset("arcade")` and `fixtures/pocket-arcade.json` are the
stable handoff. Seven commitments total **85 minutes**, with a **75-minute**
initial cutoff, a fixed 14:00 check-in and two five-minute breaks. The synthetic
venue is declared available to 15:30. Minimum cost is `(1 field, 10 minutes)`:
extend the cutoff from 15:15 to 15:25, or negotiate any one 20-minute round down
to its declared 10-minute floor. All choices preserve rounds, breaks and
ordering. No game data, scores, actual venue booking or real tournament is
inferred or transmitted.

## Seed use and deliberately changed scope

Read [`provenance.json`](provenance.json) and
[`docs/task-mapping.md`](docs/task-mapping.md). `seed.json`, `initialize.json`,
intake, task board, six team scopes and relevant source data/specifications
were reviewed as **inert data** against `evidence/seed-verification.json`.
Seven non-executable source/license files are copied byte-for-byte with hashes.
MIT attribution is preserved in `data/source/LICENSE`.

The seed's reference behavior greedily parks optional topics. **That is not
this implementation.** The requested extension makes every commitment
mandatory, adds windows/dependencies/fixed events and proves bounded exact
repairs. The seed's old numerical acceptance file is preserved as historical
data, not claimed to pass under this different contract. The library preset
reuses six IDs/labels/durations, explicitly adds wrap and new synthetic
availability/negotiation assumptions. “Optional” in copied labels is text,
not permission for the engine to omit a task.

No downloaded starter executable was run, imported, embedded or used as an
implementation dependency. No seed/native task states or team approvals were
changed. The parent owns all repository-wide work and external approval gates.

## Evidence and remaining gates

- `fixtures/adversarial.json`: overload, disjoint availability, dependency
  conflict/cycle, fixed collisions, valid midnight boundary, malformed input,
  unsupported constraint, feasibility/core/repair bounds, two-field minimum,
  objective tradeoff, and no-invented-availability cases.
- Built-in Node tests include independent exhaustive oracles: **1,000** small
  start-domain models, **250** finite repair policies, **150** task-core models.
  This is numerical/model validation, not a user study.
- Node-only DOM-double tests exercise the actual original bundle's event
  flows without a shared browser. They do **not** observe browser rendering,
  assistive technology or direct-file browser behavior.
- `evidence/result.json`, `evidence/check-01.tap`, and
  `evidence/fixture-results.json` are actual reproducible run results.
  Source/artifact hashes bind them to the checked candidate.
- `docs/manual-checks.json`: browser/keyboard/screen-reader/narrow-layout
  gates remain **not observed**. No accessibility certification is asserted.
- [`docs/launch-draft.md`](docs/launch-draft.md) and [`docs/FAQ.md`](docs/FAQ.md):
  local invitation and support draft only. Publication, market validation,
  purchases, outreach, telemetry, native activation and media production have
  not occurred and are not authorized by these artifacts.
