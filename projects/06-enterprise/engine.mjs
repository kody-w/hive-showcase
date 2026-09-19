const insist = (condition, message) => {
  if (!condition) throw new Error(message);
};
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const integer = (value, minimum) => Number.isSafeInteger(value) && value >= minimum;
const clone = (value) => structuredClone(value);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function distribution(values) {
  insist(values.every((value) => Number.isFinite(value) && value >= 0), 'Metrics require nonnegative finite values');
  if (!values.length) return { count: 0, min: 0, p50: 0, p95: 0, max: 0, mean: 0, sum: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length, min: sorted[0],
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1), mean: sum / sorted.length, sum,
  };
}

function peak(intervals) {
  const points = intervals.filter(([start, end]) => end > start).flatMap(([start, end]) => [[start, 1], [end, -1]]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let value = 0, maximum = 0;
  for (const [, change] of points) {
    value += change;
    maximum = Math.max(maximum, value);
  }
  return maximum;
}

export function calculateMetrics(cases, resources) {
  insist(cases.every((item) => item.completedAt !== null && Number.isFinite(item.completedAt)), 'Metrics cannot silently omit unfinished cases');
  const firstArrival = cases.length ? Math.min(...cases.map((item) => item.arrival)) : 0;
  const lastDisposition = cases.length ? Math.max(...cases.map((item) => item.completedAt)) : 0;
  const durationMinutes = lastDisposition - firstArrival;
  const allVisits = cases.flatMap((item) => item.history);
  const resourceMetrics = resources.map((resource) => {
    const visits = allVisits.filter((visit) => visit.resource === resource.id);
    const busyMinutes = visits.reduce((sum, visit) => sum + visit.endedAt - visit.startedAt, 0);
    return {
      ...resource, visits: visits.length, busyMinutes,
      utilization: durationMinutes ? busyMinutes / (resource.capacity * durationMinutes) : 0,
      waitMinutes: visits.reduce((sum, visit) => sum + visit.startedAt - visit.queuedAt, 0),
      maxBusy: peak(visits.map((visit) => [visit.startedAt, visit.endedAt])),
      maxQueue: peak(visits.map((visit) => [visit.queuedAt, visit.startedAt])),
    };
  });
  const bottleneck = [...resourceMetrics].sort((a, b) => b.waitMinutes - a.waitMinutes || compareText(a.id, b.id))[0];
  const casesReworked = cases.filter((item) => item.history.some((visit) => visit.kind === 'recheck')).length;
  const sourceCategories = {};
  for (const item of cases) {
    const state = item.source?.state ?? 'modeled-disposition';
    sourceCategories[state] = (sourceCategories[state] ?? 0) + 1;
  }
  return {
    submitted: cases.length, disposed: cases.length, inSystem: 0, dropped: 0,
    firstArrival, lastDisposition, durationMinutes,
    throughputPerHour: durationMinutes ? cases.length * 60 / durationMinutes : 0,
    wait: distribution(cases.map((item) => item.history.reduce((sum, visit) => sum + visit.startedAt - visit.queuedAt, 0))),
    cycle: distribution(cases.map((item) => item.completedAt - item.arrival)),
    cleanCycle: distribution(cases.filter((item) => item.source?.state === 'ready-for-human-approval').map((item) => item.completedAt - item.arrival)),
    rework: {
      cases: casesReworked,
      visits: allVisits.filter((visit) => visit.kind === 'recheck').length,
      caseRate: cases.length ? casesReworked / cases.length : 0,
    },
    sourceCategories,
    approved: 0,
    resources: resourceMetrics,
    bottleneck: bottleneck?.waitMinutes > 0 ? bottleneck.id : null,
  };
}

export function simulate(plan) {
  insist(Array.isArray(plan?.resources) && Array.isArray(plan?.cases), 'A plan needs resources and cases');
  const resources = clone(plan.resources).sort((a, b) => compareText(a.id, b.id));
  const resourceIndex = new Map();
  for (const resource of resources) {
    insist(typeof resource.id === 'string' && resource.id && !resourceIndex.has(resource.id), 'Duplicate or missing resource ID');
    insist(integer(resource.capacity, 1), `Invalid capacity: ${resource.id}`);
    resourceIndex.set(resource.id, { ...resource, queue: [], active: new Map() });
  }
  const caseIndex = new Map();
  const orderedInput = clone(plan.cases).sort((a, b) => a.arrival - b.arrival || compareText(a.id, b.id));
  for (const item of orderedInput) {
    insist(typeof item.id === 'string' && item.id && !caseIndex.has(item.id), 'Duplicate or missing case ID');
    insist(integer(item.arrival, 0), `Invalid arrival: ${item.id}`);
    insist(Array.isArray(item.route) && item.route.length > 0, `Case has no route: ${item.id}`);
    for (const task of item.route) {
      insist(resourceIndex.has(task.resource), `Unknown resource: ${task.resource}`);
      insist(integer(task.duration, 1), `Invalid service duration: ${item.id}`);
      insist(typeof task.reason === 'string' && task.reason.length > 0, `Task needs a waiting reason: ${item.id}`);
    }
    caseIndex.set(item.id, { ...item, history: [], completedAt: null, next: 0 });
  }
  let scheduleOrder = 0, queueOrder = 0;
  const future = orderedInput.map((item) => ({ time: item.arrival, kind: 'arrival', caseId: item.id, order: scheduleOrder++ }));
  const events = [];
  const log = (time, type, item, details = {}) => events.push({ sequence: events.length, time, type, caseId: item.id, ...details });
  const enqueue = (item, time) => {
    const task = item.route[item.next];
    const resource = resourceIndex.get(task.resource);
    const visit = {
      ...task, caseId: item.id, index: item.next,
      queuedAt: time, queueOrder: queueOrder++, startedAt: null, endedAt: null, slot: null,
      waitCause: `FIFO at ${resource.label ?? resource.id}; ${resource.capacity} service slot(s), no preemption. ${task.reason}`,
    };
    item.history.push(visit);
    resource.queue.push(visit);
    log(time, 'queued', item, { resource: task.resource, visit: item.next, reason: task.reason });
  };

  while (future.length) {
    future.sort((a, b) => a.time - b.time || (a.kind === 'finish' ? 0 : 1) - (b.kind === 'finish' ? 0 : 1) || a.order - b.order);
    const time = future[0].time;
    const batch = [];
    while (future[0]?.time === time) batch.push(future.shift());
    // All completions (in scheduling order) and then arrivals are visible before FIFO dispatch.
    for (const event of batch) {
      const item = caseIndex.get(event.caseId);
      if (event.kind === 'arrival') {
        log(time, 'arrived', item);
        enqueue(item, time);
      } else {
        const visit = item.history[event.visit];
        const resource = resourceIndex.get(visit.resource);
        insist(resource.active.get(visit.slot) === visit, 'Resource ownership invariant failed');
        resource.active.delete(visit.slot);
        log(time, 'finished', item, { resource: visit.resource, visit: visit.index });
        item.next += 1;
        if (item.next === item.route.length) {
          item.completedAt = time;
          log(time, 'disposed', item, { outcome: item.source?.state ?? 'modeled-disposition', approved: false });
        } else enqueue(item, time);
      }
    }
    for (const resource of resourceIndex.values()) {
      while (resource.queue.length && resource.active.size < resource.capacity) {
        const visit = resource.queue.shift();
        let slot = 0;
        while (resource.active.has(slot)) slot += 1;
        visit.slot = slot;
        visit.startedAt = time;
        visit.endedAt = time + visit.duration;
        insist(Number.isSafeInteger(visit.endedAt), 'Clock exceeds exact integer range');
        resource.active.set(slot, visit);
        const item = caseIndex.get(visit.caseId);
        log(time, 'started', item, { resource: visit.resource, visit: visit.index, slot, waitMinutes: time - visit.queuedAt });
        future.push({ time: visit.endedAt, kind: 'finish', caseId: item.id, visit: visit.index, order: scheduleOrder++ });
      }
    }
  }
  const cases = [...caseIndex.values()].sort((a, b) => compareText(a.id, b.id)).map((item) => {
    insist(item.completedAt !== null && item.history.length === item.route.length, `Unfinished case: ${item.id}`);
    const { route, next, ...result } = item;
    return {
      ...result,
      waitMinutes: item.history.reduce((sum, visit) => sum + visit.startedAt - visit.queuedAt, 0),
      cycleMinutes: item.completedAt - item.arrival,
      serviceMinutes: item.history.reduce((sum, visit) => sum + visit.duration, 0),
    };
  });
  insist([...resourceIndex.values()].every((resource) => resource.queue.length === 0 && resource.active.size === 0), 'Work left in resource queues');
  const metrics = calculateMetrics(cases, resources);
  insist(metrics.resources.every((resource) => resource.maxBusy <= resource.capacity), 'Capacity invariant failed');
  return { resources, cases, events, eventTimes: [...new Set([0, ...events.map((event) => event.time)])].sort((a, b) => a - b), metrics };
}

export function snapshot(result, time) {
  insist(Number.isFinite(time) && time >= 0, 'Replay clock must be nonnegative and finite');
  const until = Math.min(time, result.metrics.lastDisposition);
  const elapsed = Math.max(0, until - result.metrics.firstArrival);
  const cases = result.cases.map((item) => {
    if (time < item.arrival) return { id: item.id, status: 'not-arrived', source: item.source };
    if (time >= item.completedAt) return { id: item.id, status: 'disposed', source: item.source, completedAt: item.completedAt };
    const visit = item.history.find((entry) => entry.queuedAt <= time && time < entry.endedAt);
    insist(visit, `Case vanished at t=${time}: ${item.id}`);
    return { id: item.id, source: item.source, status: time < visit.startedAt ? 'waiting' : 'serving', visit };
  });
  const overlap = (start, end) => Math.max(0, Math.min(until, end) - start);
  const resources = result.resources.map((resource) => {
    const visits = result.cases.flatMap((item) => item.history).filter((visit) => visit.resource === resource.id);
    const busyMinutes = visits.reduce((sum, visit) => sum + overlap(visit.startedAt, visit.endedAt), 0);
    return {
      ...resource,
      active: cases.filter((item) => item.status === 'serving' && item.visit.resource === resource.id).sort((a, b) => a.visit.slot - b.visit.slot),
      queue: cases.filter((item) => item.status === 'waiting' && item.visit.resource === resource.id).sort((a, b) => a.visit.queueOrder - b.visit.queueOrder),
      busyMinutes, utilization: elapsed ? busyMinutes / (resource.capacity * elapsed) : 0,
      waitMinutes: visits.reduce((sum, visit) => sum + overlap(visit.queuedAt, visit.startedAt), 0),
    };
  });
  const counts = { submitted: cases.length, notArrived: 0, waiting: 0, serving: 0, disposed: 0 };
  for (const item of cases) counts[item.status === 'not-arrived' ? 'notArrived' : item.status] += 1;
  return { time, until, cases, resources, counts };
}
