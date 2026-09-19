const libraryPreset = {
  schema: "agenda-planner/1",
  title: "Library kit • every topic committed",
  classification: "synthetic",
  day: { start: 540, end: 600, stepMinutes: 1, availability: [[540, 630]] },
  tasks: [
    { id: "welcome", label: "Confirm the decision to make", duration: 5, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "stock-review", label: "Review fictional kit stock", duration: 10, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "decision", label: "Choose the sample kit scope", duration: 20, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "template-demo", label: "Optional template demonstration", duration: 15, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "risk-check", label: "Check assumptions and open questions", duration: 10, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "roundup", label: "Collect optional follow-up ideas", duration: 8, availability: [[540, 630]], dependsOn: [], fixedStart: null, kind: "task" },
    { id: "wrap", label: "Wrap & next steps", duration: 5, availability: [[540, 630]], dependsOn: ["welcome", "stock-review", "decision", "template-demo", "risk-check", "roundup"], fixedStart: null, kind: "break" },
  ],
  repairs: { latestEnd: 630, durationFloors: { "template-demo": 2 } },
};

const arcadePreset = {
  schema: "agenda-planner/1",
  title: "Pocket Arcade tournament",
  classification: "synthetic",
  day: { start: 840, end: 915, stepMinutes: 5, availability: [[840, 930]] },
  tasks: [
    { id: "check-in", label: "Player check-in & rules", duration: 10, availability: [[840, 850]], dependsOn: [], fixedStart: 840, kind: "event" },
    { id: "round-one", label: "Pocket Arcade • qualifying round", duration: 20, availability: [[850, 930]], dependsOn: ["check-in"], fixedStart: null, kind: "task" },
    { id: "break-one", label: "Screen break & score check", duration: 5, availability: [[850, 930]], dependsOn: ["round-one"], fixedStart: null, kind: "break" },
    { id: "round-two", label: "Pocket Arcade • semifinal", duration: 20, availability: [[850, 930]], dependsOn: ["break-one"], fixedStart: null, kind: "task" },
    { id: "break-two", label: "Reset & rest", duration: 5, availability: [[850, 930]], dependsOn: ["round-two"], fixedStart: null, kind: "break" },
    { id: "final", label: "Pocket Arcade • final", duration: 20, availability: [[850, 930]], dependsOn: ["break-two"], fixedStart: null, kind: "task" },
    { id: "results", label: "Results & thank-you", duration: 5, availability: [[850, 930]], dependsOn: ["final"], fixedStart: null, kind: "task" },
  ],
  repairs: { latestEnd: 930, durationFloors: { "round-one": 10, "round-two": 10, final: 10 } },
};

const splitPreset = {
  schema: "agenda-planner/1",
  title: "Enough minutes, nowhere to put them",
  classification: "synthetic",
  day: { start: 540, end: 600, stepMinutes: 5, availability: [[540, 555], [575, 600]] },
  tasks: [
    { id: "deep-work", label: "One uninterrupted design session", duration: 30, availability: [[540, 600]], dependsOn: [], fixedStart: null, kind: "task" },
  ],
  repairs: { latestEnd: 600, durationFloors: { "deep-work": 25 } },
};

const boundaryPreset = {
  schema: "agenda-planner/1",
  title: "An exact midnight finish",
  classification: "synthetic",
  day: { start: 1380, end: 1440, stepMinutes: 5, availability: [[1380, 1440]] },
  tasks: [
    { id: "setup", label: "Setup at 23:00", duration: 30, availability: [[1380, 1440]], dependsOn: [], fixedStart: 1380, kind: "event" },
    { id: "round", label: "Final round", duration: 25, availability: [[1380, 1440]], dependsOn: ["setup"], fixedStart: null, kind: "task" },
    { id: "close", label: "Close before midnight", duration: 5, availability: [[1380, 1440]], dependsOn: ["round"], fixedStart: null, kind: "break" },
  ],
  repairs: { latestEnd: 1440, durationFloors: {} },
};

export const PRESET_INFO = Object.freeze([
  { id: "library", title: "Library kit • overloaded", detail: "Adapted MIT seed data. All six topics are now mandatory, plus wrap. The after-10:00 availability and negotiation floor are new synthetic assumptions, not source facts. The old “optional” words are labels, not permission to omit." },
  { id: "arcade", title: "Pocket Arcade tournament", detail: "Federation demonstration only. Seven commitments, two preserved breaks, one fixed check-in. 85 minutes cannot fit a 75-minute cutoff. Venue availability through 15:30 and shorter round budgets are explicitly synthetic." },
  { id: "split", title: "Disjoint availability", detail: "40 available minutes do not contain a 30-minute contiguous window. Tasks cannot be split across unavailable time." },
  { id: "boundary", title: "Boundary-valid • midnight", detail: "Half-open intervals may meet at a boundary. The last task ends at 24:00; no minute is invented." },
]);

export function getPreset(id) {
  const sources = { library: libraryPreset, arcade: arcadePreset, split: splitPreset, boundary: boundaryPreset };
  if (!Object.hasOwn(sources, id)) throw new RangeError("Unknown preset.");
  return JSON.parse(JSON.stringify(sources[id]));
}
