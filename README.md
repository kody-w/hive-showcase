# Hive Showcase

Ten original, local-first demonstrations based on public Hive Hub organization
seeds. Public site: **https://kody-w.github.io/hive-showcase/**.

This is a reviewed public projection of the original local build, not its
private Git history or executor archive. Machine-specific paths and internal
execution metadata are omitted or explicitly redacted. Historical records stay
historical; publishing them does not fabricate new executions.

The downloaded seeds remain inert. These demonstrations do not activate native
Organizations, grant membership, establish a federation, make purchases, or
manufacture physical objects. Computation stays in the browser or in explicitly
invoked local tools.

The work is implemented in isolated Git worktrees and integrated here. Each
project includes runnable artifacts, reproducible checks, and explicit limits.
See `evidence/seed-verification.json` for exact public seed references and the
checks performed on their original downloaded bytes.

## Local use

The hosted applications need only a modern browser. Local development checks
use Python 3.9+ and Node's built-in test runner; use Node 22+ for the optional
browser driver.

Run `python3 tools/serve.py` from this directory, then open the printed loopback
address. Run `python3 tools/run_checks.py` for project-declared checks.

To reproduce the GitHub Pages project-path layout locally, run
`python3 tools/serve.py --base-path /hive-showcase` and use the printed URL.
The preview deliberately rejects host-root asset paths in this mode.

Project-specific instructions and evidence live under `projects/`.
Downloaded seed code must not be executed.

## The ten demonstrations

| Project | Actual local output |
| --- | --- |
| [01 Game Studio](projects/01-game-studio/index.html) | Little Signals: playable robot game, three measured improvement cycles, preserved wins and losses. |
| [02 Conglomerate](projects/02-conglomerate/index.html) | Five-venture, 300-minute decision tool and a working local CSV preflight offering. |
| [03 Intelligence](projects/03-intelligence/index.html) | Nine-source evidence map, opposing cases, seven gates and explicit reversal criteria. |
| [04 Invention](projects/04-invention/index.html) | Reproducible packing comparisons, all 504 assignments, retained regressions and bounded proof claims. |
| [05 Planner](projects/05-planner/index.html) | Exact small-instance scheduling, proven minimal repairs, and explicit unknown/unsupported results. |
| [06 Enterprise](projects/06-enterprise/index.html) | Shared-clock replay of eight quotes across three designs, including worsening stress cases. |
| [07 Manufacturing](projects/07-manufacturing/index.html) | Three parameterized organizer variants, six checked STL solids and digital review packages. |
| [08 Turnaround](projects/08-turnaround/index.html) | Constrained cash recovery model: improved containment, but no fabricated full rescue. |
| [09 Handoff](projects/09-handoff/index.html) | A real separate Astra continuation repairing an original synthetic reproduction from sealed artifacts. |
| [10 Pocket Arcade](projects/10-pocket-arcade/index.html) | Four actual contributions connected through explicit contracts and 158 public input hashes. |

Ten Astra workstreams were launched in parallel in isolated Git worktrees.
The handoff demonstration used one additional, distinct Astra continuation.
The public projection preserves the resulting work and its limitations without
publishing private worker identifiers or provider conversation stores.

## Reuse the workflow

The self-contained [hive-showcase skill](.github/skills/hive-showcase/SKILL.md)
captures the same pattern: verify the seed, prove the workflow with the AI,
build the interface, integrate actual artifacts, prepare a public-safe
projection, and verify the deployed site. It supports one bounded outcome or
multiple explicitly selected parallel workstreams.

Review the skill before installing it. With a supporting Copilot CLI:

```sh
copilot skill add https://raw.githubusercontent.com/kody-w/hive-showcase/main/.github/skills/hive-showcase/SKILL.md
copilot skill list --json
```

In an existing interactive CLI session, `/skills reload` refreshes discovery.
Example request: "Use /hive-showcase to build a verified demo for this goal,
using my selected seed and model. Publish only the reviewed projection to my
specified GitHub Pages repository." Installation does not grant additional
tool permissions, publication rights, or native Hive authority.

## Evidence and browser checks

`python3 tools/run_checks.py` records the toolkit checks and each project's
declared commands, actual exit codes, captured output, and artifact hashes in
`evidence/check-results.json`. To check one project, use
`--project 01-game-studio --output evidence/checks/01-game-studio.json`.

With the preview server running, the installed Edge binary can render the
showcase in a separate temporary profile without accessing an authenticated
browser session or changing browser settings:

```sh
node tools/browser_smoke.mjs --base-url http://127.0.0.1:PORT/ --all
node tools/browser_smoke.mjs --base-url http://127.0.0.1:PORT/ --all \
  --width 390 --height 844 --output evidence/browser-mobile.json
```

Replace `PORT` with the preview's printed port. These checks record rendered
text, controls, errors, screenshots, and any explicitly supplied bounded
interaction scenarios. They are not human usability acceptance.
Include `--scenarios evidence/browser-scenarios.json` to exercise the bounded
interaction cases. The same runner accepts the exact public showcase URL above;
it does not accept arbitrary external destinations.
For another installed Chromium executable, set `HIVE_SHOWCASE_BROWSER` to its
path. The default executable location is Microsoft Edge on macOS.

Before publication, `python3 tools/check_public.py` reviews the exact committed
file bytes and bounded ZIP members. It reports paths and rule names, never
matched credential values. This is an additional review aid, not a guarantee
that arbitrary material is safe to share.

Public seed metadata and data retain the attribution in
`THIRD_PARTY_NOTICES.md` and each project's provenance.

The original local run covered ten project check sets and 120 bounded browser
test steps at each of two viewports. Projection-specific checks and publication
details are recorded separately. Technical observations are not native
activation or human, market, or physical approval.
