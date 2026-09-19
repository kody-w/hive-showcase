(function (root) {
  "use strict";
  const projects = Object.freeze([
    { id: "01-game-studio", label: "Game Studio", seedSlug: "independent-game-studio", station: "Play the robot game", action: "Open the game", detail: "Learn the game's actual controls, play a run, then inspect its saved replay. Use its own scoring rules; this hub does not invent a game API." },
    { id: "05-planner", label: "Product Launch", seedSlug: "product-launch-company", station: "Make time for a tournament", action: "Open the planner", detail: "Choose the tournament preset and set a finite session budget. Continue only with a feasible plan; an explicit capacity refusal is a useful result." },
    { id: "07-manufacturing", label: "Micro-Manufacturing", seedSlug: "micro-manufacturing-company", station: "Inspect the tabletop kit", action: "Open the design desk", detail: "Inspect tray parameters and fabrication-review downloads. Print the prime's blank cards if useful. Digital fit checks are not physical fabrication or certification." },
    { id: "09-handoff", label: "Infrastructure Foundation", seedSlug: "open-source-infrastructure-foundation", station: "Leave a reproducible handoff", action: "Open maintenance", detail: "Inspect the current public maintenance utility and labeled historical repair. Private invocation identity cannot be independently reverified from this projection; no stores or authority are inherited." }
  ]);
  const boundaryKeys = Object.freeze([
    "nativeMembership", "foreignWorkspaceRegistration", "signedReceipts", "crossWorldAuthority",
    "externalEffects", "physicalManufactureVerified", "publicLaunch", "automaticPartnerCodeExecution"
  ]);
  const own = "projects/10-pocket-arcade";
  const permittedPrefixes = [own + "/", ...projects.map(project => `projects/${project.id}/`)];
  const privateSegments = new Set([".git", ".env", ".ssh", ".rapp", ".openrappter", "stores", "private", "keys", "credentials"]);

  function safePath(path) {
    return typeof path === "string" && path.length <= 400 && /^[A-Za-z0-9._/-]+$/.test(path)
      && !path.startsWith("/") && path.split("/").every(part => part !== "" && part !== "." && part !== "..")
      && path.split("/").every(part => !privateSegments.has(part.toLowerCase()))
      && permittedPrefixes.some(prefix => path.startsWith(prefix));
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function inspectManifest(value, project) {
    assert(value && !Array.isArray(value) && typeof value === "object", "Manifest is not an object.");
    assert(value.id === project.id && value.seedSlug === project.seedSlug, "Manifest identity differs.");
    assert(value.entrypoint === `projects/${project.id}/index.html`, "Manifest entrypoint differs.");
    assert(value.stage === "work-produced", "Manifest is not at work-produced.");
    assert(value.fixtureOnly === undefined || value.fixtureOnly === false, "Test fixtures are not real contributions.");
    assert(typeof value.title === "string" && value.title.trim(), "Manifest has no title.");
    assert(typeof value.summary === "string" && value.summary.trim(), "Manifest has no summary.");
    assert(Array.isArray(value.limitations) && value.limitations.length > 0 && value.limitations.every(
      item => typeof item === "string" && item.trim()
    ), "Manifest limitations are malformed.");
    assert(Array.isArray(value.checks) && value.checks.length > 0 && value.checks.every(
      command => Array.isArray(command) && command.length > 1
        && command.every(arg => typeof arg === "string" && arg.trim())
    ), "Manifest check commands are malformed.");
    assert(Array.isArray(value.artifacts) && value.artifacts.length > 0 && value.artifacts.every(
      path => safePath(path) && path.startsWith(`projects/${project.id}/`)
    ) && new Set(value.artifacts).size === value.artifacts.length, "Manifest artifact paths are malformed.");
    return value;
  }

  function inspectReport(value) {
    assert(value && value.schema === "pocket-arcade-validation/1", "Not a Pocket Arcade validation report.");
    assert(value.mode === "real-local-artifacts" && value.fixtureOnly === false,
      "Fixture-only reports cannot establish real integration.");
    assert(typeof value.validationPassed === "boolean" && typeof value.integrationPassed === "boolean",
      "Report pass fields must be explicit booleans.");
    assert(value.boundaries && boundaryKeys.every(key => value.boundaries[key] === false),
      "Report must keep native and external authority false.");
    assert(Array.isArray(value.contributions) && value.contributions.length === projects.length,
      "Report must contain all four contribution results.");
    const ids = value.contributions.map(item => item && item.id);
    assert(new Set(ids).size === projects.length && projects.every(project => ids.includes(project.id)),
      "Report has unknown or duplicate contributors.");
    assert(Array.isArray(value.inputFiles) && value.inputFiles.length <= 256, "Report input list is malformed.");
    const seen = new Map();
    for (const file of value.inputFiles) {
      assert(file && safePath(file.path) && !seen.has(file.path), "Report has an unsafe or duplicate input path.");
      assert(typeof file.sha256 === "string" && /^[0-9a-f]{64}$/.test(file.sha256)
        && Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= 16 * 1024 * 1024,
      "Report has an invalid file lock.");
      seen.set(file.path, file);
    }
    const statuses = ["awaiting-real-contributions", "integration-failed", "local-integration-checks-passed"];
    assert(statuses.includes(value.integrationStatus), "Unsupported real integration status.");
    if (value.integrationPassed || value.validationPassed || value.integrationStatus === "local-integration-checks-passed") {
      assert(value.integrationPassed && value.validationPassed
        && value.integrationStatus === "local-integration-checks-passed", "Contradictory report status.");
      assert(Array.isArray(value.errors) && value.errors.length === 0, "A passing report cannot contain errors.");
      for (const path of [`${own}/contract.json`, `${own}/contributions.json`]) {
        assert(seen.has(path), "Passing report has no integration-input hash.");
      }
      for (const contribution of value.contributions) {
        assert(contribution.status === "accepted-local" && contribution.recordedCheckCount > 0,
          "Passing report has unaccepted contributions.");
        assert(Array.isArray(contribution.gates) && contribution.gates.length >= 3
          && contribution.gates.every(gate => gate.status === "recorded-pass"),
        "Passing report lacks explicit acceptance fields.");
        assert(Array.isArray(contribution.files) && contribution.files.length > 0, "Passing contribution has no artifacts.");
        for (const suffix of ["manifest.json", "index.html", "evidence/result.json"]) {
          assert(seen.has(`projects/${contribution.id}/${suffix}`), "Passing report omits an essential file hash.");
        }
        for (const file of contribution.files) {
          const input = seen.get(file.path);
          assert(input && input.sha256 === file.sha256 && input.bytes === file.bytes,
            "Contribution locks differ from report inputs.");
        }
      }
    }
    return value;
  }

  function assessStatus(report, availability, hashState, connected = null) {
    if (!report && connected && Array.isArray(connected.pending) && connected.pending.length === 0) {
      return { tone: "pending", title: "Four contributions recorded · not reverified", detail: "Four public artifact interfaces are bound in the saved data. Read the technical report or run the CLI; current bytes are not yet verified here. Operational/native approval remains pending; reviewed showcase publication is separately authorized." };
    }
    if (!report || report.integrationStatus === "awaiting-real-contributions") {
      const count = report && report.summary && report.summary.verifiedLocalContributions;
      if (Number.isInteger(count) && count > 0 && count < projects.length) {
        return { tone: "pending", title: "Awaiting real contributions", detail: `${count} contributions have recorded local content checks. Planner05 is still missing; dependent integration gates remain blocked. No complete tournament or native approval is claimed.` };
      }
      return { tone: "pending", title: "Awaiting real contributions", detail: "The shell and fixture tests are not evidence that the four actual contributions have integrated." };
    }
    if (!report.integrationPassed) {
      return { tone: "error", title: "Integration needs review", detail: "The saved validator report failed. Inspect the exact input and acceptance errors before continuing." };
    }
    if (hashState === "mismatch") {
      return { tone: "error", title: "Snapshot changed · recheck required", detail: "At least one current file differs from the saved report. No current integration pass is claimed." };
    }
    if (projects.every(project => availability[project.id] === "present") && hashState === "verified") {
      return { tone: "verified", title: "Local snapshot verified", detail: "Current file hashes match recorded local checks. This is not native membership, signed acceptance or physical validation." };
    }
    return { tone: "pending", title: "Recorded pass · not reverified", detail: "A saved pass exists, but current availability and every input hash must still be checked. This is not a fresh acceptance." };
  }

  function inspectConnectedData(value) {
    assert(value && value.schema === "pocket-arcade-connected-data/2" && value.fixtureOnly === false,
      "Only the actual original artifact-data interface may be displayed.");
    assert(Array.isArray(value.pending) && (
      (value.integrationStatus === "awaiting-real-contributions" && value.pending.length === 1 && value.pending[0] === "05-planner")
      || (value.integrationStatus === "ready-for-local-validation" && value.pending.length === 0)),
    "Connected data must distinguish missing inputs from readiness for local validation.");
    assert(value.sourceKind === "current-public-artifact-bytes"
      && typeof value.artifactSetSha256 === "string" && /^[0-9a-f]{64}$/.test(value.artifactSetSha256),
      "Connected data needs a current public-artifact content reference, not private Git history.");
    assert(value.publication && value.publication.showcaseAuthorized === true
      && value.publication.performedByThisBuild === false,
    "Showcase authorization and actual deployment must remain distinct.");
    const score = value.game && value.game.score;
    assert(value.game && value.game.id === "01-game-studio"
      && score && score.schema === "little-signals-score/1" && score.game === "01-game-studio"
      && score.automated === true && score.status === "won"
      && [score.delivered, score.goal, score.tick, score.limit, score.points].every(Number.isSafeInteger)
      && score.delivered === score.goal && score.goal > 0 && score.tick <= score.limit,
    "Recorded game data must retain the actual automated score semantics.");
    const negative = value.game.negativeControl;
    assert(negative && negative.schema === "little-signals-score/1" && negative.game === "01-game-studio"
      && negative.automated === true && negative.status === "lost"
      && Number.isSafeInteger(negative.delivered) && Number.isSafeInteger(negative.goal)
      && negative.delivered < negative.goal, "The losing game control must remain explicit.");
    const tray = value.tray;
    assert(tray && tray.id === "07-manufacturing" && tray.physicalFitVerified === false && tray.fabricationApproved === false
      && Array.isArray(tray.outerMM) && tray.outerMM.length === 3
      && tray.outerMM.every(number => Number.isFinite(number) && number > 0),
    "Tray data must remain nominal geometry without physical approval.");
    const maintenance = value.maintenance;
    assert(maintenance && maintenance.id === "09-handoff" && maintenance.releaseAuthority === false
      && maintenance.historicalRecordKind === "derived-historical-summary"
      && maintenance.historicalInvocationPubliclyReverified === false
      && typeof maintenance.historicalQualification === "string"
      && maintenance.historicalQualification.includes("cannot be independently reverified")
      && [maintenance.inputRecords, maintenance.uniqueEvents, maintenance.replayedRecords].every(
        number => Number.isSafeInteger(number) && number >= 0)
      && maintenance.inputRecords === maintenance.uniqueEvents + maintenance.replayedRecords
      && Array.isArray(maintenance.openQueue) && maintenance.openQueue.every(item => typeof item === "string"),
    "Maintenance counts or the no-release-authority boundary are invalid.");
    if (value.pending.length === 0) {
      const planner = value.planner;
      assert(planner && planner.id === "05-planner" && planner.baselineStatus === "infeasible"
        && planner.proposalStatus === "feasible" && planner.ownerApproved === false
        && planner.requiresOwnerReview === true
        && [planner.requiredMinutes, planner.availableMinutes, planner.start, planner.cutoff,
          planner.proposedCutoff, planner.taskCount].every(Number.isSafeInteger)
        && planner.requiredMinutes > planner.availableMinutes && planner.proposedCutoff > planner.cutoff
        && Array.isArray(planner.schedule) && planner.schedule.length === planner.taskCount
        && planner.minimumChange && Number.isSafeInteger(planner.minimumChange.changedFields)
        && planner.minimumChange.changedFields === 1 && Number.isSafeInteger(planner.minimumChange.totalMinutes)
        && planner.minimumChange.totalMinutes === planner.proposedCutoff - planner.cutoff
        && new Set(planner.schedule.map(item => item.taskId)).size === planner.taskCount
        && planner.schedule.every(item => item && typeof item.taskId === "string" && typeof item.label === "string"
          && [item.start, item.end, item.duration].every(Number.isSafeInteger)
          && item.duration > 0 && item.end === item.start + item.duration
          && item.start >= planner.start && item.end <= planner.proposedCutoff)
        && typeof planner.tiesComplete === "boolean",
      "The original refusal and unapproved model proposal must remain distinct.");
      assert(["entrypoint", "preset"].every(field =>
        safePath(planner[field]) && planner[field].startsWith("projects/05-planner/"))
        && ["analysis", "proposal"].every(field => safePath(planner[field]) && planner[field].startsWith(own + "/")),
      "Planner locators must distinguish the original preset from prime-derived artifacts.");
    }
    for (const [component, fields] of [[value.game, ["entrypoint", "replay", "negativeReplay"]],
      [tray, ["entrypoint", "bundle", "drawing", "review"]],
      [maintenance, ["entrypoint", "artifact", "contract", "historyRecord"]]]) {
      assert(fields.every(field => safePath(component[field]) && component[field].startsWith(`projects/${component.id}/`)),
        "Connected data contains an unsafe or foreign source locator.");
    }
    assert(Array.isArray(value.sources) && value.sources.every(source =>
      source && safePath(source.path) && /^[0-9a-f]{64}$/.test(source.sha256)
        && Number.isSafeInteger(source.bytes) && source.bytes > 0), "Connected source hashes are malformed.");
    return value;
  }

  function sessionRecord(aliases, notes) {
    assert(Array.isArray(aliases) && aliases.length === 8, "Use eight alias slots.");
    return {
      schema: "pocket-arcade-session-notes/1",
      classification: "user-authored-local-notes-not-integration-evidence",
      aliases: aliases.map(value => String(value).trim().slice(0, 24)),
      notes: String(notes).trim().slice(0, 480),
      scoringRule: "Use the linked game's actual rules. Alias slots do not prove an eight-player bracket fits the synthetic schedule.",
      integrationAcceptance: false,
      nativeAuthority: false
    };
  }

  const api = Object.freeze({ projects, boundaryKeys, safePath, inspectManifest, inspectReport, assessStatus, inspectConnectedData, sessionRecord });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PocketArcade = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
