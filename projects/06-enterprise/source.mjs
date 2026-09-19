const required = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function parseCsv(text) {
  required(typeof text === 'string', 'CSV must be text');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (character === '"') {
        quoted = false;
        closed = true;
      } else field += character;
    } else if (character === '"' && field === '' && !closed) {
      quoted = true;
    } else if (character === ',' || character === '\n' || character === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (character !== ',') {
        rows.push(row);
        row = [];
        if (character === '\r' && text[i + 1] === '\n') i += 1;
      }
    } else {
      required(!closed && character !== '"', 'Malformed CSV quote');
      field += character;
    }
  }
  required(!quoted, 'Unclosed CSV quote');
  if (field !== '' || row.length || closed) rows.push([...row, field]);
  required(rows.length > 1, 'CSV needs header and records');
  const [headers, ...records] = rows;
  required(headers.every(Boolean) && new Set(headers).size === headers.length, 'Duplicate or empty CSV header');
  return records.map((values) => {
    required(values.length === headers.length, 'CSV column count mismatch');
    return Object.fromEntries(headers.map((name, i) => [name, values[i]]));
  });
}

function hundredths(value, name) {
  required(typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value), `Invalid decimal: ${name}`);
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  required(result <= BigInt(Number.MAX_SAFE_INTEGER), `Decimal too large: ${name}`);
  return result;
}

function percentage(value, name) {
  const result = hundredths(value, name);
  required(result <= 10000n, `Percentage outside 0–100: ${name}`);
  return result;
}

function terms(value) {
  required(typeof value === 'string' && /^\d+$/.test(value) && +value >= 1 && +value <= 120, 'Terms outside 1–120');
  return Number(value);
}

function yesNo(value, name) {
  required(value === 'yes' || value === 'no', `Invalid yes/no: ${name}`);
  return value === 'yes';
}

function keyed(rows, key) {
  required(Array.isArray(rows) && rows.length > 0, `Missing ${key} rows`);
  const index = new Map();
  for (const row of rows) {
    required(row.classification === 'SYNTHETIC', 'Only labeled SYNTHETIC data is supported');
    required(typeof row[key] === 'string' && row[key].length > 0, `Missing ${key}`);
    required(!index.has(row[key]), `Duplicate ${key}: ${row[key]}`);
    index.set(row[key], row);
  }
  return index;
}

const halfUp = (numerator) => (numerator + 5000n) / 10000n;
const money = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

export function evaluateSources({ accounts, quotes, lines, policy }) {
  const accountIndex = keyed(accounts, 'account-id');
  const quoteIndex = keyed(quotes, 'quote-id');
  keyed(lines, 'line-id');
  required(policy?.classification === 'SYNTHETIC', 'Only labeled SYNTHETIC policy is supported');
  required(policy.currency === 'USD' && policy.rounding === 'ROUND_HALF_UP-per-line-and-shipping-tax', 'Unsupported money policy');
  required(typeof policy.po_required === 'boolean', 'PO requirement must be explicit');
  const caps = Object.fromEntries(Object.entries(policy.discount_caps_pct).map(([key, value]) => [key, percentage(value, key)]));
  const rates = Object.fromEntries(Object.entries(policy.tax_rates_pct).map(([key, value]) => [key, percentage(value, key)]));
  required(Object.hasOwn(rates, policy.shipping_tax_code), 'Unknown shipping tax policy');
  for (const account of accounts) {
    hundredths(account['credit-limit-usd'], 'credit limit');
    hundredths(account['open-balance-usd'], 'open balance');
    terms(account['approved-terms-days']);
    yesNo(account.active, 'active');
    required(Object.hasOwn(caps, account.tier), 'Unknown account tier');
  }
  for (const line of lines) required(quoteIndex.has(line['quote-id']), `Orphan line: ${line['line-id']}`);

  return [...quoteIndex.keys()].sort().map((id) => {
    const quote = quoteIndex.get(id);
    const account = accountIndex.get(quote['account-id']);
    required(account, `Unknown account on ${id}`);
    const quoteLines = lines.filter((line) => line['quote-id'] === id);
    required(quoteLines.length > 0, `No lines on ${id}`);
    const dataErrors = [], reviewReasons = [];
    if (policy.po_required && !quote['po-reference']?.trim()) dataErrors.push('missing-po');
    if (!yesNo(account.active, 'active')) reviewReasons.push('inactive-account');
    if (terms(quote['requested-terms-days']) > terms(account['approved-terms-days'])) reviewReasons.push('terms-policy');
    const shipping = hundredths(quote['shipping-usd'], 'shipping');
    const shippingTax = yesNo(quote['shipping-taxable'], 'shipping taxable')
      ? halfUp(shipping * rates[policy.shipping_tax_code]) : 0n;
    let netTotal = 0n, taxTotal = 0n;
    const calculations = [];
    for (const line of quoteLines) {
      const lineId = line['line-id'];
      const quantity = /^-?\d+$/.test(line.quantity) ? Number(line.quantity) : NaN;
      const quantityValid = Number.isSafeInteger(quantity) && quantity > 0;
      if (!quantityValid) dataErrors.push(`${lineId}:invalid-quantity`);
      const knownTax = Object.hasOwn(rates, line['tax-code']);
      if (!knownTax) dataErrors.push(`${lineId}:unknown-tax-code`);
      const price = hundredths(line['unit-price-usd'], 'unit price');
      const discount = percentage(line['discount-pct'], 'discount');
      if (discount > caps[account.tier]) reviewReasons.push(`${lineId}:discount-policy`);
      if (quantityValid && knownTax) {
        // Round the net line first, then tax that rounded net; never round a batch.
        const net = halfUp(BigInt(quantity) * price * (10000n - discount));
        const tax = halfUp(net * rates[line['tax-code']]);
        netTotal += net;
        taxTotal += tax;
        calculations.push({ lineId, netUsd: money(net), taxUsd: money(tax) });
      }
    }
    const total = netTotal + taxTotal + shipping + shippingTax;
    required(total <= BigInt(Number.MAX_SAFE_INTEGER), 'Quote total exceeds exact integer range');
    const blocked = dataErrors.length > 0;
    if (!blocked && hundredths(account['open-balance-usd'], 'open balance') + total > hundredths(account['credit-limit-usd'], 'credit limit')) {
      reviewReasons.push('credit-limit');
    }
    return {
      quote_id: id,
      total_usd: blocked ? null : money(total),
      state: blocked ? 'needs-data' : reviewReasons.length ? 'needs-review' : 'ready-for-human-approval',
      data_errors: dataErrors.sort(),
      review_reasons: reviewReasons.sort(),
      accountId: quote['account-id'],
      lineIds: quoteLines.map((line) => line['line-id']),
      calculations: blocked ? null : { lines: calculations, shippingUsd: money(shipping), shippingTaxUsd: money(shippingTax) },
    };
  });
}

export function sourcesFromTexts(texts) {
  return {
    accounts: parseCsv(texts.accounts),
    quotes: parseCsv(texts.quotes),
    lines: parseCsv(texts.lines),
    policy: JSON.parse(texts.policy),
  };
}

export function makeWorkload(sources) {
  return {
    schema: 'enterprise-queue-workload/1',
    classification: 'SYNTHETIC',
    anchor: 'Lattice Harbor Supply; eight original seed quotes, unmodified business data',
    arrivalAssumption: 'Quote-ID order, one arrival every 10 model minutes from t=0; no source timestamps exist.',
    cases: evaluateSources(sources).map((quote, index) => ({
      id: quote.quote_id,
      arrival: index * 10,
      source: quote,
    })),
  };
}
