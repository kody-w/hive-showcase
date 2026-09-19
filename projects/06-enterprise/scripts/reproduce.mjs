import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makeWorkload, sourcesFromTexts } from '../source.mjs';
import { ASSUMPTIONS, DESIGNS, SCENARIOS, runAllComparisons } from '../model.mjs';

export const PROJECT = new URL('../', import.meta.url);
export const ROOT = new URL('../../', PROJECT);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const read = (path) => readFileSync(new URL(path, PROJECT), 'utf8');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function loadSources() {
  return sourcesFromTexts({
    accounts: read('fixtures/accounts.csv'), quotes: read('fixtures/quotes.csv'),
    lines: read('fixtures/quote-lines.csv'), policy: read('fixtures/policy.json'),
  });
}

export function verifyProvenance() {
  const provenance = JSON.parse(read('provenance.json'));
  const report = JSON.parse(readFileSync(new URL('evidence/seed-verification.json', ROOT), 'utf8'));
  const seed = report.seeds.find((item) => item.slug === provenance.seedSlug);
  assert.ok(seed, 'Seed missing from root verification report');
  assert.equal(seed.seedRef, provenance.seedRef);
  assert.equal(seed.archiveRef, provenance.archiveRef);
  const matches = [];
  for (const item of provenance.copiedFiles) {
    const original = seed.verifiedFiles.find((entry) => entry.path === item.source);
    assert.ok(original, `Unverified source: ${item.source}`);
    assert.equal(item.sha256, original.sha256);
    assert.equal(item.bytes, original.bytes);
    const bytes = readFileSync(new URL(item.local, PROJECT));
    assert.equal(bytes.length, item.bytes, `Byte-count drift: ${item.local}`);
    assert.equal(sha256(bytes), item.sha256, `Source hash drift: ${item.local}`);
    matches.push({ path: item.local, bytes: bytes.length, sha256: item.sha256, exactMatch: true });
  }
  for (const item of provenance.reviewedContext) {
    assert.equal(seed.verifiedFiles.find((entry) => entry.path === item.source)?.sha256, item.sha256, `Context attribution drift: ${item.source}`);
  }
  return matches;
}

export function produce() {
  const sourceFiles = verifyProvenance();
  const workload = makeWorkload(loadSources());
  const expected = JSON.parse(read('fixtures/expected-results.json')).quotes;
  const outcomes = workload.cases.map(({ source }) => ({
    quote_id: source.quote_id, total_usd: source.total_usd, state: source.state,
    data_errors: source.data_errors, review_reasons: source.review_reasons,
  }));
  assert.deepEqual(outcomes, expected, 'Original calculation disagrees with inert acceptance data');
  const comparisons = runAllComparisons(workload);
  const summaries = comparisons.map((comparison) => {
    const baseline = comparison.runs[0];
    const inputSha256 = sha256(comparison.inputKey);
    return {
      scenario: SCENARIOS.find((entry) => entry.id === comparison.scenarioId),
      inputSha256,
      identicalComparisonInputs: comparison.runs.every((run) => sha256(run.inputKey) === inputSha256),
      runs: comparison.runs.map((run) => ({
        designId: run.designId, inputSha256: sha256(run.inputKey), metrics: run.metrics,
        deltaFromBaseline: {
          durationMinutes: run.metrics.durationMinutes - baseline.metrics.durationMinutes,
          throughputPerHour: run.metrics.throughputPerHour - baseline.metrics.throughputPerHour,
          meanWaitMinutes: run.metrics.wait.mean - baseline.metrics.wait.mean,
          p95WaitMinutes: run.metrics.wait.p95 - baseline.metrics.wait.p95,
          p95CycleMinutes: run.metrics.cycle.p95 - baseline.metrics.cycle.p95,
          cleanP95CycleMinutes: run.metrics.cleanCycle.p95 - baseline.metrics.cleanCycle.p95,
          dispositionQueueMinutes: run.metrics.resources.find((resource) => resource.id === 'disposition').waitMinutes
            - baseline.metrics.resources.find((resource) => resource.id === 'disposition').waitMinutes,
        },
        cases: run.cases.map((item) => ({
          id: item.id, arrival: item.arrival, completedAt: item.completedAt,
          sourceState: item.source.state, totalUsd: item.source.total_usd,
          waitMinutes: item.waitMinutes, cycleMinutes: item.cycleMinutes, serviceMinutes: item.serviceMinutes,
          recheckVisits: item.history.filter((visit) => visit.kind === 'recheck').length,
          cycleDeltaFromBaseline: item.cycleMinutes - baseline.cases.find((entry) => entry.id === item.id).cycleMinutes,
        })),
      })),
    };
  });
  const paced = comparisons[0];
  const summary = {
    schema: 'enterprise-queue-comparison/1', classification: 'SYNTHETIC',
    meaning: 'Measured in this deterministic model only. Disposed means a pending handoff was recorded, never approval or realized savings.',
    sourceFiles, sourceAcceptance: outcomes, assumptions: ASSUMPTIONS, designs: DESIGNS,
    comparisons: summaries,
  };
  return {
    workload, comparisons, summary,
    artifacts: {
      'fixtures/workload.json': json(workload),
      'results/comparison.json': json(summary),
      'results/replays.json': json({
        schema: 'enterprise-queue-replays/1', classification: 'SYNTHETIC',
        scope: 'Full paced-workload histories; stress trajectories are reproducible with runAllComparisons.',
        inputSha256: sha256(paced.inputKey),
        runs: paced.runs.map(({ inputKey, ...run }) => ({ ...run, inputSha256: sha256(inputKey) })),
      }),
    },
  };
}

export function checkArtifacts(artifacts) {
  for (const [path, text] of Object.entries(artifacts)) assert.equal(read(path), text, `Stale generated artifact: ${path}; regenerate with --write`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const mode = process.argv[2] ?? '--check';
    assert.ok(['--write', '--check'].includes(mode), 'Use --write or --check');
    const { artifacts, summary } = produce();
    if (mode === '--write') {
      for (const [path, text] of Object.entries(artifacts)) {
        const target = fileURLToPath(new URL(path, PROJECT));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, text);
      }
    } else checkArtifacts(artifacts);
    console.log(`${mode === '--write' ? 'Produced' : 'Verified'} ${Object.keys(artifacts).length} deterministic artifacts; 6 exact source hashes; 8 exact-money outcomes; 12 conserved runs.`);
    for (const entry of summary.comparisons) {
      console.log(`${entry.scenario.id}: ${entry.runs.map((run) => `${run.designId} ${run.metrics.durationMinutes}m / ${run.metrics.throughputPerHour.toFixed(3)} handoffs·h⁻¹ / p95 wait ${run.metrics.wait.p95}m`).join(' | ')}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
