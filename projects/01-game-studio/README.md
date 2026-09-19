# Little Signals

An original, dependency-free game about teaching a tiny robot colony. Select
Pip, Ada, or Bop; teach explicit return/recharge rules; choose gathering routes;
watch them work; spend a scarce rescue kit when a lesson goes wrong.

**Entrypoint:** `projects/01-game-studio/index.html` (repository-relative).
**Stage:** `work-produced`, not a native/activated Hive or published product.

## Play locally

Open `index.html` directly in a modern browser. Classic, deferred JavaScript
modules and bundled replay data require no fetches, package installation,
CDN, storage, account, audio, or network service. All resources are relative,
including `../../assets/shared.css`. The optional back link targets the root
showcase. Direct-file behavior is designed for, not manually browser-verified
by this workstream.

For an **owner-managed optional preview**, from repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
# Open http://127.0.0.1:8765/projects/01-game-studio/
```

This workstream did not start a service or access a browser.

1. Select each robot and enable **When carrying → return home** and
   **Low power → recharge**. Or experiment: omitted lessons cause real failures.
2. Launch the shift. Set routes by selecting a patch or using the route menu.
   Rest a robot to change traffic, or rescue one using either of two kits.
3. Deliver **12 pods** in Stone garden / One little doorway, or **6** in Open
   meadow, before beat **150**. A pod counts only at the nursery.

Moving or harvesting costs one energy; each robot holds one pod and 24 energy.
Charging adds six per beat. A rescue restores a robot at home, loses its carried
pod, and costs 75 points. Lessons take no beats but count toward the finite
512-action budget. Loss occurs at sunset, with all robots stranded and no kits,
or at the action cap. The default latest build is **v4**, garden seed **42**.

One live beat takes two seconds: a **five-minute maximum active shift**.
Planning pauses, early wins, and bounded fast-forward change elapsed time.
Autoplay begins only on user input and stops at terminal state, hidden tabs,
navigation, or semantic API control. No hidden autonomous service runs.

### Controls

| Action | Keyboard / button |
|---|---|
| Select Pip / Ada / Bop | `1` / `2` / `3`, robot card, or map robot |
| Toggle return lesson | `D` or first lesson button |
| Toggle recharge lesson | `C` or second lesson button |
| Change gathering focus | Left/right arrows, route menu, or map patch |
| Launch / pause | `Space` or primary button |
| Pause | `Escape` |
| Step | `N`, 1-beat, or 5-beat button |
| Restart | `R` or Restart; unsaved run is discarded |

Focused form controls keep their native keys. Tab reaches all controls.
Symbols, letters, text, battery numbers, and progress bars supplement color.
Reduced-motion CSS is included. No screen-reader/device usability claim is made.

## Replay and run evidence

Use **Load verified replay** for six bundled development runs, then Launch,
step, or scrub the action slider. A replay is read-only. Restart to play.
**Download this run** saves JSON; **Import a run** accepts a local JSON trace or
report wrapper, at most 2 MB. Nothing is uploaded or stored automatically.
Partial playback downloads only the actions actually replayed so far.

The engine re-executes every action and compares every recorded frame and final
state before accepting an import. Frame fingerprints are deterministic FNV-1a
checksums, **not signatures or cryptographic authenticity proofs**. Exact frame
and final-state comparison adds replay consistency; SHA-256 artifact digests
are in `evidence/result.json`.

All commands below run from **repository root**, with **Node 20+** built-ins only
(validated here on Node 26.7.0):

```sh
node --test --test-reporter=tap projects/01-game-studio/tests/engine.test.mjs projects/01-game-studio/tests/controller.test.mjs projects/01-game-studio/tests/app.test.mjs projects/01-game-studio/tests/evidence.test.mjs
node projects/01-game-studio/tools/bundle-replays.mjs --check

# Reproduce the winning third-cycle run into a NEW evidence filename:
node projects/01-game-studio/tools/play.mjs record v4 narrows class my-run.json 42
node projects/01-game-studio/tools/play.mjs replay projects/01-game-studio/evidence/runs/my-run.json

# Verify the preserved success and failure:
node projects/01-game-studio/tools/play.mjs replay projects/01-game-studio/evidence/runs/cycle-03-before.json projects/01-game-studio/evidence/runs/cycle-03-after.json

# Regenerate the bundled original replay data, then the measured result:
node projects/01-game-studio/tools/bundle-replays.mjs
node projects/01-game-studio/tools/report.mjs
```

Recording policies are `class` (return/recharge for all), `solo` (Pip trained,
east focus, classmates resting), `split` (trained class with distinct patches),
and `untaught`. A seed varies pod supplies. `record` refuses to overwrite an
existing recording: historical observations must not be silently replaced.

### Three actual build–play–improve cycles

These were implemented and executed sequentially, not three retrospective
labels on one version. Four immutable configuration entries in `builds.js`
preserve the rules before and after each improvement. Recordings include
execution timestamps and the exact engine/builds SHA-256 at recording time.
Later validation hardening does not change historical replay states.

| Cycle | Controlled run | Change after observing failure | Measured before → after |
|---|---|---|---|
| 1: v1 → v2 | Meadow, seed 42, solo | Full recharge and round-trip energy budget | Delivered **1 → 6**; stranded **1 → 0**; loss → win at **111 beats** |
| 2: v2 → v3 | Stone garden, seed 42, solo | Breadth-first paths; budget actual route length | Wall bumps **148 → 0**; delivered **0 → 6/12**; **both runs lose** |
| 3: v3 → v4 | Doorway, seed 42, class | Patch reservations, fair move priority, atomic courtesy passes | Blocked moves **428 → 10**; global deadlocked beats **141 → 0**; delivered **0 → 12**; win at **96 beats** |

The final default-garden release runs preserve another positive/negative pair:
trained class **12/12 at beat 96**, untaught class **0/12 at beat 150**.
The untaught robots gathered three pods but never learned to bring them home.
The first cycle uses more total energy after improvement because it completes
six trips, not one; no total-energy-reduction claim is made.

All eight files under `evidence/runs/` are **actual deterministic Node
executions of the browser's engine**. Automated playability and measured robot
behavior are **not human fun evidence**. `tests/app.test.mjs` executes the
actual application in a small DOM contract fixture, not a real rendering engine.

## Pocket Arcade integration contract

Embed the relative entrypoint in a same-origin iframe, or link to it.
No parent messaging, network calls, cross-origin access, or storage is needed.
`window.hiveGame` becomes available after deferred scripts finish.

```js
const game = iframe.contentWindow.hiveGame; // or window.hiveGame on the page
game.reset({ version: "v4", scenario: "narrows", seed: 42 }); // pauses autoplay
game.run([0, 1, 2].flatMap(robot => [
  { type: "teach", robot, rule: "delivery", value: true },
  { type: "teach", robot, rule: "safety", value: true }
]));
while (game.snapshot().status === "playing") {
  game.act({ type: "tick", count: 25 }); // finite: at most 150 beats total
}
const score = game.score();
const trace = game.trace();
game.replay(trace); // verifies everything and displays the final replay state
game.seek(0);      // bounded action-index seek, read-only replay mode
```

`contract = "little-signals-api/1"`:

| Method | Contract |
|---|---|
| `reset(options={})` | New paused game. Versions `v1`–`v4`; gardens `meadow`, `switchback`, `narrows`; uint32 seed. Returns cloned state. |
| `snapshot()` | Cloned `little-signals-state/1`; robots, programs, positions, energy, pods, clock, goal, metrics, events, status/reason. |
| `act(action)` | One validated action. `tick.count` integer 1–25 (default 1). `teach.robot` 0–2; delivery/safety booleans, focus `nearest/north/east/south`, job `collect/rest`. `rescue.robot` 0–2, away from home, kit required. |
| `run(actions)` | At most 64 actions in a call, 512 per session, 150 beats. All action syntax validated before mutation. State-dependent failures such as an impossible rescue are not a transactional rollback of earlier valid actions. Stops at terminal. |
| `score()` | `little-signals-score/1`, described below. |
| `trace()` | Cloned `little-signals-replay/1`: game ID, options, ordered action/frame entries, exact final state. |
| `replay(traceOrReport, {at}={})` | Verify first, then enter read-only mode at action index `at` (default end). Rejects altered state/frames, invalid bounds, and post-terminal actions. |
| `seek(index)` / `nextReplay(count=1)` | Seek 0–recorded action count; advance 1–25 actions. These do not make new player choices. |
| `view()` / `limits` | Read-only mode/cursor metadata and finite limits. |

API mutators pause UI autoplay. Invalid actions throw; terminal live actions are
no-ops. `run` may stop before consuming the batch on a win/loss. Snapshots and
exports cannot mutate the engine.

Score fields: `schema`, `game: "01-game-studio"`, `version`, `scenario`, `seed`,
`status: "playing"|"won"|"lost"`, `delivered`, `goal`, `tick`, `limit`, `energy`,
`points`, `automated`. Points are
`max(0, 100*delivered + (won ? 3*(150-tick) : 0) + energy - 2*blockedMoves - 75*rescues)`.
Live/browser exports use `automated: null`: input provenance is unknown, never
assumed human. Node recordings use `true`; replay metadata retains an explicit
`true` but is not an authenticated identity assertion.

The **child window** dispatches `hive-game-ready` with `{game, contract}` and
`hive-game-score` with the score as `event.detail`. A same-origin coordinator
can attach listeners to `iframe.contentWindow`. Events are not posted to an
external endpoint. `evidence/result.json` and recording wrappers expose the same
score shape for static consumption; no executing embedded game is required.

## Provenance, scope, and what is not done

`evidence/source-review.json` maps the seed's one ready task and nine blocked
tasks to this **explicit user-authorized original extension**, without claiming
those native tasks were completed. The seed's original Mosslight Courier case
and synthetic human-feedback baseline are not this game's evidence. No seed
executable code was read, executed, imported, or embedded. Source metadata
references include hashes and MIT attribution in `SOURCE-NOTICE.txt`.

No browser, physical device, screen reader, human playtest, native setup,
publication, purchase, external mutation, business/physical activity, or market
validation was performed. Graphics and UI are original; human review is pending.

Before making a human-usability claim, a separately approved, consent-based
test could ask a participant to: identify the win goal, teach one return rule,
explain a charging decision, recover a stranded robot, and export/replay a run.
Record completion, errors, and voluntary enjoyment feedback without leading
questions. **None of these human observations has happened.**
