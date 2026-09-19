# Agenda Pocket — local FAQ and recovery draft

**Unpublished local support copy.** No customers, staffed support operation,
response SLA, user feedback, research outcome or external distribution exists
as a result of this work.

## What does the planner do?

It checks a small, explicitly declared single-track agenda. Every task is
mandatory. It either provides a complete schedule, proves a conflict in the
supported model, or says the bounded search did not prove the answer.
Dates, calendars, recurrence and multiple simultaneous rooms are out of scope.

## “There are enough minutes. Why does it still fail?”

Tasks cannot be split across gaps. Thirty minutes of uninterrupted work will
not fit into two twenty-minute windows. A dependency can demand the wrong
ordering, or fixed events can overlap. The conflict panel includes the
relevant tasks, windows, durations, dependencies and unchanged day constraints.
Its smallest-core claim refers to **task count**, not individual constraint count.

## Are these really the smallest repairs?

Only when the result says `minimum-proven`, and only under the displayed
policy and grid. We minimize **changed field count first, changed minutes
second**. The engine excludes every cheaper permitted candidate using exact
checks. It does not optimize task value or guess preferences.

A smaller number of edited fields can mean a larger total minute change:
the adversarial objective fixture chooses one 25-minute extension rather
than two edits totaling 10 minutes. Change the declared scope yourself if
that objective does not suit you; other objectives are not supported in v1.

## Did it magically make my work shorter?

No. A shorter task is a proposed renegotiated timebox or scope. Set its floor
equal to its current duration to forbid shortening. Fixed events cannot be
shortened. Approving a proposal changes the input; it does not prove the same
work or outcome can be achieved in less time.

## Can extending the cutoff make up availability?

No. Day and per-task windows stay unchanged. The extra time must already be
declared available. Synthetic presets explicitly declare additional
availability; that is not evidence that your real room or participants are
available. Confirm those facts yourself before using the model.

## What happens to optional topics or breaks?

There are **no optional topics** in this model. Even the copied library labels
containing the word “optional” remain mandatory. The seed's old greedy parking
behavior is not reproduced. Breaks are mandatory tasks and cannot disappear
as slack. Removing a row is an explicit editor action by you, not a solver repair.

## What does “unknown” or “unsupported” mean?

- **Unknown / unproven:** search stopped at a disclosed bound. Increase the
  bound within the documented API limits or try a smaller valid input. Do not
  infer impossibility, feasibility, minimality or absence of repairs.
- **Unsupported:** an unrecognized field/constraint, grid, task count or
  repair envelope is outside v1. The field was not silently ignored.
- **Invalid:** fix the named types, IDs, windows, grid alignment or missing
  dependencies. Malformed input does not prove your real-world plan impossible.
- **No repair within policy:** the entire permitted finite repair family was
  ruled out. A different expressly declared policy might work, but this tool
  does not relax your windows or dependencies for you.

## How do I import, save or recover a draft?

Use Local files & exact JSON. Import a `agenda-planner/1` input or a
`agenda-planner-export/1` report, up to 64 KiB. Imported report conclusions
are not trusted or restored; only the validated input is loaded.

Nothing autosaves. Export before reloading or closing. A failed import leaves
the current editor and result intact. Editing any agenda field disables old
analysis export and removes old repair choices until a new check. Input-only,
infeasible and unknown exports explicitly label their status, and cannot be
mistaken for a valid schedule without ignoring that status.

The historical seed files in `data/source/` are attribution/source artifacts
using the seed's old schema, not directly importable new-model agendas.
Use `fixtures/pocket-arcade.json` or the other root `fixtures/*.json` presets.

## Does it send or store my meeting details?

The application has no network client, account system, analytics, automatic
storage or cloud synchronization. Only explicit local file selection/export
uses browser file facilities. Browser extensions and OS behavior are outside
the app's boundary; this is not an absolute confidentiality guarantee.

## Is it tested or launched?

Actual Node test logs, fixture outputs and source hashes are in `evidence/`.
They include independent exhaustive checks of feasibility, task-core size
and minimum repair costs. A Node DOM double tests event wiring without
opening a browser.

Browser rendering, keyboard-only walkthroughs, screen-reader behavior and
320px/200% layout observations are **not observed** by this workstream.
No user study, adoption metric, time-saved claim or public launch is claimed.
The local candidate is not a supported commercial service.

## How would I report a problem without exposing private content?

There is no submission endpoint. For a later owner-approved review, first
reproduce with synthetic labels. A minimal optional intake would contain:

| Field | Purpose | Required? |
|---|---|---|
| Synthetic input JSON and current status | Reproduce the model case | Yes, only if you choose to share |
| Action and expected vs. observed outcome | Distinguish model disagreement from UI trouble | Yes for useful review |
| Engine version and search settings | Reproduce a bound or contract | Yes for numerical review |
| Browser/version and offline vs. local preview | Reproduce browser-only behavior | Optional |
| Consent to retain the supplied reproduction | Define any later retention boundary | Separate explicit decision |

Do not include personal agenda text, names, calendar tokens or credentials.
No intake has been collected, no retention policy is activated, and no
response time is promised.
