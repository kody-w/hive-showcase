# Pocket Arcade

An original, dependency-free local integration of a robot game, finite
tournament planner, tabletop design files and an artifact-only maintenance
handoff. **This public-safe projection binds four actual contributions.
Publication of the reviewed static showcase is owner-authorized; deployment
belongs to the coordinating publisher.** This does not grant native,
operational, human, physical or market approval. The original tournament
cutoff remains infeasible; its verified alternative is an **unapproved
synthetic-model proposal**. A fixture-test pass is never a real contribution
pass.

Open `projects/10-pocket-arcade/index.html` directly from disk, or use the
published repository site. URLs remain relative below `/hive-showcase/`.
No service or remote operation is started by this project's tools.
The direct-file page, original printable kit, station links and local notes
download work without a server. Browsers generally block neighboring-file
reads in `file:` mode, so availability and hash verification are explicitly
unknown there; use the Python CLI for actual file validation.

## The user journey

1. **Game Studio:** open `../01-game-studio/index.html`, play the original
   robot game, and inspect its deterministic replay. The game owns its rules
   and controls. This hub does not assume a scoring or `postMessage` API.
2. **Product Launch:** open `../05-planner/index.html`, choose its tournament
   preset and set a finite budget. Only a feasible plan is actionable;
   overflowing required work must be refused rather than presented as feasible.
3. **Micro-Manufacturing:** open `../07-manufacturing/index.html`, inspect the
   parameterized tray and fabrication-review downloads. The prime's
   `artifacts/operator-kit.html` supplies four host instructions, eight blank
   alias cards and an observation sheet. Card-to-tray physical fit is unverified.
4. **Infrastructure Foundation:** open `../09-handoff/index.html`, inspect the
   current maintenance utility and labeled historical public projection.
   Behavior is reproducible from included artifacts; private invocation
   identity cannot be independently reverified from the public projection.

Station selection and link navigation do **not** mark a task or contribution
complete. The optional session-note download is clearly classified as
user-authored notes, not tournament results or integration acceptance. Notes
are held in memory; no cookies, accounts, analytics or automatic persistence
are used.

## Explicit interfaces

`contract.json` is the executable data contract. The contribution record's
structural schema is `interfaces/contribution.schema.json`. It is inert JSON
Schema documentation; the original standard-library validator enforces the
contract without fetching schemas or installing a schema package.

| Project | Interface | Required artifact roles | Acceptance gate IDs |
| --- | --- | --- | --- |
| `01-game-studio` | `pocket-arcade/browser-game/1` | `engine`, `replay` | `game-playable`, `game-deterministic`, `game-honest-scope` |
| `05-planner` | `pocket-arcade/tournament-plan/1` | `tournament-plan` | `planner-finite`, `planner-refuses-overflow`, `planner-offline` |
| `07-manufacturing` | `pocket-arcade/tabletop-accessory/1` | `tray-design`, `fabrication-review` | `tray-geometry`, `tray-review`, `tray-unbuilt-disclosure` |
| `09-handoff` | `pocket-arcade/maintenance-handoff/1` | `maintenance-tool`, `handoff` | `maintenance-contract`, `maintenance-reproducible`, `maintenance-artifact-only` |

Every contribution supplies its own `manifest.json`, `index.html` and
`evidence/result.json`. The manifest must match its exact ID, seed slug,
entrypoint and `work-produced` stage and contain title, summary, CLI-argument
`checks`, artifact paths and limitations. All artifact paths stay within that
contributor's project. Symlinks, path traversal, remote URLs, private-store
paths and out-of-scope artifacts are rejected.

Dependencies describe **integration readiness**, not a claim that the apps
share stores or runtime APIs: game → planner → tabletop → maintenance. Each
later contribution requires all earlier integration gates. Its standalone
app can remain independently useful when the combined experience is blocked.

### Exact binding format

`contributions.json` contains four `received` entries, exact artifact locks,
16 component-command records and all 12 local content gates. Nine unchanged
01/05/07 check records are preserved byte-for-byte; seven current public 09
commands are newly captured. No unchanged company workflow is repeated by
the publication refresh. The validator derives four `accepted-local` dispositions and no
dependency blockers. That disposition grants no native or real-world
authority. A received entry must have:

- `state: "received"` and the exact contracted `interfaceId`.
- `sourceCommit`: optional **historical metadata**, not a required public
  Git object, current revision lookup or signed provenance attestation.
  The current maintenance projection uses file hashes rather than a private
  source-commit dependency. No native receipt is manufactured.
- `manifestSha256`: lowercase SHA-256 of the exact manifest bytes.
- `files`: `{path, sha256, bytes}` for the **exact union** of the manifest's
  artifact paths, its entrypoint and `evidence/result.json`. Extra/missing or
  duplicate locks fail; all hashes and byte counts are recomputed.
- `roles`: each contracted role mapped to a locked path with an allowed
  extension. The validator reads executable artifacts as bytes, never imports
  them, and does not claim semantic proof from an extension alone.
- `gates`: every contracted ID exactly once, with `state: "pass"` and
  `proof: {path, sha256, pointer, equals}`. The proof uses an RFC 6901 JSON
  pointer into that contributor's `evidence/result.json` or the prime's
  `evidence/acceptance/<project-id>.json`. The source's actual hashed field
  must equal `true`, `"pass"`, `"passed"`, `"verified"` or
  `"local-checks-passed"` without type coercion. A descriptive `note` is
  optional. Missing, false or non-success values fail.
- `checkRuns`: one `{argv, exitCode, output}` per manifest check, with the
  **exact argument array**, integer exit code `0` and nonempty hashed output
  lock. Output must be an actual captured file at
  `projects/10-pocket-arcade/evidence/checks/<project-id>-<name>.txt`.
  An optional `recordedAt` string preserves the observation time.
  For a silent check, preserve an honest transcript of the exact command,
  observed exit code and empty stdout/stderr instead of inventing output.

If a partner's result format has no specific acceptance field, integration may
write a bounded prime review in its own acceptance directory, citing the
actual artifact, relevant test output and limitation. It must not invent
partner fields or treat an unrelated success flag as evidence for a gate.
The gates are a content-and-recorded-check contract: their semantic review
must be honest, and their sources remain inspectable.

The validator **never executes the commands it reads**. Checks must first be
reviewed and run separately against the relevant source files; their
real output is then bound. Recorded outputs and hashes are not cryptographic
proof that a command ran, not a browser usability test, and not a signature.

The optional root `integrationArtifacts` array also locks the prime's actual
consumer, browser scripts, connected data and captured-record JSON. These
must be unique nonempty files in the prime project, never foreign stores or
self-referential contract/record locks.

## The four real contributions now connected

The current bindings use public file paths and SHA-256 values. They work in
a relocated snapshot with fresh Git history and never resolve private Git
objects. Historical digests retained in original check records are labeled
informational metadata, not current source-identity attestations.

| Contribution | Check provenance | Actually consumed interface |
| --- | --- | --- |
| Game Studio | Two preserved valid command records; not rerun for this refresh | `engine.js`, `release-trained.json`, retained `release-untaught.json`, `little-signals-score/1` |
| Product Launch | Four preserved valid command records; not rerun for this refresh | `fixtures/pocket-arcade.json`, original planner APIs and recorded adversarial results |
| Micro-Manufacturing | Three preserved valid command records; not rerun for this refresh | `generated/pocket-arcade/` parameters, STL tray, review JSON, mm drawing and review ZIP |
| Infrastructure Foundation | Seven newly captured public-projection commands | Unchanged `cli.py`/maintenance JSON, `handoff-public-result/1` and the derived public historical summary |

The maintenance checks preserve 3 strict acceptance targets, 19 ledger
regressions, 12 replay tests and 14 projection/privacy tests. Current public
evidence binding also checks the included midpoint/repaired-source behavior.
The original 4→3 observation is retained; these checks are **not another
continuation** or public reverification of its private invocation.

Exact argv, observed exit codes, output bytes and hashes are in
`evidence/checks/`. New public capture records explicitly disclose any
repository-root path rebasing and refuse remaining private identifiers.
Failures remain failures; no path redaction can turn a command into a pass.

The real data-only consumer, `consume.py`, verifies captured receipts and
current bytes, then checks the implemented output shapes before producing
the contribution bindings, bounded acceptance reviews, and
`artifacts/connected-data.json` / `connected-data.js`. The browser shows:

- Actual trained **v4 / switchback / seed 42** recording: **12/12** pods,
  **96/150** beats, **1386** points; untaught control **0/12, lost**.
- Actual planner: **85 required minutes > 75 available minutes**; the
  original 14:00–15:15 agenda is **infeasible with no schedule**. A displayed
  minimum-cost proposal changes one field by ten minutes: cutoff **15:25**,
  all seven tasks and durations preserved. It is model-feasible and
  independently schedule-verified, **not owner-approved**.
- Actual Pocket Arcade nominal tray: **180 × 100 × 28 mm**, three card/token
  bays and **1.5 mm** centered gap. The assumed card stack is **88 × 63 × 12
  mm**; that is not a measurement or a fit claim for the prime's printed cards.
- Actual utility output over synthetic receipts: **4 records → 3 unique
  events**, one replayed record, open item `arcade-input`, release authority
  **false**.

These are real consumed original artifacts, not newly invented observations.
No partner executable is copied or embedded. Direct links keep the files and
apps in their original projects. The sealed historical `HANDOFF.md` remains
unchanged; the maintenance **consumer contract**, not its deliberately
unfinished historical instructions, is bound as the current handoff role.

Maintenance acceptance requires `handoff-public-result/1`, successful
current publication-check counts, the declared public historical summary,
matching historical numerical observations and the explicit statement that
private invocation identity cannot be independently reverified publicly.
Missing history, changed hashes, weaker test coverage and identity
overclaims fail rather than receiving unconditional pass flags.

`planner_bridge.mjs` explicitly invokes the approved original planner APIs,
without copying or embedding their code. It compares a fresh analysis to the
actual recorded preset analysis, retains all 17 matching adversarial cases,
selects the real extension-only choice, independently verifies its complete
witness, and round-trips the proposal through the actual planner exporter and
importer. A forged imported feasibility claim is ignored and recomputed.

`artifacts/tournament-proposal.json` is a compatible
`agenda-planner-export/1` file, with explicit pending-approval metadata.
Download it, open Agenda Pocket, and import it as a hypothetical input edit.
`artifacts/tournament-analysis.json` preserves the original refusal and the
verified model witness. Repair minimum is only within the declared family;
`tiesComplete: false` is retained, not silently upgraded to exhaustive.
Seven session blocks are not a proved eight-player bracket. Real availability,
participant workload and operational suitability remain unverified.

Private coordination/browser-observation records are not part of this public
payload or any acceptance gate. The publisher may provide separate,
public-safe deployment/browser reports. No live browser validation or
deployment was performed by these project tools.

Historical `published: false` observations and the original model
proposal's `publicationApproved: false` review flag retain their historical
meaning. They are not rewritten into new executions and do not negate the
separate owner authorization to publish this reviewed static showcase.

The current real validator returns **exit 0** and
`local-integration-checks-passed`: four local content passes, all dependencies
satisfied and no fixture accepted as a real contribution. Passing the
integration means the real interfaces and their technical evidence agree;
it does not change the original planner refusal into a feasible baseline.

## Combined experience verification

`verify_experience.cjs` executes the **actual hub scripts and actual approved
file bytes** in an original non-rendering DOM double. It starts no server and
uses no browser or network. Its filesystem-backed, in-memory transport
checks the repository-hosted `/hive-showcase/` URL prefix and:

1. All four manifests/entrypoints and every saved validation input hash.
2. All four station controls, actual source links and real displayed data.
3. Explicit notes-download payloads never becoming integration acceptance.
4. Direct-file mode rendering recorded data without fetching neighboring files.
5. A deliberately missing planner being refused as a current integration.
6. A deliberately changed game byte causing hash verification to fail.
7. Fixture-report imports never establishing real acceptance.

Negative faults exist only in the in-memory test transport; no partner file
is changed. Results are in `evidence/experience-verification.json`. This is a
real script/data-flow check, **not browser rendering, actual browser saving,
assistive-technology review, human interaction, fun or market validation**.
The final summary link is existence-checked rather than self-hashed because
the summary subsequently hashes this experience report.

## Run the checks

From the repository root, with Python 3.9+ and a Node version supporting
`node --test`:

```sh
python3 -B -m unittest discover -s projects/10-pocket-arcade/tests -p 'test_*.py' -v
node --test projects/10-pocket-arcade/tests/model.test.cjs
node --check projects/10-pocket-arcade/app.js
node --check projects/10-pocket-arcade/model.js
node --check projects/10-pocket-arcade/connected-data.js
node --check projects/10-pocket-arcade/planner_bridge.mjs
node --check projects/10-pocket-arcade/verify_experience.cjs
node projects/10-pocket-arcade/planner_bridge.mjs --root . --check
python3 -B projects/10-pocket-arcade/consume.py --root . --check
python3 -B projects/10-pocket-arcade/validate.py --root .
node projects/10-pocket-arcade/verify_experience.cjs --root .
python3 -B projects/10-pocket-arcade/public_checks.py --root .
```

No installs or runtime dependencies are required. The project-local
`package.json` only keeps classic browser scripts compatible with CommonJS
unit tests inside the repository's ESM loader scope.

For a maintenance-only public projection refresh, preserve still-valid
01/05/07 artifacts and their recorded checks. Rebind only after running the
reviewed maintenance commands, from the repository root:

```sh
python3 -B projects/10-pocket-arcade/capture_checks.py --root . --project 09-handoff
python3 -B projects/10-pocket-arcade/consume.py --root . --write
python3 -B projects/10-pocket-arcade/consume.py --root . --check
python3 -B projects/10-pocket-arcade/validate.py --root . \
  --output projects/10-pocket-arcade/evidence/integration-validation.json
node projects/10-pocket-arcade/verify_experience.cjs --root . \
  --output projects/10-pocket-arcade/evidence/experience-verification.json
python3 -B projects/10-pocket-arcade/public_checks.py --root .
python3 -B projects/10-pocket-arcade/public_checks.py --root . --fresh-git
```

Capture is an explicit operator invocation, not automatic execution by the
validator or browser. Only the reviewed exact argv arrays are allowlisted.
Changed commands require review, not blind manifest execution. Python
bytecode writing is suppressed, and outputs stay in this prime project.
The consumer's successful `--check` means **bindings are byte-consistent**.
It emits `ready-for-local-validation`, not an integration pass. Only the
separate strict real validator derives the complete local technical result.
If another component actually changes, review and recapture that component's
exact commands before regenerating its dependent bindings. Do not recapture
unchanged workflows merely to produce newer timestamps.

`public_checks.py` scans every declared owned artifact for machine paths,
private identifiers, private operational fields and embedded JSON escapes,
and checks the exact owned inventory. Its optional fresh-Git check creates
and cleans a project-local export with empty Git history, then runs all owned
manifest checks. It neither starts a service nor accesses a network.
Git is needed only for this explicit portability test, not for applications,
consumer binding or normal validation. A new test summary is added after
its tested export; the final payload is scanned again afterward.

Validate actual contributions against an **explicit** root:

```sh
python3 -B projects/10-pocket-arcade/validate.py --root . \
  --output projects/10-pocket-arcade/evidence/integration-validation.json
```

An absolute `--root` is also supported; contract, record and output locators
remain repository-relative. The validator reads only declared inputs and
does not search other worktrees. Optional `--contract` and `--record` inputs
must stay in `projects/10-pocket-arcade/`. Output is restricted to that
project's `evidence/` directory and cannot overwrite an input or a symlink.
The JSON report includes exact input hashes and byte counts, each contribution
and gate outcome, dependency blocking and limitations. Inputs are rechecked
for changes during the run.

- **Exit 0, `local-integration-checks-passed`:** all actual local input and
  recorded-check gates pass. Not native, commercial or physical acceptance.
- **Exit 1, `awaiting-real-contributions`:** pending or missing actual inputs,
  possibly alongside valid local components blocked by those dependencies.
  This was the genuine earlier phase-A / bounded-phase-B outcome; it is not
  the final four-component result.
- **Exit 1, `integration-failed`:** malformed, incompatible, changed,
  incomplete or failed evidence.
- Argument-usage errors exit 2.
- An explicit `--fixture-mode` only accepts a marked test root with a
  matching `fixtureOnly: true` record. A fixture pass has
  `integrationPassed: false`, `acceptedLocalContributions: 0` and
  `integrationStatus: "fixture-checks-passed"`. Real mode rejects a fixture
  root even when its record is edited to claim otherwise.

The unit suite generates and cleans synthetic fixtures only inside the
owned `tests/fixture-workspaces/` directory. Nothing uses system temporary
directories. See `tests/fixtures/README.md`. A missing-data rejection run is
recorded separately from the passing fixture suite.

## Browser status has separate meanings

- **Availability not checked / file mode:** no claim about neighbor files.
- **Entry page present:** a same-origin manifest and entrypoint are reachable.
  That is not an acceptance test.
- **Recorded pass, not reverified:** a real-mode saved report passes, but
  current files have not all been hash-checked.
- **Local snapshot verified:** all four manifests/entrypoints are present
  and every saved report input hash matches current bytes using Web Crypto.
  Recorded commands are **not** rerun in the browser.
- **Four contributions recorded, not reverified:** direct-file mode has the
  four original data bindings but cannot read neighboring files or the saved
  report automatically. Use the CLI or explicitly load the local report.
- **Present inputs match, planner still missing (historical partial report):** the three received
  components' saved input hashes match current bytes, but complete
  integration remains explicitly pending.
- **Snapshot changed / integration needs review:** no current pass.

File upload only reads a report in the browser; it uploads nothing. Fixture
reports are refused. File locators are restricted to the five local project
scopes; requests omit credentials and refuse redirects. No third-party
requests or hidden service is used by this hub. This workstream did not
perform browser automation or a visual interaction test in either phase.

## Seed mapping and boundaries

The verified inert seed is `federation-prime-contractor`. Its actual case is
`pocket-queue-prime-pilot`; the ready task is `freeze-prime-engagement`. It
describes a fictional anonymous-ticket exercise with a 60-attendee ceiling
and 120-minute retention ceiling, and discovery-only candidates Applied
Invention Lab, Enterprise Transformation Firm and Product Launch.

**Pocket Arcade is not that case.** This requested extension reuses the
principles of bounded briefs, artifact interfaces, dependency checks,
explicit rejection and honest handoff. It introduces the robot game,
tournament, tabletop and maintenance scopes. No completion of the seed's
18-criterion matrix, candidate contract or original application is claimed.
`seed-map.json` records exact verified seed/archive references, the five own
team scopes and the needed inert partner acceptance data reviewed.
Downloaded starter code was never executed, imported or embedded. Attribution
for seed data is in `NOTICE`.

Local original demo artifacts remain in separate project directories.
No native organization or workspace is registered; no private stores are
copied; no membership, signed receipt, federation activation, cross-world
authority, outreach, spending or real manufacturing is claimed.
All authority/external-effect flags remain false even when local checks pass.
`publicLaunch: false` refers to operational/commercial launch authority,
not the separately authorized publication of this reviewed static showcase.

## Public redaction boundaries and remaining gates

Original private records are not edited or exported. The maintenance
historical summary is a labeled derivative, not a byte-identical private
transcript, a new execution or an independently verified private identity.
Public reproducibility uses included source snapshots and current hashes;
historical Git objects are not dependencies.

The retained public-safe `phase-a-*` and `phase-b-*` logs describe historical
observations, not current file-lock assertions or new publication checks.
The current proof is `evidence/result.json` and its referenced current
check records and validation report. Raw private invocation metadata,
machine-specific locations, internal prompts and private browser/coordination
records are excluded.

No component remains missing. Native/owner activation, actual tournament
operations, a real player bracket, browser rendering of this final hub,
human fun/accessibility review, physical fabrication/card fit and market
validation remain unperformed or pending. Showcase publication is
owner-authorized; only the coordinating publisher controls remote deployment
and live public-site validation. Technical checks are not those separate
human, physical, market or native approvals.
