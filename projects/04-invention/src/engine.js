(function (root) {
  "use strict";

  const METHODS = Object.freeze([
    "input-first-fit", "dominant-first-fit", "volume-first-fit",
    "dual-best-fit", "beam-128", "bounded-exact"
  ]);
  const ascii = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const requireThat = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const positive = (n) => Number.isSafeInteger(n) && n > 0;

  function validateCapacity(capacity) {
    for (const key of [
      "volume_units", "weight_units", "max_items_per_scenario",
      "exact_item_limit", "exact_node_limit"
    ]) requireThat(positive(capacity[key]), `Invalid capacity field: ${key}`);
    requireThat(capacity.max_items_per_scenario <= 60, "Scenario limit exceeds 60");
    requireThat(capacity.exact_item_limit <= 12, "Exact item limit exceeds 12");
    requireThat(capacity.exact_node_limit <= 50000, "Exact node limit exceeds 50000");
  }

  function csvRows(text) {
    requireThat(typeof text === "string", "CSV must be text");
    requireThat(new TextEncoder().encode(text).length <= 1048576, "CSV exceeds 1 MiB");
    const rows = [];
    let row = [], field = "", quoted = false, closed = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
        else if (c === '"') { quoted = false; closed = true; }
        else field += c;
      } else if (c === "," || c === "\n" || c === "\r") {
        row.push(field); field = ""; closed = false;
        if (c !== ",") {
          rows.push(row); row = [];
          if (c === "\r" && text[i + 1] === "\n") i += 1;
        }
      } else if (c === '"' && field === "" && !closed) {
        quoted = true;
      } else {
        requireThat(c !== '"' && !closed, "Malformed CSV quoting");
        field += c;
      }
    }
    requireThat(!quoted, "Unclosed CSV quote");
    if (field !== "" || row.length || closed) rows.push([...row, field]);
    requireThat(rows.length > 1 && rows.length <= 1001, "CSV needs 1..1000 data rows");
    return rows;
  }

  function parseDataset(text, capacity) {
    validateCapacity(capacity);
    const rows = csvRows(text);
    const header = [
      "classification", "scenario", "sku", "count",
      "volume-units", "weight-units", "shape-note"
    ];
    requireThat(JSON.stringify(rows[0]) === JSON.stringify(header), "Unexpected CSV header");
    const scenarios = new Map();
    for (const [index, fields] of rows.slice(1).entries()) {
      requireThat(fields.length === header.length, `Wrong field count at row ${index + 2}`);
      const [classification, scenario, sku, countText, volumeText, weightText, shapeNote] = fields;
      requireThat(classification === "SYNTHETIC", "Only SYNTHETIC inputs are supported");
      requireThat(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scenario), "Invalid scenario key");
      requireThat(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sku), "Invalid SKU key");
      requireThat(shapeNote.trim() !== "", "Missing shape assumption");
      for (const value of [countText, volumeText, weightText]) {
        requireThat(/^[1-9][0-9]*$/.test(value) && positive(Number(value)), "Expected positive integer");
      }
      const [count, volume, weight] = [countText, volumeText, weightText].map(Number);
      requireThat(count <= 20, "Row count exceeds 20");
      requireThat(volume <= capacity.volume_units && weight <= capacity.weight_units, "Oversized item");
      if (!scenarios.has(scenario)) scenarios.set(scenario, { id: scenario, items: [], rows: 0, skus: new Set() });
      const group = scenarios.get(scenario);
      requireThat(!group.skus.has(sku), `Duplicate SKU in ${scenario}`);
      group.skus.add(sku); group.rows += 1;
      for (let instance = 1; instance <= count; instance += 1) {
        group.items.push({
          id: `${sku}-${String(instance).padStart(2, "0")}`,
          sku, scenario, volume, weight, shapeNote
        });
      }
      requireThat(group.items.length <= capacity.max_items_per_scenario, "Expanded scenario too large");
    }
    return [...scenarios.values()].map(({ id, items, rows: rowCount }) => ({
      id, rowCount, items, ...validateItems(items, capacity)
    }));
  }

  function validateItems(items, capacity) {
    validateCapacity(capacity);
    requireThat(Array.isArray(items) && items.length <= capacity.max_items_per_scenario, "Invalid item array size");
    const ids = new Set();
    let volume = 0, weight = 0;
    const scenario = items[0]?.scenario;
    for (const item of items) {
      requireThat(typeof item.id === "string" && item.id.length > 0 && !ids.has(item.id), "Duplicate or blank item ID");
      requireThat(item.scenario === scenario, "Items cross scenario boundaries");
      requireThat(positive(item.volume) && positive(item.weight), "Item loads must be positive integers");
      requireThat(item.volume <= capacity.volume_units && item.weight <= capacity.weight_units, "Oversized item");
      ids.add(item.id); volume += item.volume; weight += item.weight;
    }
    requireThat(Number.isSafeInteger(volume) && Number.isSafeInteger(weight), "Total load exceeds exact integer range");
    return {
      itemCount: items.length, totalVolume: volume, totalWeight: weight,
      lowerBound: Math.max(Math.ceil(volume / capacity.volume_units), Math.ceil(weight / capacity.weight_units))
    };
  }

  function verifyAssignments(items, bins, capacity) {
    validateItems(items, capacity);
    const lookup = new Map(items.map((item) => [item.id, item]));
    const seen = new Set(), errors = [];
    let assignedItems = 0;
    for (const [index, bin] of bins.entries()) {
      let volume = 0, weight = 0;
      if (!Array.isArray(bin.itemIds) || bin.itemIds.length === 0) {
        errors.push(`Empty or malformed tote ${index + 1}`); continue;
      }
      for (const id of bin.itemIds) {
        assignedItems += 1;
        if (seen.has(id)) errors.push(`Duplicate assignment: ${id}`);
        seen.add(id);
        const item = lookup.get(id);
        if (!item) { errors.push(`Unknown item: ${id}`); continue; }
        volume += item.volume; weight += item.weight;
      }
      if (volume > capacity.volume_units) errors.push(`Volume overflow: tote ${index + 1}`);
      if (weight > capacity.weight_units) errors.push(`Weight overflow: tote ${index + 1}`);
      if (volume !== bin.volume || weight !== bin.weight) errors.push(`Declared load mismatch: tote ${index + 1}`);
      if (bin.remainingVolume !== undefined && bin.remainingVolume !== capacity.volume_units - volume) {
        errors.push(`Volume slack mismatch: tote ${index + 1}`);
      }
      if (bin.remainingWeight !== undefined && bin.remainingWeight !== capacity.weight_units - weight) {
        errors.push(`Weight slack mismatch: tote ${index + 1}`);
      }
    }
    for (const item of items) if (!seen.has(item.id)) errors.push(`Missing item: ${item.id}`);
    return { valid: errors.length === 0, expectedItems: items.length, assignedItems, totesChecked: bins.length, errors };
  }

  const fits = (bin, item, cap) =>
    bin.volume + item.volume <= cap.volume_units && bin.weight + item.weight <= cap.weight_units;
  const emptyBin = () => ({ itemIds: [], volume: 0, weight: 0 });
  const copyBins = (bins) => bins.map((bin) => ({ ...bin, itemIds: [...bin.itemIds] }));
  const addItem = (bin, item) => {
    bin.itemIds.push(item.id); bin.volume += item.volume; bin.weight += item.weight;
  };
  const compareNumber = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const scaledLoads = (volume, weight, cap) => [
    BigInt(volume) * BigInt(cap.weight_units), BigInt(weight) * BigInt(cap.volume_units)
  ];
  const dominant = (item, cap) => {
    const [v, w] = scaledLoads(item.volume, item.weight, cap);
    return v > w ? v : w;
  };
  const totalFraction = (item, cap) => {
    const [v, w] = scaledLoads(item.volume, item.weight, cap);
    return v + w;
  };
  const squaredScore = (volume, weight, cap) => {
    const [v, w] = scaledLoads(volume, weight, cap);
    return v * v + w * w;
  };

  function orderedItems(items, method, cap) {
    const order = [...items];
    if (["dominant-first-fit", "dual-best-fit", "bounded-exact"].includes(method)) {
      order.sort((a, b) => compareNumber(dominant(b, cap), dominant(a, cap)) ||
        compareNumber(totalFraction(b, cap), totalFraction(a, cap)) || ascii(a.id, b.id));
    } else if (method === "volume-first-fit") {
      order.sort((a, b) => b.volume - a.volume || b.weight - a.weight || ascii(a.id, b.id));
    }
    return order;
  }

  function greedy(items, method, cap) {
    const bins = [], insertions = [];
    const order = orderedItems(items, method, cap);
    let feasibilityChecks = 0;
    for (const item of order) {
      let chosen = -1, score = null;
      for (const [index, bin] of bins.entries()) {
        feasibilityChecks += 1;
        if (!fits(bin, item, cap)) continue;
        if (method !== "dual-best-fit") { chosen = index; break; }
        const residual = squaredScore(cap.volume_units - bin.volume - item.volume, cap.weight_units - bin.weight - item.weight, cap);
        if (score === null || residual < score) { score = residual; chosen = index; }
      }
      const opened = chosen === -1;
      if (opened) { chosen = bins.length; bins.push(emptyBin()); }
      addItem(bins[chosen], item);
      insertions.push({
        itemId: item.id, tote: chosen + 1, opened,
        volumeAfter: bins[chosen].volume, weightAfter: bins[chosen].weight,
        residualScoreNumerator: method === "dual-best-fit" && !opened ? score.toString() : null
      });
    }
    return { bins, order, trace: { kind: "greedy-insertions", feasibilityChecks, insertions } };
  }

  function beamState(bins, cap) {
    const loads = bins.map((bin) => [bin.volume, bin.weight])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return {
      bins,
      loadKey: loads.map((pair) => pair.join(":")).join("|"),
      assignmentKey: bins.map((bin) => bin.itemIds.join(",")).join("|"),
      density: bins.reduce((sum, bin) => sum + squaredScore(bin.volume, bin.weight, cap), 0n)
    };
  }

  const rankBeam = (a, b) => a.bins.length - b.bins.length || compareNumber(b.density, a.density) ||
    ascii(a.loadKey, b.loadKey) || ascii(a.assignmentKey, b.assignmentKey);

  function beam(items, cap, width) {
    requireThat(positive(width) && width <= 4096, "Invalid beam width");
    const incumbent = greedy(items, "input-first-fit", cap);
    let frontier = [beamState([], cap)];
    const layers = [];
    for (const [depth, item] of items.entries()) {
      const unique = new Map();
      let generated = 0;
      for (const state of frontier) {
        for (let target = 0; target <= state.bins.length; target += 1) {
          if (target < state.bins.length && !fits(state.bins[target], item, cap)) continue;
          const bins = copyBins(state.bins);
          if (target === bins.length) bins.push(emptyBin());
          addItem(bins[target], item);
          const next = beamState(bins, cap), previous = unique.get(next.loadKey);
          generated += 1;
          if (!previous || rankBeam(next, previous) < 0) unique.set(next.loadKey, next);
        }
      }
      const ranked = [...unique.values()].sort(rankBeam);
      layers.push({
        depth: depth + 1, itemId: item.id, parents: frontier.length, generated,
        unique: ranked.length, equivalentMerged: generated - ranked.length,
        kept: Math.min(width, ranked.length), discarded: Math.max(0, ranked.length - width),
        bestPartialBinCount: ranked[0].bins.length
      });
      frontier = ranked.slice(0, width);
    }
    const raw = frontier[0].bins;
    const fallbackUsed = raw.length > incumbent.bins.length;
    return {
      bins: fallbackUsed ? incumbent.bins : raw, order: [...items],
      trace: {
        kind: "bounded-beam", width, layers, rawBeamCount: raw.length,
        incumbentCount: incumbent.bins.length, fallbackUsed,
        discardedStates: layers.reduce((sum, layer) => sum + layer.discarded, 0),
        generatedStates: layers.reduce((sum, layer) => sum + layer.generated, 0)
      }
    };
  }

  function exact(items, cap, itemLimit, nodeLimit, lowerBound) {
    requireThat(positive(itemLimit) && itemLimit <= cap.exact_item_limit, "Invalid exact item budget");
    requireThat(positive(nodeLimit) && nodeLimit <= cap.exact_node_limit, "Invalid exact node budget");
    const incumbent = greedy(items, "input-first-fit", cap);
    let best = copyBins(incumbent.bins), nodes = 0, hitLimit = false;
    const order = orderedItems(items, "bounded-exact", cap);
    const levels = Array.from({ length: items.length + 1 }, (_, depth) => ({
      depth, visited: 0, aggregatePruned: 0, capacityRejected: 0, symmetrySkipped: 0, newBinPruned: 0
    }));
    const improvements = [];
    const trace = {
      kind: "bounded-depth-first", itemLimit, nodeLimit, incumbentCount: best.length,
      incumbentOrder: items.map((item) => item.id),
      searchOrder: order.map((item) => item.id), nodes: 0, status: "", levels, improvements
    };
    if (best.length === lowerBound) trace.status = "bound-equality";
    else if (items.length > itemLimit) trace.status = "skipped-item-limit";
    else {
      const suffix = Array.from({ length: items.length + 1 }, () => ({ volume: 0, weight: 0 }));
      for (let i = order.length - 1; i >= 0; i -= 1) {
        suffix[i] = { volume: suffix[i + 1].volume + order[i].volume, weight: suffix[i + 1].weight + order[i].weight };
      }
      function visit(depth, bins) {
        if (best.length === lowerBound || hitLimit) return;
        if (nodes >= nodeLimit) { hitLimit = true; return; }
        nodes += 1; levels[depth].visited += 1;
        if (depth === order.length) {
          if (bins.length < best.length) {
            best = copyBins(bins);
            improvements.push({ atNode: nodes, count: best.length, itemIds: best.map((bin) => [...bin.itemIds]) });
          }
          return;
        }
        const freeV = bins.reduce((sum, bin) => sum + cap.volume_units - bin.volume, 0);
        const freeW = bins.reduce((sum, bin) => sum + cap.weight_units - bin.weight, 0);
        const extra = Math.max(
          Math.ceil(Math.max(0, suffix[depth].volume - freeV) / cap.volume_units),
          Math.ceil(Math.max(0, suffix[depth].weight - freeW) / cap.weight_units)
        );
        if (bins.length + extra >= best.length) { levels[depth].aggregatePruned += 1; return; }
        const item = order[depth], seenLoads = new Set();
        for (const bin of bins) {
          if (hitLimit || best.length === lowerBound) return;
          const loadKey = `${bin.volume}:${bin.weight}`;
          if (seenLoads.has(loadKey)) { levels[depth].symmetrySkipped += 1; continue; }
          seenLoads.add(loadKey);
          if (!fits(bin, item, cap)) { levels[depth].capacityRejected += 1; continue; }
          addItem(bin, item);
          visit(depth + 1, bins);
          bin.itemIds.pop(); bin.volume -= item.volume; bin.weight -= item.weight;
        }
        if (hitLimit || best.length === lowerBound) return;
        if (bins.length + 1 < best.length) {
          const bin = emptyBin(); addItem(bin, item); bins.push(bin);
          visit(depth + 1, bins); bins.pop();
        } else levels[depth].newBinPruned += 1;
      }
      visit(0, []);
      trace.status = best.length === lowerBound ? "bound-reached" : hitLimit ? "node-limit" : "exhausted";
      trace.nodes = nodes;
    }
    return { bins: best, order: trace.nodes ? order : [...items], trace };
  }

  function pack(items, capacity, method, options = {}) {
    requireThat(METHODS.includes(method), `Unknown method: ${method}`);
    const audit = validateItems(items, capacity);
    let packed;
    if (method === "beam-128") packed = beam(items, capacity, options.beamWidth ?? 128);
    else if (method === "bounded-exact") packed = exact(
      items, capacity, options.exactItemLimit ?? capacity.exact_item_limit,
      options.exactNodeLimit ?? capacity.exact_node_limit, audit.lowerBound
    );
    else packed = greedy(items, method, capacity);
    const bins = packed.bins.map((bin, index) => ({
      id: `T${String(index + 1).padStart(2, "0")}`, itemIds: [...bin.itemIds],
      volume: bin.volume, weight: bin.weight,
      remainingVolume: capacity.volume_units - bin.volume,
      remainingWeight: capacity.weight_units - bin.weight
    }));
    const validation = verifyAssignments(items, bins, capacity);
    requireThat(validation.valid, `Invalid packing: ${validation.errors.join("; ")}`);
    const boundEquality = bins.length === audit.lowerBound;
    const exhaustive = method === "bounded-exact" && packed.trace.status === "exhausted";
    const proven = boundEquality || exhaustive;
    return {
      method, count: bins.length, incomingOrder: items.map((item) => item.id),
      processingOrder: packed.order.map((item) => item.id),
      lowerBound: audit.lowerBound, aggregateGap: bins.length - audit.lowerBound,
      bins, validation,
      proof: {
        status: proven ? "proven-model-optimum" : "bounded-unknown",
        method: boundEquality ? "aggregate-bound-equality" : exhaustive ? "exhaustive-search" : "none",
        aggregateLowerBound: audit.lowerBound, certifiedLowerBound: proven ? bins.length : audit.lowerBound,
        upperBound: bins.length, optimalBinCount: proven ? bins.length : null,
        searchStatus: packed.trace.status ?? (method === "beam-128" ? "bounded-beam" : "not-attempted"),
        scope: "Two-capacity scalar model only; not physical fit."
      },
      trace: packed.trace
    };
  }

  function scenarioSeed(masterSeed, scenario) {
    requireThat(Number.isInteger(masterSeed) && masterSeed > 0 && masterSeed <= 0xffffffff, "Invalid seed");
    let hash = 2166136261;
    for (const character of scenario) {
      requireThat(character.charCodeAt(0) <= 127, "Seeded scenario IDs must be ASCII");
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    }
    return (masterSeed ^ hash) >>> 0 || 1;
  }

  function randomStream(seed) {
    requireThat(Number.isInteger(seed) && seed > 0 && seed <= 0xffffffff, "Invalid PRNG state");
    let state = seed >>> 0;
    const next = () => {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      state >>>= 0; return state;
    };
    return {
      next, state: () => state,
      bounded: (bound) => {
        requireThat(positive(bound) && bound <= 0x100000000, "Invalid random bound");
        const limit = 0x100000000 - (0x100000000 % bound);
        let value;
        do { value = next(); } while (value >= limit);
        return value % bound;
      }
    };
  }

  function trialOrders(items, scenario, seed, repetitions) {
    requireThat(positive(repetitions) && repetitions <= 1000, "Invalid repetition count");
    const stream = randomStream(scenarioSeed(seed, scenario)), trials = [];
    for (let trial = 1; trial <= repetitions; trial += 1) {
      const order = [...items], stateBefore = stream.state();
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = stream.bounded(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      trials.push({ trial, stateBefore, stateAfter: stream.state(), itemIds: order.map((item) => item.id) });
    }
    return trials;
  }

  root.PackingLab = Object.freeze({
    METHODS, parseDataset, validateItems, verifyAssignments, pack, orderedItems, scenarioSeed, randomStream, trialOrders
  });
})(globalThis);
