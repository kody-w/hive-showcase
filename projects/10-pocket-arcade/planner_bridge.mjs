#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const own = "projects/10-pocket-arcade";
const { values } = parseArgs({
  options: { root: { type: "string" }, check: { type: "boolean" }, write: { type: "boolean" } },
  allowPositionals: false, strict: true
});
assert(values.root && Boolean(values.check) !== Boolean(values.write), "Use --root <repository> and exactly one of --check / --write.");
const root = fs.realpathSync(values.root);
const locks = new Map();
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");

function read(name) {
  assert(/^[A-Za-z0-9._/-]+$/.test(name) && !name.split("/").some(part => ["", ".", ".."].includes(part)));
  assert(name.startsWith("projects/05-planner/") || name.startsWith(own + "/"));
  let target = root;
  for (const part of name.split("/")) {
    target = path.join(target, part);
    assert(!fs.lstatSync(target).isSymbolicLink(), "Symlinked input is not accepted.");
  }
  assert(fs.statSync(target).isFile() && fs.statSync(target).size <= 16 * 1024 * 1024);
  const bytes = fs.readFileSync(target);
  const lock = { path: name, sha256: hash(bytes), bytes: bytes.length };
  if (locks.has(name)) assert.deepEqual(lock, locks.get(name), "Input changed during the planner bridge.");
  locks.set(name, lock);
  return bytes;
}

const inputPath = "projects/05-planner/fixtures/pocket-arcade.json";
const evidencePath = "projects/05-planner/evidence/fixture-results.json";
const result = JSON.parse(read("projects/05-planner/evidence/result.json"));
const input = JSON.parse(read(inputPath));
const evidence = JSON.parse(read(evidencePath));
const sourcePaths = ["projects/05-planner/engine.mjs", "projects/05-planner/editor.mjs"];
for (const name of sourcePaths) {
  const bytes = read(name);
  const declared = result.artifactHashes.find(item => item.path === name);
  assert(declared && declared.sha256 === hash(bytes) && declared.bytes === bytes.length, "Original planner module hash differs.");
}
assert.equal(result.nativeInitialized, false);
assert.equal(result.externalEffectsPerformed, false);
assert.equal(result.published, false);
assert.equal(result.userStudyPerformed, false);
assert.equal(input.schema, "agenda-planner/1");
assert.equal(input.classification, "synthetic");
assert.equal(evidence.schema, "agenda-planner-fixture-results/1");
assert.equal(evidence.cases.length, 17);
assert(evidence.cases.every(item => item.matches === true), "A preserved adversarial case did not match.");
assert.equal(hash(read(evidencePath)), result.adversarialFixtures.sha256);

// These are the explicitly approved original local modules, not downloaded starter code.
const engine = await import(pathToFileURL(path.join(root, sourcePaths[0])).href);
const editor = await import(pathToFileURL(path.join(root, sourcePaths[1])).href);
const original = JSON.stringify(input);
const analysis = engine.analyzeAgenda(input);
assert.equal(JSON.stringify(input), original, "Planner mutated its input.");
assert.deepEqual(analysis, evidence.presets.find(item => item.id === "arcade").analysis,
  "Fresh original API results differ from the recorded Pocket Arcade analysis.");
assert.equal(analysis.feasibility.status, "infeasible");
assert.equal(analysis.feasibility.schedule, null);
assert.equal(analysis.feasibility.proof.requiredMinutes, 85);
assert.equal(analysis.feasibility.proof.availableMinutes, 75);
assert.equal(analysis.repairs.status, "minimum-proven");
assert.equal(analysis.repairs.minimumProven, true);
assert.deepEqual(analysis.repairs.optimum, { changedFields: 1, totalMinutes: 10 });
assert.equal(analysis.repairs.proof.cheaperCandidatesComplete, true);
const choice = analysis.repairs.choices.find(candidate =>
  candidate.changes.length === 1 && candidate.changes[0].type === "extend-day");
assert(choice, "The actual declared extension-only proposal is absent.");
const revised = engine.applyRepair(input, choice);
assert.equal(JSON.stringify(input), original, "Repair application mutated the original preset.");
assert.deepEqual(revised.tasks, analysis.agenda.tasks, "The extension must preserve every task and duration.");
assert.equal(revised.day.end, 925);
const proposedAnalysis = engine.analyzeAgenda(revised);
assert.equal(proposedAnalysis.feasibility.status, "feasible");
const verification = engine.verifySchedule(revised, proposedAnalysis.feasibility.schedule);
assert.deepEqual(verification, { valid: true, issues: [] });
assert.equal(proposedAnalysis.feasibility.schedule.length, input.tasks.length);
const exported = editor.createExport(revised, proposedAnalysis);
exported.pocketArcadeReview = {
  modelProposalOnly: true, ownerApproved: false, nativeAuthority: false,
  humanFunVerified: false, marketValidated: false, physicalFabricationApproved: false,
  publicationApproved: false
};
exported.notice += " Pocket Arcade proposal only: owner/native approval remains pending; no real tournament was held or booked.";
const roundTrip = editor.parseImport(JSON.stringify(exported));
assert.equal(roundTrip.ok, true);
assert.deepEqual(roundTrip.agenda, revised);
assert.equal(engine.verifySchedule(roundTrip.agenda, proposedAnalysis.feasibility.schedule).valid, true);
const forgedClaim = { ...editor.createExport(input, null), status: "feasible", analysis: proposedAnalysis };
const reimported = editor.parseImport(JSON.stringify(forgedClaim));
assert.equal(reimported.ok, true);
assert.equal(engine.solveAgenda(reimported.agenda).status, "infeasible",
  "Import must not trust a forged feasibility claim.");

const proposalPath = own + "/artifacts/tournament-proposal.json";
const reviewPath = own + "/artifacts/tournament-analysis.json";
const review = {
  schema: "pocket-arcade-tournament-review/1",
  classification: "Actual original solver execution over a synthetic model; no real tournament",
  approvedComponentSnapshot: "502b74346fe913550f732a1a160d76162f392ce4",
  engineInterface: analysis.schema,
  engineVersion: analysis.engineVersion,
  ownerApproved: false, nativeAuthority: false,
  baseline: {
    input: inputPath, start: input.day.start, cutoff: input.day.end,
    requiredMinutes: analysis.feasibility.proof.requiredMinutes,
    availableMinutes: analysis.feasibility.proof.availableMinutes,
    status: analysis.feasibility.status, schedule: analysis.feasibility.schedule,
    proof: analysis.feasibility.proof
  },
  repair: {
    status: analysis.repairs.status, minimumProven: analysis.repairs.minimumProven,
    optimum: analysis.repairs.optimum, choicesShown: analysis.repairs.choices.length,
    tiesComplete: analysis.repairs.proof.tiesComplete,
    cheaperCandidatesComplete: analysis.repairs.proof.cheaperCandidatesComplete,
    selectedChanges: choice.changes,
    interpretation: "One displayed minimum-cost proposal within the declared repair family; tied alternatives are not claimed exhaustive."
  },
  proposal: {
    status: proposedAnalysis.feasibility.status, start: revised.day.start, cutoff: revised.day.end,
    taskCount: revised.tasks.length, tasksUnchanged: true,
    schedule: proposedAnalysis.feasibility.schedule.map(item => ({
      ...item, label: revised.tasks.find(task => task.id === item.taskId).label
    })),
    verification, export: proposalPath, inputOnlyRoundTripVerified: true,
    forgedImportedClaimRejected: true, ownerApproved: false, requiresOwnerReview: true
  },
  sourceFiles: [...locks.values()],
  limits: [
    "Single-track same-day discrete model; declared availability is not a real booking.",
    "The 75-minute baseline remains infeasible. The 85-minute proposal changes the cutoff by 10 minutes without dropping or shortening work.",
    "Game rounds are synthetic session blocks, not a proved eight-player bracket or observed tournament.",
    "Technical feasibility and bounded repair minimality do not establish owner/native approval, human fun, physical fit, market demand or publication authority."
  ]
};
const generated = new Map([[reviewPath, encode(review)], [proposalPath, encode(exported)]]);
for (const [name, bytes] of generated) {
  if (values.check) {
    assert.deepEqual(read(name), bytes, "The actual planner bridge artifacts are stale.");
  } else {
    const folder = path.join(root, own, "artifacts");
    assert(!fs.lstatSync(path.join(root, own)).isSymbolicLink());
    fs.mkdirSync(folder, { recursive: true });
    assert(!fs.lstatSync(folder).isSymbolicLink());
    const target = path.join(root, name);
    if (fs.existsSync(target)) assert(!fs.lstatSync(target).isSymbolicLink());
    fs.writeFileSync(target, bytes);
  }
}
for (const name of review.sourceFiles.map(item => item.path)) read(name);
console.log(JSON.stringify({
  schema: "pocket-arcade-planner-bridge-check/1",
  mode: values.check ? "check" : "write", status: "local-technical-checks-passed",
  originalFilesUnchanged: true, baselineRemainsInfeasible: true,
  proposalVerifiedInModel: true, proposalImportRoundTripVerified: true,
  ownerApproved: false, nativeAuthority: false,
  outputs: [...generated].map(([name, bytes]) => ({ path: name, sha256: hash(bytes), bytes: bytes.length }))
}, null, 2));
