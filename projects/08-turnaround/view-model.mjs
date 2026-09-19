export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

export function formatMoney(cents) {
  if (!Number.isSafeInteger(cents)) throw new Error("Display money must be integer cents");
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0
  }).format(cents / 100);
}

export function dayLabel(day) {
  return day === null ? "Beyond window" : `D${day}`;
}

export function aggregateTimeline(daily, mode = "weekly") {
  if (!["weekly", "daily"].includes(mode)) throw new Error("Unknown timeline mode");
  const groups = [[daily[0]]];
  const width = mode === "weekly" ? 7 : 1;
  for (let start = 1; start < daily.length; start += width) groups.push(daily.slice(start, start + width));
  return groups.map((rows, index) => ({
    label: index === 0 ? "Opening" : mode === "weekly" ?
      `W${index} · D${rows[0].day}–${rows.at(-1).day}` : `D${rows[0].day}`,
    startDay: rows[0].day, endDay: rows.at(-1).day,
    date: rows.at(-1).date,
    receiptsCents: rows.reduce((n, row) => n + row.receiptsCents, 0),
    outflowsCents: rows.reduce((n, row) => n + row.outflowsCents, 0),
    cashCents: rows.at(-1).cashCents,
    availableCents: rows.at(-1).availableCents,
    reserveCents: rows.at(-1).reserveCents,
    troughAvailableCents: Math.min(...rows.map(row => row.troughAvailableCents)),
    counterfactual: rows.some(row => row.counterfactual)
  }));
}

export function cashChartSvg(result, baseline, floorCents, inspectDay) {
  const points = result.daily;
  const low = Math.floor((Math.min(0, result.summary.minimumAvailableCents, baseline.summary.minimumAvailableCents) - 100000) / 500000) * 500000;
  const high = Math.ceil((Math.max(...points.map(row => row.availableCents), floorCents) + 200000) / 500000) * 500000;
  const x = day => 74 + day / result.horizonDays * 922;
  const y = cents => 24 + (high - cents) / (high - low) * 244;
  const line = (rows, key) => rows.map((row, index) =>
    `${index ? "L" : "M"}${x(row.day).toFixed(2)},${y(row[key]).toFixed(2)}`
  ).join(" ");
  const ticks = [];
  for (let cents = low; cents <= high; cents += 1000000) {
    ticks.push(`<g><line x1="74" x2="996" y1="${y(cents)}" y2="${y(cents)}" class="chart-grid"/><text x="62" y="${y(cents) + 4}" text-anchor="end">${escapeHtml(formatMoney(cents))}</text></g>`);
  }
  const labels = [0, 15, 30, 45, 60, 75, 90].filter(day => day <= result.horizonDays).map(day =>
    `<text x="${x(day)}" y="298" text-anchor="middle">D${day}</text>`
  ).join("");
  const floorDay = result.summary.firstFloorDay;
  const fundingDay = result.summary.firstUnfundedDay;
  const shaded = fundingDay === null ? "" :
    `<rect x="${x(fundingDay)}" y="24" width="${Math.max(2, 996 - x(fundingDay))}" height="244" class="chart-counterfactual"/><line x1="${x(fundingDay)}" x2="${x(fundingDay)}" y1="24" y2="268" class="chart-default"/><text x="992" y="15" text-anchor="end">Counterfactual from D${fundingDay}</text>`;
  const point = points.find(row => row.day === inspectDay) ?? points[0];
  const floorMarker = floorDay === null ? "" :
    `<circle cx="${x(floorDay)}" cy="${y(result.firstFloorBreach.availableCents)}" r="5" class="chart-breach"/>`;
  return `<svg viewBox="0 0 1040 316" role="img" aria-labelledby="cash-chart-title cash-chart-desc">
    <title id="cash-chart-title">Reserved-cash runway and intraday troughs</title>
    <desc id="cash-chart-desc">Cash net of unpaid prior-period reserves. The floor is ${escapeHtml(formatMoney(floorCents))}. First floor breach ${dayLabel(floorDay)}; first unfunded payment ${dayLabel(fundingDay)}. Negative values are funding requirements, not actual overdrafts. A table provides the same data.</desc>
    ${ticks.join("")}${shaded}
    <line x1="74" x2="996" y1="${y(0)}" y2="${y(0)}" class="chart-zero"/>
    <line x1="74" x2="996" y1="${y(floorCents)}" y2="${y(floorCents)}" class="chart-floor"/>
    <text x="80" y="${y(floorCents) - 8}" class="chart-floor-label">$12k reserved-cash floor</text>
    <path d="${line(baseline.daily, "availableCents")}" class="chart-baseline"/>
    <path d="${line(points, "availableCents")}" class="chart-cash"/>
    <path d="${line(points, "troughAvailableCents")}" class="chart-trough"/>
    ${floorMarker}
    <line x1="${x(point.day)}" x2="${x(point.day)}" y1="24" y2="268" class="chart-cursor"/>
    <circle cx="${x(point.day)}" cy="${y(point.troughAvailableCents)}" r="5" class="chart-inspect"/>
    ${labels}
  </svg>`;
}
