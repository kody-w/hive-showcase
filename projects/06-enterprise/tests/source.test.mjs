import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSources, makeWorkload, parseCsv } from '../source.mjs';
import { loadSources, read, verifyProvenance } from '../scripts/reproduce.mjs';

test('copied input data and MIT notice match the exact verified seed bytes', () => {
  assert.equal(verifyProvenance().length, 6);
});

test('all eight original outcomes match the inert acceptance JSON exactly', () => {
  const sources = loadSources();
  const before = structuredClone(sources);
  const actual = evaluateSources(sources).map(({ quote_id, total_usd, state, data_errors, review_reasons }) => ({
    quote_id, total_usd, state, data_errors, review_reasons,
  }));
  assert.deepEqual(actual, JSON.parse(read('fixtures/expected-results.json')).quotes);
  assert.deepEqual(sources, before);
  assert.equal(sources.accounts.length, 4);
  assert.equal(sources.quotes.length, 8);
  assert.equal(sources.lines.length, 9);
});

test('line net, line tax, and shipping tax round half-up with exact integers', () => {
  const actual = evaluateSources(loadSources());
  assert.deepEqual(actual[0].calculations, {
    lines: [{ lineId: 'line-101-a', netUsd: '237.50', taxUsd: '17.81' }], shippingUsd: '12.00', shippingTaxUsd: '0.90',
  });
  assert.equal(actual[3].calculations.lines[0].netUsd, '849.92');
  assert.equal(actual[3].total_usd, '935.16');
  assert.equal(actual[5].calculations.lines[0].taxUsd, '0.01');
  assert.equal(actual[5].total_usd, '10.16');
});

test('data errors suppress all totals, outrank policy flags, and never invent corrections', () => {
  const sources = loadSources();
  sources.quotes[3]['po-reference'] = '';
  const source = evaluateSources(sources)[3];
  assert.equal(source.state, 'needs-data');
  assert.equal(source.total_usd, null);
  assert.equal(source.calculations, null);
  assert.deepEqual(source.review_reasons, ['inactive-account', 'terms-policy']);
  const unchanged = evaluateSources(loadSources());
  assert.deepEqual(unchanged[4].data_errors, ['line-105-a:unknown-tax-code', 'missing-po']);
  assert.deepEqual(unchanged[6].data_errors, ['line-107-a:invalid-quantity']);
});

test('credit, discount and terms boundaries are inclusive and quotes do not reserve balances', () => {
  const sources = loadSources();
  sources.accounts[1]['credit-limit-usd'] = '1036.10';
  assert.equal(evaluateSources(sources)[1].state, 'ready-for-human-approval');
  sources.accounts[1]['credit-limit-usd'] = '1036.09';
  assert.deepEqual(evaluateSources(sources)[1].review_reasons, ['credit-limit']);
  assert.equal(evaluateSources(sources)[0].state, 'ready-for-human-approval');
  assert.equal(sources.accounts[0]['open-balance-usd'], '4500.00');
});

test('authored arrivals are explicit, preserve identities, and leave data defects untouched', () => {
  const workload = makeWorkload(loadSources());
  assert.deepEqual(workload.cases.map((item) => item.arrival), [0, 10, 20, 30, 40, 50, 60, 70]);
  assert.ok(workload.arrivalAssumption.includes('no source timestamps'));
  assert.equal(workload.classification, 'SYNTHETIC');
  assert.equal(workload.cases[4].source.total_usd, null);
  assert.equal(workload.cases[6].source.total_usd, null);
});

test('CSV parses CRLF, escaped quotes, embedded newlines and final empty values', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x,y","a""b"\r\n"two\nlines",\r\n'), [
    { a: 'x,y', b: 'a"b' }, { a: 'two\nlines', b: '' },
  ]);
  assert.throws(() => parseCsv('a,a\n1,2\n'), /header/);
  assert.throws(() => parseCsv('a,b\n1\n'), /column count/);
  assert.throws(() => parseCsv('a,b\n"x,2'), /Unclosed/);
  assert.throws(() => parseCsv('a,b\n"x"tail,2\n'), /Malformed/);
});

for (const [name, mutate] of [
  ['unlabeled account', (s) => { delete s.accounts[0].classification; }],
  ['non-synthetic quote', (s) => { s.quotes[0].classification = 'REAL'; }],
  ['non-synthetic line', (s) => { s.lines[0].classification = 'REAL'; }],
  ['non-synthetic policy', (s) => { s.policy.classification = 'REAL'; }],
  ['duplicate account', (s) => { s.accounts.push(structuredClone(s.accounts[0])); }],
  ['duplicate quote', (s) => { s.quotes.push(structuredClone(s.quotes[0])); }],
  ['duplicate line', (s) => { s.lines.push(structuredClone(s.lines[0])); }],
  ['unknown account', (s) => { s.quotes[0]['account-id'] = 'unknown'; }],
  ['orphan line', (s) => { s.lines[0]['quote-id'] = 'unknown'; }],
  ['no quote lines', (s) => { s.lines = s.lines.filter((line) => line['quote-id'] !== 'q-101'); }],
  ['malformed price', (s) => { s.lines[0]['unit-price-usd'] = '0x20'; }],
  ['negative shipping', (s) => { s.quotes[0]['shipping-usd'] = '-1.00'; }],
  ['overprecision money', (s) => { s.lines[0]['unit-price-usd'] = '1.001'; }],
  ['out-of-bounds discount', (s) => { s.lines[0]['discount-pct'] = '100.01'; }],
  ['nonfinite amount', (s) => { s.accounts[0]['open-balance-usd'] = 'Infinity'; }],
  ['invalid terms', (s) => { s.quotes[0]['requested-terms-days'] = '121'; }],
  ['ambiguous flag', (s) => { s.quotes[0]['shipping-taxable'] = 'true'; }],
  ['unknown tier', (s) => { s.accounts[0].tier = 'unconfirmed'; }],
  ['unknown shipping tax', (s) => { s.policy.shipping_tax_code = 'unconfirmed'; }],
  ['unsupported currency', (s) => { s.policy.currency = 'EUR'; }],
]) {
  test(`fail closed for ${name}`, () => {
    const sources = loadSources();
    mutate(sources);
    assert.throws(() => evaluateSources(sources));
  });
}

test('fractional and unsafe quantities are data blockers, never truncated or coerced', () => {
  for (const quantity of ['1.5', 'NaN', '9007199254740992', '0']) {
    const sources = loadSources();
    sources.lines[0].quantity = quantity;
    const quote = evaluateSources(sources)[0];
    assert.equal(quote.total_usd, null);
    assert.ok(quote.data_errors.includes('line-101-a:invalid-quantity'));
  }
});
