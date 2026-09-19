(() => {
  "use strict";
  const engine = globalThis.LittleSignalsEngine;
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function create(onChange = () => {}) {
    let game = engine.create();
    let recording = null;
    let cursor = 0;
    let automated = null;
    const view = () => ({
      mode: recording ? "replay" : "live",
      cursor,
      length: recording?.entries.length ?? 0,
      automated,
    });
    const publish = (kind) => {
      const state = game.snapshot();
      onChange(state, { ...view(), kind });
      return state;
    };
    const requireLive = () => {
      if (recording) throw new Error("This verified replay is read-only. Start a new shift to teach.");
    };

    function reset(options = {}) {
      const next = engine.create(options);
      game = next;
      recording = null;
      automated = null;
      cursor = 0;
      return publish("reset");
    }

    function seek(index) {
      if (!recording) throw new Error("Load a replay before seeking.");
      if (!Number.isInteger(index) || index < 0 || index > recording.entries.length) throw new RangeError("Replay position is out of bounds.");
      const next = engine.create(recording.options);
      for (let i = 0; i < index; i++) next.act(recording.entries[i].action);
      game = next;
      cursor = index;
      return publish("seek");
    }

    function replay(input, options = {}) {
      const trace = input?.trace ?? input;
      engine.replay(trace);
      const index = options.at ?? trace.entries.length;
      if (!Number.isInteger(index) || index < 0 || index > trace.entries.length) throw new RangeError("Replay position is out of bounds.");
      recording = copy(trace);
      automated = input?.score?.automated === true ? true : null;
      return seek(index);
    }

    function nextReplay(count = 1) {
      if (!recording) throw new Error("Load a replay first.");
      if (!Number.isInteger(count) || count < 1 || count > engine.limits.step) throw new RangeError("Advance 1–25 replay actions.");
      for (let i = 0; i < count && cursor < recording.entries.length; i++) {
        game.act(recording.entries[cursor].action);
        cursor++;
      }
      return publish("replay-step");
    }

    return Object.freeze({
      reset,
      snapshot: () => game.snapshot(),
      score: () => ({ ...engine.score(game.snapshot()), automated }),
      trace: () => game.trace(),
      view,
      replay,
      seek,
      nextReplay,
      act: (action) => {
        requireLive();
        game.act(action);
        return publish("action");
      },
      run: (actions) => {
        requireLive();
        game.run(actions);
        return publish("batch");
      },
    });
  }
  globalThis.LittleSignalsController = Object.freeze({ create });
})();
