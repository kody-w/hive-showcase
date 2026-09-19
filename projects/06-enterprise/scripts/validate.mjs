import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROJECT, ROOT, read, sha256, produce, verifyProvenance } from './reproduce.mjs';

const prefix = 'projects/06-enterprise/';
const record = process.argv.includes('--record');
const execute = (argv) => {
  const result = spawnSync(process.execPath, argv.slice(1), { cwd: fileURLToPath(ROOT), encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`Check failed (${result.status}): ${argv.join(' ')}${result.error ? `: ${result.error.message}` : ''}`);
  }
  return result;
};

try {
  assert.ok(process.argv.slice(2).every((arg) => arg === '--record'), 'Only --record is supported');
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.id, '06-enterprise');
  assert.equal(manifest.seedSlug, 'enterprise-transformation-firm');
  assert.equal(manifest.stage, 'work-produced');
  assert.equal(manifest.entrypoint, `${prefix}index.html`);
  assert.ok(manifest.checks.every((argv) => Array.isArray(argv) && argv.length > 1 && argv.every((item) => typeof item === 'string')));
  assert.equal(new Set(manifest.artifacts).size, manifest.artifacts.length);
  assert.ok(manifest.artifacts.every((path) => path.startsWith(prefix) && !path.includes('..')));
  const sourceFiles = verifyProvenance();
  const testsArgv = ['node', '--test', '--test-reporter=tap', `${prefix}tests/source.test.mjs`, `${prefix}tests/engine.test.mjs`, `${prefix}tests/ui.test.mjs`];
  const tests = execute(testsArgv);
  const testCounts = Object.fromEntries([...tests.stdout.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)].map((match) => [match[1], Number(match[2])]));
  assert.ok(testCounts.tests > 0, 'No executed tests in the actual runner output');
  assert.equal(testCounts.pass, testCounts.tests);
  assert.equal(testCounts.fail, 0);
  assert.equal(testCounts.skipped, 0);
  assert.equal(testCounts.cancelled, 0);
  const reproduceArgv = ['node', `${prefix}scripts/reproduce.mjs`, '--check'];
  execute(reproduceArgv);
  const { summary } = produce();

  const trace = JSON.parse(read('traceability.json'));
  assert.equal(trace.requirements.length, 12);
  assert.equal(new Set(trace.requirements.map((item) => item.id)).size, 12);
  assert.equal(new Set(trace.requirements.flatMap((item) => item.cases)).size, 8);
  assert.ok(trace.requirements.every((item) => item.evidence.length && item.gate && item.fields.length));
  const report = JSON.parse(readFileSync(new URL('evidence/seed-verification.json', ROOT), 'utf8'));
  const seed = report.seeds.find((entry) => entry.slug === manifest.seedSlug);
  assert.equal(seed.verifiedFiles.find((item) => item.path === trace.sourceRequirements.path).sha256, trace.sourceRequirements.sha256);

  const integrity = manifest.artifacts.filter((path) => path !== `${prefix}evidence/result.json`).map((path) => {
    const bytes = readFileSync(new URL(path, ROOT));
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const evidence = {
    schema: 'local-enterprise-simulator-result/1',
    id: manifest.id, stage: 'work-produced', classification: 'SYNTHETIC',
    outcome: 'Original deterministic queue simulator, comparison UI, exact input reconciliation, stress counterexamples, and reversible no-production pilot proposal produced and automatically checked.',
    validation: {
      nodeVersion: process.version,
      checks: [
        { argv: testsArgv, cwd: '.', exitCode: tests.status, actualRunnerCounts: testCounts },
        { argv: reproduceArgv, cwd: '.', exitCode: 0, assertions: 'Exact source hashes, eight source outcomes, and all generated artifact bytes match.' },
      ],
      manifestAndLocalLinkCheck: 'passed',
      requirementTrace: { sourceRequirements: 12, coveredSourceQuotes: 8, confirmedAgainstVerifiedSourceHash: true },
      browser: { performed: false, substitute: 'Node render/reducer tests and actual app event wiring exercised with an injected DOM/clock adapter; no visual or real-browser validation claimed.' },
    },
    inputEvidence: {
      sourceFiles,
      exactSourceOutcomes: summary.sourceAcceptance,
      perScenario: summary.comparisons.map((comparison) => ({
        scenarioId: comparison.scenario.id, inputSha256: comparison.inputSha256,
        identicalAcrossDesigns: comparison.identicalComparisonInputs,
        caseCount: comparison.runs[0].metrics.submitted,
      })),
    },
    modeledComparisons: summary.comparisons.map((comparison) => ({
      scenarioId: comparison.scenario.id,
      runs: comparison.runs.map((run) => ({
        designId: run.designId, submitted: run.metrics.submitted, disposed: run.metrics.disposed,
        dropped: run.metrics.dropped, approved: run.metrics.approved,
        sourceCategories: run.metrics.sourceCategories,
        durationMinutes: run.metrics.durationMinutes, handoffsPerHour: run.metrics.throughputPerHour,
        wait: run.metrics.wait, cycle: run.metrics.cycle, cleanCaseTailMinutes: run.metrics.cleanCycle.p95,
        bottleneck: run.metrics.bottleneck, rework: run.metrics.rework,
        dispositionQueueMinutes: run.metrics.resources.find((resource) => resource.id === 'disposition').waitMinutes,
        modeledSlots: run.metrics.resources.reduce((sum, resource) => sum + resource.capacity, 0),
        deltaFromBaseline: run.deltaFromBaseline,
      })),
    })),
    counterexamples: [
      { condition: 'gate', redesign: 'triage', tradeoff: 'Faster drain (324 vs 376 min), but worse clean tail (180 vs 150) and more final-desk wait (528 vs 310 case-min). New bottleneck: disposition.' },
      { condition: 'escalation', redesign: 'pod', tradeoff: 'Slower drain (390 vs 280 min), lower throughput (1.231 vs 1.714 handoffs/h), worse p95 wait (194 vs 132), despite a faster clean path (78 vs 126).' },
    ],
    claimsBoundary: {
      modeledImprovementIsRealizedSavings: false, humanReviewed: false, pilotPerformed: false,
      productionChanged: false, invoicesIssued: 0, approvalsGranted: 0,
      nativeInitialized: false, downloadedReferenceCodeExecutedImportedOrEmbedded: false,
      externalMutations: false, backgroundServicesStarted: false,
    },
    limitations: manifest.limitations,
    integrity,
  };

  const html = read('index.html');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const [, target] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if (target.startsWith('#')) assert.ok(ids.has(target.slice(1)), `Missing anchor: ${target}`);
    else {
      assert.ok(!/^[a-z]+:|^\/\//i.test(target), `Unexpected external runtime link: ${target}`);
      const url = new URL(target, new URL('index.html', PROJECT));
      const expectedEvidence = new URL('evidence/result.json', PROJECT).href;
      if (record && url.href === expectedEvidence) continue;
      assert.ok(existsSync(url), `Broken local link: ${target}`);
    }
  }
  if (record) {
    mkdirSync(new URL('evidence/', PROJECT), { recursive: true });
    writeFileSync(new URL('evidence/result.json', PROJECT), `${JSON.stringify(evidence, null, 2)}\n`);
  } else {
    const previous = JSON.parse(read('evidence/result.json'));
    assert.deepEqual(previous.integrity, integrity, 'Recorded evidence is stale; run validate.mjs --record after reviewed changes');
    assert.deepEqual(previous.inputEvidence, evidence.inputEvidence);
    assert.deepEqual(previous.modeledComparisons, evidence.modeledComparisons);
    assert.deepEqual(previous.validation.checks[0].actualRunnerCounts, testCounts);
  }
  for (const path of manifest.artifacts) assert.ok(existsSync(new URL(path, ROOT)), `Missing artifact: ${path}`);
  console.log(`PASS ${testCounts.pass}/${testCounts.tests} Node tests; 6 exact source hashes; 8 exact-money cases; 12 deterministic conserved runs; local links/manifest/trace; ${integrity.length} artifact hashes.`);
  console.log(record ? 'Recorded projects/06-enterprise/evidence/result.json from actual successful checks.' : 'Recorded evidence is current. Browser, human, production and financial validation remain not performed.');
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
