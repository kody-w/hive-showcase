/* Original data-only binding of actual local artifact outputs. */
globalThis.PocketArcadeData = Object.freeze({
  "artifactSetSha256": "8f1f35d794c5c12cc447ddeb117aa0445ae3adada43f7035fd3c3ba5f71af77b",
  "fixtureOnly": false,
  "game": {
    "classification": "Actual deterministic automated recording; not a human match",
    "entrypoint": "projects/01-game-studio/index.html",
    "id": "01-game-studio",
    "instructions": "Teach Pip, Ada and Bop both return-home and recharge lessons. Aim for 12 pods before beat 150 in Stone garden. The game owns scoring and replay.",
    "negativeControl": {
      "automated": true,
      "delivered": 0,
      "energy": 43,
      "game": "01-game-studio",
      "goal": 12,
      "limit": 150,
      "points": 37,
      "scenario": "switchback",
      "schema": "little-signals-score/1",
      "seed": 42,
      "status": "lost",
      "tick": 150,
      "version": "v4"
    },
    "negativeReplay": "projects/01-game-studio/evidence/runs/release-untaught.json",
    "replay": "projects/01-game-studio/evidence/runs/release-trained.json",
    "score": {
      "automated": true,
      "delivered": 12,
      "energy": 44,
      "game": "01-game-studio",
      "goal": 12,
      "limit": 150,
      "points": 1386,
      "scenario": "switchback",
      "schema": "little-signals-score/1",
      "seed": 42,
      "status": "won",
      "tick": 96,
      "version": "v4"
    },
    "testsPassed": 33
  },
  "integrationStatus": "ready-for-local-validation",
  "limits": [
    "Recorded values are not a current hash verification.",
    "The original tournament cutoff is infeasible; the verified alternative is an unapproved synthetic-model proposal, not an actual tournament.",
    "Synthetic maintenance data, automated scores and nominal geometry are not human, physical or native acceptance.",
    "Maintenance history is a labeled public derivative; private invocation identity cannot be publicly reverified."
  ],
  "maintenance": {
    "artifact": "projects/09-handoff/artifacts/pocket-arcade-maintenance.json",
    "classification": "Actual utility output over explicitly synthetic receipts",
    "contract": "projects/09-handoff/artifacts/maintenance-contract.json",
    "entrypoint": "projects/09-handoff/index.html",
    "historicalInvocationPubliclyReverified": false,
    "historicalQualification": "The underlying private invocation and its identity cannot be independently reverified from this public projection.",
    "historicalRecordKind": "derived-historical-summary",
    "historyRecord": "projects/09-handoff/evidence/historical-continuation.json",
    "id": "09-handoff",
    "inputRecords": 4,
    "inputSha256": "ca1f5c0591cfe5dc4c7b2d713f4efe4e58a6cf58270683d84f2bd4248048b040",
    "instructions": "Inspect the public maintenance queue and run its reproducible CLI. The historical 4-to-3 repair is preserved as a labeled public projection; the removed private invocation cannot be independently reverified. Synthetic items grant no operational release authority.",
    "items": [
      {
        "event_count": 2,
        "item_id": "arcade-cache",
        "last_minute": 19,
        "state": "closed"
      },
      {
        "event_count": 1,
        "item_id": "arcade-input",
        "last_minute": 11,
        "state": "open"
      }
    ],
    "openQueue": [
      "arcade-input"
    ],
    "producerArgv": [
      "python3",
      "-B",
      "projects/09-handoff/cli.py",
      "projects/09-handoff/fixtures/duplicate.jsonl"
    ],
    "releaseAuthority": false,
    "replayedRecords": 1,
    "uniqueEvents": 3
  },
  "pending": [],
  "planner": {
    "analysis": "projects/10-pocket-arcade/artifacts/tournament-analysis.json",
    "availableMinutes": 75,
    "baselineStatus": "infeasible",
    "classification": "Actual solver output over a synthetic tournament model",
    "cutoff": 915,
    "entrypoint": "projects/05-planner/index.html",
    "id": "05-planner",
    "instructions": "Load Pocket Arcade. Its 85 required minutes do not fit the initial 75-minute cutoff. Inspect the refusal, then review the unapproved +10-minute cutoff proposal or another explicitly permitted model edit; no task disappears.",
    "minimumChange": {
      "changedFields": 1,
      "totalMinutes": 10
    },
    "ownerApproved": false,
    "preset": "projects/05-planner/fixtures/pocket-arcade.json",
    "proposal": "projects/10-pocket-arcade/artifacts/tournament-proposal.json",
    "proposalStatus": "feasible",
    "proposedCutoff": 925,
    "requiredMinutes": 85,
    "requiresOwnerReview": true,
    "schedule": [
      {
        "duration": 10,
        "end": 850,
        "label": "Player check-in & rules",
        "start": 840,
        "taskId": "check-in"
      },
      {
        "duration": 20,
        "end": 870,
        "label": "Pocket Arcade • qualifying round",
        "start": 850,
        "taskId": "round-one"
      },
      {
        "duration": 5,
        "end": 875,
        "label": "Screen break & score check",
        "start": 870,
        "taskId": "break-one"
      },
      {
        "duration": 20,
        "end": 895,
        "label": "Pocket Arcade • semifinal",
        "start": 875,
        "taskId": "round-two"
      },
      {
        "duration": 5,
        "end": 900,
        "label": "Reset & rest",
        "start": 895,
        "taskId": "break-two"
      },
      {
        "duration": 20,
        "end": 920,
        "label": "Pocket Arcade • final",
        "start": 900,
        "taskId": "final"
      },
      {
        "duration": 5,
        "end": 925,
        "label": "Results & thank-you",
        "start": 920,
        "taskId": "results"
      }
    ],
    "start": 840,
    "taskCount": 7,
    "tiesComplete": false
  },
  "publication": {
    "performedByThisBuild": false,
    "scope": "Reviewed static showcase only; no native, human, physical or market approval.",
    "showcaseAuthorized": true
  },
  "schema": "pocket-arcade-connected-data/2",
  "sourceKind": "current-public-artifact-bytes",
  "sources": [
    {
      "bytes": 95462,
      "path": "projects/01-game-studio/evidence/runs/release-trained.json",
      "sha256": "7bf21e19f7c90926486f7e71e69ad597307c32886f4638418198b456239a814f"
    },
    {
      "bytes": 138619,
      "path": "projects/01-game-studio/evidence/runs/release-untaught.json",
      "sha256": "358fe5273ba4dbb9d494d4953f3f2d3da401e63715fdce026b4d476de48725f3"
    },
    {
      "bytes": 2331,
      "path": "projects/05-planner/fixtures/pocket-arcade.json",
      "sha256": "44d916e056b463535eb051a4260b6c967d63d8d6aab87df73d6a59f858c92987"
    },
    {
      "bytes": 4197,
      "path": "projects/10-pocket-arcade/artifacts/tournament-analysis.json",
      "sha256": "60715d1a114438114a50cd1afebfe3ea1618894b4f32e8cd0c1031f2a6e26195"
    },
    {
      "bytes": 8742,
      "path": "projects/10-pocket-arcade/artifacts/tournament-proposal.json",
      "sha256": "35fc944ddc44fa7c15e5bd6194550f44ab075ab891c35948fa151f6844f5c561"
    },
    {
      "bytes": 2075,
      "path": "projects/07-manufacturing/generated/pocket-arcade/parameters.json",
      "sha256": "3a385a3a45e7d6b05df2d4b0a248bcdebbc7316c7e7954c925bb16e1ce8f6042"
    },
    {
      "bytes": 6698,
      "path": "projects/07-manufacturing/generated/pocket-arcade/review.json",
      "sha256": "cff5dd27b6e8be9dfbde03bcfdf37082dc63dc9e784ffe6c554d99a7452322ae"
    },
    {
      "bytes": 122785,
      "path": "projects/07-manufacturing/generated/pocket-arcade/review-bundle.zip",
      "sha256": "f002197852d13842f47a79adea687a7aae9e99a9ee7f91cce027026773122472"
    },
    {
      "bytes": 3517,
      "path": "projects/07-manufacturing/generated/pocket-arcade/drawing.svg",
      "sha256": "980908f22e0360d7399ab8c44d94463ded029b9641914fdec85dc76dbf28d6e8"
    },
    {
      "bytes": 694,
      "path": "projects/09-handoff/artifacts/pocket-arcade-maintenance.json",
      "sha256": "8e2a9b88295a2e544b652271154fb6330557c41281a33391052b347b61f8c618"
    },
    {
      "bytes": 2478,
      "path": "projects/09-handoff/artifacts/maintenance-contract.json",
      "sha256": "ddb6c093c9b3c82a84cb7078ffa8471572a9488b6a7ee3c515a7dcb98473b99f"
    },
    {
      "bytes": 3716,
      "path": "projects/09-handoff/evidence/historical-continuation.json",
      "sha256": "965c9c1eb0a1c99036ad638444792ad45bfbe4321ae841cd87d8e782316032b6"
    },
    {
      "bytes": 476,
      "path": "projects/09-handoff/fixtures/duplicate.jsonl",
      "sha256": "ca1f5c0591cfe5dc4c7b2d713f4efe4e58a6cf58270683d84f2bd4248048b040"
    }
  ],
  "tray": {
    "assumedCardMM": [
      88,
      63,
      12
    ],
    "assumedTokenDiameterMM": 20,
    "bayWidthsMM": [
      91.85000000000001,
      37.575,
      37.575
    ],
    "bays": 3,
    "bundle": "projects/07-manufacturing/generated/pocket-arcade/review-bundle.zip",
    "classification": "Nominal digital geometry only; not fabricated",
    "clearanceMM": 1.5,
    "drawing": "projects/07-manufacturing/generated/pocket-arcade/drawing.svg",
    "entrypoint": "projects/07-manufacturing/index.html",
    "fabricationApproved": false,
    "id": "07-manufacturing",
    "instructions": "Choose the Pocket Arcade preset. Inspect the two STL solids, nominal-mm drawing and review bundle. Actual card/token fit, strength and manufacture remain unperformed.",
    "outerMM": [
      180,
      100,
      28
    ],
    "physicalFitVerified": false,
    "review": "projects/07-manufacturing/generated/pocket-arcade/review.json"
  }
});
