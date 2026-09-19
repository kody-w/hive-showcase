import { validateAgenda, AGENDA_SCHEMA, ENGINE_VERSION } from "./engine.mjs";

export function formatMinute(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1440) return "—";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function parseMinute(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value.trim()))
    throw new TypeError(`Use HH:MM between 00:00 and 24:00, not "${value}".`);
  const [hour, minute] = value.trim().split(":").map(Number);
  return hour * 60 + minute;
}

export function formatWindows(windows) {
  return windows.map(([start, end]) => `${formatMinute(start)}–${formatMinute(end)}`).join(", ");
}

export function parseWindows(value) {
  if (!value.trim()) return [];
  return value.split(",").map(part => {
    const pair = part.trim().split(/\s*[-–]\s*/);
    if (pair.length !== 2) throw new TypeError("Use availability like 09:00–10:00, 10:30–11:00.");
    return pair.map(parseMinute);
  });
}

export function parseImport(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > 65536)
    return { ok: false, message: "Choose a JSON file no larger than 64 KiB." };
  let data;
  try { data = JSON.parse(text); }
  catch { return { ok: false, message: "That file is not valid JSON. The current editor has not changed." }; }
  if (data?.schema === "agenda-planner-export/1") data = data.agenda;
  const validation = validateAgenda(data);
  if (validation.status !== "valid") return {
    ok: false, status: validation.status,
    message: validation.issues.map(item => `${item.path}: ${item.message}`).join("\n"),
  };
  return { ok: true, agenda: validation.agenda };
}

export function createExport(agenda, analysis) {
  const validation = validateAgenda(agenda);
  if (validation.status !== "valid") throw new TypeError("Export requires a valid supported input, not malformed editor text.");
  if (analysis && JSON.stringify(validation.agenda) !== JSON.stringify(analysis.agenda))
    throw new RangeError("Stale analysis cannot be exported with a changed agenda.");
  return {
    schema: "agenda-planner-export/1", engineVersion: ENGINE_VERSION,
    agendaSchema: AGENDA_SCHEMA,
    content: analysis ? "current-analysis" : "input-only",
    status: analysis?.feasibility.status ?? "not-assessed",
    agenda: validation.agenda, analysis: analysis ?? null,
    notice: "Local model output, not a calendar booking, user study, or public launch. A repair changes explicit time budgets only after approval.",
  };
}

export function timelineSegments(agenda, schedule) {
  const segments = [];
  let cursor = agenda.day.start;
  const ordered = [...schedule].sort((a, b) => a.start - b.start);
  const appendGap = end => {
    const cuts = new Set([cursor, end]);
    for (const [start, stop] of agenda.day.availability) {
      if (cursor < start && start < end) cuts.add(start);
      if (cursor < stop && stop < end) cuts.add(stop);
    }
    const points = [...cuts].sort((a, b) => a - b);
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1];
      const stop = points[index];
      if (start === stop) continue;
      const available = agenda.day.availability.some(([left, right]) => left <= start && stop <= right);
      segments.push({ type: available ? "slack" : "unavailable", start, end: stop });
    }
  };
  for (const entry of ordered) {
    appendGap(entry.start);
    segments.push({ type: "task", ...entry });
    cursor = entry.end;
  }
  appendGap(agenda.day.end);
  return segments;
}
