"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../model.js");
const directory = path.resolve(__dirname, "..");
const contract = JSON.parse(fs.readFileSync(path.join(directory, "contract.json"), "utf8"));

// These are synthetic view-model inputs only, never saved as contribution evidence.
function syntheticReport() {
  return {
    schema: "pocket-arcade-validation/1",
    mode: "real-local-artifacts", fixtureOnly: false,
    integrationStatus: "awaiting-real-contributions", integrationPassed: false, validationPassed: false,
    boundaries: Object.fromEntries(model.boundaryKeys.map(key => [key, false])),
    contributions: model.projects.map(project => ({ id: project.id, status: "awaiting" })),
    inputFiles: [], errors: []
  };
}

test("UI catalog matches the actual machine-readable contract", () => {
  assert.deepEqual(model.projects.map(project => project.id), contract.contributors.map(project => project.id));
  for (const project of model.projects) {
    const spec = contract.contributors.find(item => item.id === project.id);
    assert.equal(spec.label, project.label);
    assert.equal(spec.seedSlug, project.seedSlug);
    assert.equal(spec.entrypoint, `projects/${project.id}/index.html`);
  }
  assert.deepEqual([...model.boundaryKeys].sort(), Object.keys(contract.boundaries).sort());
});

test("safe paths reject traversal, absolute URLs, encoding and foreign projects", () => {
  for (const unsafe of [
    "../01-game-studio/index.html", "/projects/01-game-studio/index.html", "https://example.invalid/x",
    "projects/01-game-studio/../secret", "projects/01-game-studio/%2e%2e/x", "projects/01-game-studio//x",
    "projects/01-game-studio\\x", "projects/01-game-studio/x?key=y", "projects/01-game-studio/x#fragment",
    "projects/02-other/index.html", null, {}, "projects/01-game-studio/./index.html",
    "projects/01-game-studio/stores/account.json", "projects/09-handoff/.git/config"
  ]) assert.equal(model.safePath(unsafe), false, String(unsafe));
  assert.equal(model.safePath("projects/10-pocket-arcade/evidence/checks/01-game-studio-0.txt"), true);
  assert.equal(model.safePath("projects/07-manufacturing/artifacts/tray.scad"), true);
});

test("manifest availability checks require the actual identity and field shapes", () => {
  const project = model.projects[0];
  const manifest = {
    id: project.id, seedSlug: project.seedSlug, entrypoint: `projects/${project.id}/index.html`,
    stage: "work-produced", title: "SYNTHETIC VIEW-MODEL TEST", summary: "Not a real contribution.",
    checks: [["node", "--test", "synthetic-only.cjs"]],
    artifacts: [`projects/${project.id}/index.html`],
    limitations: ["Synthetic unit-test object only."]
  };
  assert.equal(model.inspectManifest(manifest, project), manifest);
  manifest.fixtureOnly = true;
  assert.throws(() => model.inspectManifest(manifest, project), /fixtures/);
  delete manifest.fixtureOnly;
  manifest.summary = null;
  assert.throws(() => model.inspectManifest(manifest, project), /summary/);
  manifest.summary = "Synthetic view-model input";
  manifest.id = "05-planner";
  assert.throws(() => model.inspectManifest(manifest, project), /identity/);
});

test("the published contribution schema declares the same IDs and false authority", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(directory, "interfaces", "contribution.schema.json"), "utf8"));
  assert.deepEqual(schema.$defs.contribution.properties.id.enum, model.projects.map(project => project.id));
  assert.deepEqual(schema.$defs.contribution.properties.interfaceId.enum,
    contract.contributors.map(project => project.interfaceId));
  assert.deepEqual(schema.$defs.proof.properties.equals.enum, contract.acceptancePolicy.passingProofValues);
  for (const key of model.boundaryKeys) assert.equal(schema.properties.boundaries.properties[key].const, false);
});

test("unverified presence never becomes integration acceptance", () => {
  const availability = Object.fromEntries(model.projects.map(project => [project.id, "present"]));
  const status = model.assessStatus(syntheticReport(), availability, "verified");
  assert.equal(status.title, "Awaiting real contributions");
  assert.equal(status.tone, "pending");
});

test("three recorded component passes still leave the actual planner dependency pending", () => {
  const report = syntheticReport();
  report.summary = { verifiedLocalContributions: 3, awaitingContributions: ["05-planner"] };
  const availability = Object.fromEntries(model.projects.map(project => [project.id, "present"]));
  availability["05-planner"] = "missing";
  const status = model.assessStatus(report, availability, "verified-partial");
  assert.equal(status.title, "Awaiting real contributions");
  assert.equal(status.tone, "pending");
  assert.match(status.detail, /3 contributions/);
  assert.match(status.detail, /Planner05 is still missing/);
});

test("four bound interfaces without a loaded report do not claim missing data or fresh acceptance", () => {
  const status = model.assessStatus(null, {}, "not-checked", { pending: [], testFixtureOnly: true });
  assert.equal(status.title, "Four contributions recorded · not reverified");
  assert.equal(status.tone, "pending");
  assert.match(status.detail, /Operational\/native approval remains pending/);
  assert.match(status.detail, /showcase publication is separately authorized/);
});

test("saved pass remains unverified if any actual contribution is missing", () => {
  const viewInput = { integrationStatus: "local-integration-checks-passed", integrationPassed: true };
  const availability = Object.fromEntries(model.projects.map(project => [project.id, "present"]));
  availability["09-handoff"] = "missing";
  assert.equal(model.assessStatus(viewInput, availability, "verified").tone, "pending");
  availability["09-handoff"] = "present";
  assert.equal(model.assessStatus(viewInput, availability, "not-checked").tone, "pending");
  assert.equal(model.assessStatus(viewInput, availability, "verified").title, "Local snapshot verified");
  assert.equal(model.assessStatus(viewInput, availability, "mismatch").tone, "error");
});

test("fixture reports are explicitly refused by the real-contribution UI", () => {
  const report = syntheticReport();
  report.mode = "test-fixtures";
  report.fixtureOnly = true;
  assert.throws(() => model.inspectReport(report), /Fixture-only/);
});

test("the connected-data UI refuses fixture bytes as actual arrived artifacts", () => {
  assert.throws(() => model.inspectConnectedData({
    schema: "pocket-arcade-connected-data/2", fixtureOnly: true, testOnly: true
  }), /actual original/);
});

test("reports with positive native authority or malformed pass fields are refused", () => {
  const report = syntheticReport();
  report.boundaries.nativeMembership = true;
  assert.throws(() => model.inspectReport(report), /authority/);
  report.boundaries.nativeMembership = false;
  report.integrationPassed = "true";
  assert.throws(() => model.inspectReport(report), /booleans/);
});

test("a self-asserted report pass is insufficient", () => {
  const report = syntheticReport();
  report.integrationPassed = report.validationPassed = true;
  report.integrationStatus = "local-integration-checks-passed";
  assert.throws(() => model.inspectReport(report), /hash/);
});

test("untrusted report file locators cannot make a foreign request", () => {
  const report = syntheticReport();
  report.inputFiles.push({ path: "https://example.invalid/tracker", sha256: "0".repeat(64), bytes: 10 });
  assert.throws(() => model.inspectReport(report), /unsafe/);
});

test("valid awaiting report is accepted only as awaiting", () => {
  const report = syntheticReport();
  assert.equal(model.inspectReport(report).integrationPassed, false);
  report.contributions[1].id = report.contributions[0].id;
  assert.throws(() => model.inspectReport(report), /duplicate/);
});

test("notes are bounded user data and never a result or integration receipt", () => {
  const notes = model.sessionRecord([" Mica ", "Copper", "", "", "", "", "", "z".repeat(50)], "q".repeat(600));
  assert.equal(notes.aliases[0], "Mica");
  assert.equal(notes.aliases[7].length, 24);
  assert.equal(notes.notes.length, 480);
  assert.equal(notes.integrationAcceptance, false);
  assert.equal(notes.nativeAuthority, false);
  assert.match(notes.classification, /not-integration-evidence/);
  assert.throws(() => model.sessionRecord(["too few"], ""), /eight/);
});

test("every station has availability, acceptance and action controls in the original HTML", () => {
  const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(directory, "style.css"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, "IDs must be unique");
  for (const project of model.projects) {
    assert.ok(ids.includes(`availability-${project.id}`));
    assert.ok(ids.includes(`acceptance-${project.id}`));
    assert.ok(html.includes(`data-select="${project.id}"`));
    assert.ok(html.includes(`../${project.id}/manifest.json`));
  }
  for (const required of ["station-title", "station-detail", "station-link", "refresh-button",
    "verify-button", "report-file", "session-sheet", "notes-status", "verification-status",
    "connected-source", "recorded-game-value", "recorded-planner-value", "recorded-planner-detail",
    "recorded-tray-value", "recorded-maintenance-value"]) {
    assert.ok(ids.includes(required), required);
  }
  assert.match(html, /Four contributions bound/);
  assert.match(html, /REFUSAL RETAINED/);
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:)?\/\//);
  assert.match(css, /:root\s*\{\s*color-scheme:\s*light;/);
  assert.match(css, /\.arcade-shell > main\s*\{\s*width:\s*100%;\s*margin:\s*0;/);
  assert.match(css, /\.eyebrow\s*\{\s*color:\s*var\(--ink\);/);
});

test("printable kit provides actual blank cards, local links and four concrete instructions", () => {
  const html = fs.readFileSync(path.join(directory, "artifacts", "operator-kit.html"), "utf8");
  assert.equal((html.match(/class="card"/g) || []).length, 8);
  assert.equal((html.match(/<li>/g) || []).length, 4);
  assert.match(html, /Blank operator kit, not a simulated success/);
  for (const project of model.projects) assert.ok(html.includes(`../../${project.id}/index.html`));
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:)?\/\//);
});

test("browser shell neither stores user notes nor executes downloaded strings", () => {
  const app = fs.readFileSync(path.join(directory, "app.js"), "utf8");
  assert.doesNotMatch(app, /\blocalStorage\b|\bsessionStorage\b|\beval\s*\(|new\s+Function\b|\.innerHTML\s*=/);
  assert.match(app, /credentials: "omit"/);
  assert.match(app, /redirect: "error"/);
  assert.match(app, /crypto\.subtle\.digest\("SHA-256"/);
});
