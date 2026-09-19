/* A dependency-free global module: the browser and Node import this exact engine. */
(() => {
  "use strict";
  const WIDTH = 13;
  const HEIGHT = 9;
  const HOME = Object.freeze({ x: 1, y: 4 });
  const MAX_ENERGY = 24;
  const MAX_TICKS = 150;
  const MAX_ACTIONS = 512;
  const MAX_BATCH = 64;
  const MAX_STEP = 25;
  const names = ["Pip", "Ada", "Bop"];
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const atHome = (bot) => same(bot, HOME);
  const key = (point) => `${point.x},${point.y}`;

  const scenarios = Object.freeze({
    meadow: Object.freeze({
      name: "Open meadow",
      description: "Open paths. Learn to return before the battery runs out.",
      goal: 6,
      walls: [],
      patches: [
        { id: "north", name: "Moon clover", x: 7, y: 1 },
        { id: "east", name: "Sun pods", x: 8, y: 4 },
        { id: "south", name: "Bell moss", x: 7, y: 7 },
      ],
    }),
    switchback: Object.freeze({
      name: "Stone garden",
      description: "A stone wall asks for a detour. Teach a whole class.",
      goal: 12,
      walls: Array.from({ length: 5 }, (_, y) => ({ x: 4, y })),
      patches: [
        { id: "north", name: "Moon clover", x: 6, y: 2 },
        { id: "east", name: "Sun pods", x: 8, y: 4 },
        { id: "south", name: "Bell moss", x: 6, y: 7 },
      ],
    }),
    narrows: Object.freeze({
      name: "One little doorway",
      description: "One crossing, three robots. Sharing the path matters.",
      goal: 12,
      walls: Array.from({ length: 9 }, (_, y) => ({ x: 4, y })).filter((p) => p.y !== 5),
      patches: [
        { id: "north", name: "Moon clover", x: 6, y: 2 },
        { id: "east", name: "Sun pods", x: 8, y: 4 },
        { id: "south", name: "Bell moss", x: 6, y: 7 },
      ],
    }),
  });

  function fingerprint(value) {
    const text = JSON.stringify(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function validPoint(point, walls) {
    return point.x >= 0 && point.y >= 0 && point.x < WIDTH && point.y < HEIGHT &&
      !walls.some((wall) => same(point, wall));
  }

  function greedyNext(bot, target) {
    if (bot.y !== target.y) return { x: bot.x, y: bot.y + Math.sign(target.y - bot.y) };
    return { x: bot.x + Math.sign(target.x - bot.x), y: bot.y };
  }

  function shortestPath(start, target, walls) {
    if (same(start, target)) return [];
    const queue = [{ ...start, path: [] }];
    const visited = new Set([key(start)]);
    for (let index = 0; index < queue.length; index++) {
      const point = queue[index];
      for (const [dx, dy] of directions) {
        const next = { x: point.x + dx, y: point.y + dy };
        if (!validPoint(next, walls) || visited.has(key(next))) continue;
        const path = [...point.path, next];
        if (same(next, target)) return path;
        visited.add(key(next));
        queue.push({ ...next, path });
      }
    }
    return null;
  }

  function validateOptions(options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Options must be an object.");
    const result = { version: options.version ?? "v4", scenario: options.scenario ?? "switchback", seed: options.seed ?? 42 };
    if (!Object.hasOwn(globalThis.LittleSignalsBuilds ?? {}, result.version)) throw new RangeError("Unknown build version.");
    if (!Object.hasOwn(scenarios, result.scenario)) throw new RangeError("Unknown garden.");
    if (!Number.isInteger(result.seed) || result.seed < 0 || result.seed > 0xffffffff) throw new RangeError("Seed must be an unsigned 32-bit integer.");
    return result;
  }

  function validateAction(action) {
    if (!action || typeof action !== "object" || Array.isArray(action)) throw new TypeError("Action must be an object.");
    if (action.type === "tick") {
      const count = action.count ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > MAX_STEP) throw new RangeError(`A tick action takes 1–${MAX_STEP} beats.`);
      return { type: "tick", count };
    }
    if (!["teach", "rescue"].includes(action.type)) throw new RangeError("Unknown action.");
    if (!Number.isInteger(action.robot) || action.robot < 0 || action.robot > 2) throw new RangeError("Robot must be 0, 1, or 2.");
    if (action.type === "rescue") return { type: "rescue", robot: action.robot };
    const rules = {
      delivery: [true, false],
      safety: [true, false],
      focus: ["nearest", "north", "east", "south"],
      job: ["collect", "rest"],
    };
    if (!Object.hasOwn(rules, action.rule) || !rules[action.rule].includes(action.value)) throw new RangeError("Invalid lesson or value.");
    return { type: "teach", robot: action.robot, rule: action.rule, value: action.value };
  }

  function assertInvariants(state) {
    const fail = (message) => { throw new Error(`Invariant: ${message}`); };
    if (!Number.isInteger(state.tick) || state.tick < 0 || state.tick > MAX_TICKS) fail("bounded clock");
    if (state.actions > MAX_ACTIONS) fail("bounded actions");
    if (!["playing", "won", "lost"].includes(state.status)) fail("status");
    const occupied = new Set();
    for (const bot of state.robots) {
      if (!validPoint(bot, state.walls)) fail("robot on invalid tile");
      if (!Number.isInteger(bot.energy) || bot.energy < 0 || bot.energy > MAX_ENERGY) fail("energy bounds");
      if (![0, 1].includes(bot.cargo)) fail("single cargo");
      if (!atHome(bot) && occupied.has(key(bot))) fail("robot overlap");
      if (!atHome(bot)) occupied.add(key(bot));
    }
    if (state.patches.some((p) => !Number.isInteger(p.remaining) || p.remaining < 0 || p.remaining > p.initial)) fail("patch bounds");
    const remaining = state.patches.reduce((sum, p) => sum + p.remaining, 0);
    const carried = state.robots.reduce((sum, r) => sum + r.cargo, 0);
    if (remaining + carried + state.delivered + state.lostCargo !== state.initialPods) fail("pod conservation");
    if (state.metrics.harvested !== state.delivered + carried + state.lostCargo) fail("harvest accounting");
    if (state.rescueKits < 0 || state.rescueKits > 2) fail("rescue budget");
    if (state.status === "won" && state.delivered < state.goal) fail("win needs deliveries");
    return true;
  }

  function create(options = {}) {
    const settings = validateOptions(options);
    const build = globalThis.LittleSignalsBuilds[settings.version];
    const scenario = scenarios[settings.scenario];
    let random = settings.seed;
    const nextRandom = () => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random;
    };
    const patches = scenario.patches.map((patch) => {
      const initial = 5 + (nextRandom() % 3);
      return { ...patch, initial, remaining: initial };
    });
    const state = {
      schema: "little-signals-state/1",
      ...settings,
      tick: 0,
      limit: MAX_TICKS,
      actions: 0,
      status: "playing",
      reason: "",
      width: WIDTH,
      height: HEIGHT,
      home: { ...HOME },
      goal: scenario.goal,
      delivered: 0,
      lostCargo: 0,
      initialPods: patches.reduce((sum, p) => sum + p.initial, 0),
      rescueKits: 2,
      walls: clone(scenario.walls),
      patches,
      robots: names.map((name, id) => ({
        id, name, ...HOME, energy: MAX_ENERGY, cargo: 0,
        program: { delivery: false, safety: false, focus: "nearest", job: "collect" },
        mode: "Ready for a lesson", target: null, stranded: false,
        deliveries: 0, wait: 0,
      })),
      metrics: {
        moves: 0, harvested: 0, energySpent: 0, chargeTicks: 0,
        blockedMoves: 0, wallBumps: 0, trafficWaits: 0, deadlockTicks: 0,
        longestStall: 0, strandedEvents: 0, rescues: 0, lessons: 0,
        courtesyPasses: 0, idleTicks: 0,
      },
      events: ["Three curious robots. Teach them to bring the sun home."],
    };
    const entries = [];
    let stall = 0;
    const travel = (from, to) => build.pathfinding
      ? (shortestPath(from, to, state.walls)?.length ?? Infinity)
      : distance(from, to);

    function finish() {
      if (state.delivered >= state.goal) {
        state.status = "won";
        state.reason = "The nursery is glowing. Your little colony learned to share.";
      } else if (state.tick >= MAX_TICKS) {
        state.status = "lost";
        state.reason = "Sunset. The nursery needed more pods. Try a different lesson.";
      } else if (state.rescueKits === 0 && state.robots.every((r) => r.stranded)) {
        state.status = "lost";
        state.reason = "The class is out of power, and no rescue kits remain.";
      } else if (state.actions >= MAX_ACTIONS) {
        state.status = "lost";
        state.reason = "The 512-action practice budget is used. Start a fresh shift.";
      }
    }

    function choosePatch(bot) {
      const available = state.patches.filter((patch) => patch.remaining > 0);
      const preferred = available.find((patch) => patch.id === bot.program.focus);
      const reserved = build.courtesy ? available.find((patch) => patch.id === bot.target) : null;
      const cost = (patch) => travel(bot, patch) + (build.courtesy
        ? 12 * state.robots.filter((other) => other.id !== bot.id && other.target === patch.id &&
          other.cargo === 0 && other.program.job === "collect" && !other.stranded).length
        : 0);
      return preferred ?? reserved ?? available.sort((a, b) => cost(a) - cost(b) || a.id.localeCompare(b.id))[0];
    }

    function intent(bot) {
      if (atHome(bot)) {
        bot.stranded = false;
        if (bot.cargo && bot.program.delivery) {
          bot.cargo = 0;
          bot.deliveries++;
          state.delivered++;
          bot.mode = "Delivered a sun pod";
          bot.target = null;
          state.events.push(`${bot.name} planted pod ${state.delivered}.`);
          return null;
        }
        if (bot.program.safety && (build.energyPlanning ? bot.energy < MAX_ENERGY : bot.energy <= 3)) {
          bot.energy = Math.min(MAX_ENERGY, bot.energy + 6);
          state.metrics.chargeTicks++;
          bot.mode = "Recharging at the nursery";
          return null;
        }
      }
      if (bot.energy === 0) {
        if (!bot.stranded && !atHome(bot)) {
          state.metrics.strandedEvents++;
          state.events.push(`${bot.name} ran out of power. A rescue kit can bring them home.`);
        }
        bot.stranded = !atHome(bot);
        bot.mode = atHome(bot) ? "Teach recharge to wake me" : "Stranded · needs a rescue";
        return null;
      }
      let target;
      const reserve = build.energyPlanning ? travel(bot, HOME) + 2 : 3;
      if ((bot.program.safety && bot.energy <= reserve) || bot.program.job === "rest") {
        target = HOME;
        bot.mode = "Heading home to rest";
      } else if (bot.cargo) {
        if (!bot.program.delivery) {
          bot.mode = "Holding a pod · teach return";
          state.metrics.idleTicks++;
          return null;
        }
        target = HOME;
        bot.mode = "Bringing a pod home";
      } else {
        target = choosePatch(bot);
        bot.mode = target ? `Collecting · ${target.name}` : "No pods left";
        if (!target) return null;
        if (build.energyPlanning && bot.program.safety && bot.energy < travel(bot, target) + travel(target, HOME) + 3) {
          target = HOME;
          bot.mode = "Saving enough power for the return";
        }
      }
      bot.target = target.id ?? "home";
      if (same(bot, target)) {
        if (target === HOME) {
          bot.mode = "Resting at the nursery";
          state.metrics.idleTicks++;
        } else if (target.remaining > 0) {
          target.remaining--;
          bot.cargo = 1;
          bot.energy--;
          state.metrics.harvested++;
          state.metrics.energySpent++;
          bot.mode = "Picked up a sun pod";
          state.events.push(`${bot.name} picked up a pod.`);
        }
        return null;
      }
      return build.pathfinding ? (shortestPath(bot, target, state.walls)?.[0] ?? null) : greedyNext(bot, target);
    }

    function move(bot, next) {
      bot.x = next.x;
      bot.y = next.y;
      bot.energy--;
      bot.wait = 0;
      state.metrics.moves++;
      state.metrics.energySpent++;
    }

    function courteousMoves(intents) {
      const pending = new Set(state.robots.filter((bot) => intents[bot.id]).map((bot) => bot.id));
      const order = state.robots.map((_, index) => (index + state.tick) % 3);
      for (const bot of state.robots) if (!intents[bot.id]) bot.wait = 0;
      for (let pass = 0; pass < 3; pass++) {
        for (const id of order) {
          if (!pending.has(id)) continue;
          const bot = state.robots[id];
          const next = intents[id];
          if (validPoint(next, state.walls) && (same(next, HOME) || !state.robots.some((other) => other.id !== id && same(other, next)))) {
            move(bot, next);
            pending.delete(id);
          }
        }
      }
      // A reciprocal exchange is committed atomically; snapshots never overlap robots.
      for (const id of order) {
        if (!pending.has(id)) continue;
        const bot = state.robots[id];
        const other = state.robots.find((r) => r.id !== id && same(r, intents[id]));
        if (other && pending.has(other.id) && same(intents[other.id], bot)) {
          const old = { x: bot.x, y: bot.y };
          move(bot, intents[id]);
          move(other, old);
          pending.delete(id);
          pending.delete(other.id);
          state.metrics.courtesyPasses++;
          state.events.push(`${bot.name} and ${other.name} made a little room.`);
        }
      }
      for (const id of pending) {
        const bot = state.robots[id];
        const wall = !validPoint(intents[id], state.walls);
        state.metrics.blockedMoves++;
        state.metrics[wall ? "wallBumps" : "trafficWaits"]++;
        bot.wait++;
        bot.mode = wall ? "Wall ahead · path not found" : "Waiting for a classmate";
      }
    }

    function tick() {
      state.tick++;
      state.events = [];
      const progressBefore = state.metrics.moves + state.metrics.harvested + state.delivered + state.metrics.chargeTicks;
      const intents = state.robots.map((bot) => intent(bot));
      if (build.courtesy) {
        courteousMoves(intents);
      } else for (const bot of state.robots) {
        const next = intents[bot.id];
        if (!next) { bot.wait = 0; continue; }
        const wall = !validPoint(next, state.walls);
        const occupied = !same(next, HOME) && state.robots.some((other) => other.id !== bot.id && same(other, next));
        if (wall || occupied) {
          state.metrics.blockedMoves++;
          state.metrics[wall ? "wallBumps" : "trafficWaits"]++;
          bot.wait++;
          bot.mode = wall ? "Wall ahead · path not found" : "Waiting for a classmate";
        } else {
          move(bot, next);
        }
      }
      const progressed = progressBefore !== state.metrics.moves + state.metrics.harvested + state.delivered + state.metrics.chargeTicks;
      if (intents.some(Boolean) && !progressed) {
        state.metrics.deadlockTicks++;
        stall++;
        state.metrics.longestStall = Math.max(state.metrics.longestStall, stall);
      } else {
        stall = 0;
      }
      finish();
      assertInvariants(state);
    }

    function frame() {
      return {
        tick: state.tick, hash: fingerprint(state), status: state.status,
        delivered: state.delivered,
        robots: state.robots.map((r) => [r.x, r.y, r.energy, r.cargo, r.mode]),
        remaining: state.patches.map((p) => p.remaining),
        events: [...state.events],
      };
    }

    function act(input) {
      const action = validateAction(input);
      if (state.status !== "playing") return clone(state);
      if (action.type === "rescue" && (state.rescueKits === 0 || atHome(state.robots[action.robot]))) {
        throw new RangeError("A rescue needs a kit and a robot away from home.");
      }
      state.actions++;
      const frames = [];
      if (action.type === "tick") {
        for (let i = 0; i < action.count && state.status === "playing"; i++) {
          tick();
          frames.push(frame());
        }
      } else {
        const bot = state.robots[action.robot];
        if (action.type === "teach") {
          bot.program[action.rule] = action.value;
          bot.target = null;
          state.metrics.lessons++;
          state.events = [`${bot.name} learned ${action.rule}: ${action.value}.`];
        } else {
          state.lostCargo += bot.cargo;
          bot.cargo = 0;
          bot.energy = MAX_ENERGY;
          bot.x = HOME.x;
          bot.y = HOME.y;
          bot.stranded = false;
          bot.target = null;
          bot.wait = 0;
          bot.mode = "Rescued · ready to try again";
          state.rescueKits--;
          state.metrics.rescues++;
          state.events = [`${bot.name} rescued. Any carried pod was lost.`];
        }
        finish();
        assertInvariants(state);
        frames.push(frame());
      }
      entries.push({ action, frames });
      return clone(state);
    }

    function run(actions) {
      if (!Array.isArray(actions) || actions.length > MAX_BATCH) throw new RangeError(`A batch contains at most ${MAX_BATCH} actions.`);
      const normalized = actions.map(validateAction);
      if (normalized.length + state.actions > MAX_ACTIONS) throw new RangeError("Batch exceeds the remaining action budget.");
      for (const action of normalized) {
        if (state.status !== "playing") break;
        act(action);
      }
      return clone(state);
    }

    assertInvariants(state);
    return Object.freeze({
      snapshot: () => clone(state),
      act,
      run,
      trace: () => ({
        schema: "little-signals-replay/1", game: "01-game-studio",
        options: clone(settings), entries: clone(entries), final: clone(state),
      }),
    });
  }

  function replay(trace) {
    if (!trace || trace.schema !== "little-signals-replay/1" || trace.game !== "01-game-studio" ||
      !Array.isArray(trace.entries) || trace.entries.length > MAX_ACTIONS) throw new TypeError("Not a bounded Little Signals replay.");
    const game = create(trace.options);
    for (const [index, entry] of trace.entries.entries()) {
      if (!entry || !Array.isArray(entry.frames) || entry.frames.length < 1 || entry.frames.length > MAX_STEP) throw new TypeError(`Invalid frames at action ${index}.`);
      if (game.snapshot().status !== "playing") throw new Error(`Replay contains an action after the terminal state at ${index}.`);
      game.act(entry.action);
    }
    const actual = game.trace();
    for (const [index, entry] of trace.entries.entries()) {
      if (JSON.stringify(actual.entries[index]) !== JSON.stringify(entry)) throw new Error(`Replay diverged at action ${index}.`);
    }
    const result = game.snapshot();
    if (JSON.stringify(result) !== JSON.stringify(trace.final)) throw new Error("Replay final state differs.");
    assertInvariants(result);
    return result;
  }

  function score(state) {
    assertInvariants(state);
    const energy = state.robots.reduce((sum, bot) => sum + bot.energy, 0);
    return {
      schema: "little-signals-score/1",
      game: "01-game-studio",
      version: state.version,
      scenario: state.scenario,
      seed: state.seed,
      status: state.status,
      delivered: state.delivered,
      goal: state.goal,
      tick: state.tick,
      limit: state.limit,
      energy,
      points: Math.max(0, state.delivered * 100 + (state.status === "won" ? (MAX_TICKS - state.tick) * 3 : 0) + energy -
        state.metrics.blockedMoves * 2 - state.metrics.rescues * 75),
      automated: null,
    };
  }

  globalThis.LittleSignalsEngine = Object.freeze({
    create, replay, score, assertInvariants, fingerprint,
    scenarios: clone(scenarios),
    limits: Object.freeze({ ticks: MAX_TICKS, actions: MAX_ACTIONS, batch: MAX_BATCH, step: MAX_STEP, energy: MAX_ENERGY }),
  });
})();
