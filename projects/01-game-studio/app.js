(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const engine = globalThis.LittleSignalsEngine;
  const builds = globalThis.LittleSignalsBuilds;
  const colors = ["#b6c8ed", "#f2d49a", "#9adccb"];
  const focusOrder = ["nearest", "north", "east", "south"];
  let selected = 0;
  let timer = null;
  let messageTimer = null;
  let boardScenario = null;
  let lastHash = null;
  let journal = [];

  function toast(text) {
    $("message").textContent = text;
    $("message").hidden = false;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { $("message").hidden = true; }, 6500);
  }

  function perform(callback) {
    try { return callback(); }
    catch (error) { pause(); render(controller.snapshot()); toast(error.message); return null; }
  }

  const controller = globalThis.LittleSignalsController.create((state, view) => {
    if (["reset", "seek"].includes(view.kind)) { journal = []; lastHash = null; }
    if (state.status !== "playing" || (view.mode === "replay" && view.cursor === view.length)) pause();
    render(state);
    window.dispatchEvent(new CustomEvent("hive-game-score", { detail: controller.score() }));
  });

  function drawBoard(state) {
    const parts = [
      '<defs><pattern id="grain" width="56" height="56" patternUnits="userSpaceOnUse"><circle cx="9" cy="13" r=".8" fill="#748f7240"/><circle cx="39" cy="41" r=".7" fill="#748f7230"/></pattern></defs>',
    ];
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        parts.push(`<rect class="board-tile${y === 5 ? " path" : ""}" x="${x * 56}" y="${y * 56}" width="56" height="56"/>`);
        if ((x * 7 + y * 11) % 5 === 0) parts.push(`<path class="board-grass" d="M${x * 56 + 13} ${y * 56 + 41}l-2-6m2 6 3-5"/>`);
      }
    }
    parts.push('<rect width="728" height="504" fill="url(#grain)" pointer-events="none"/>');
    for (const wall of state.walls) {
      parts.push(`<g transform="translate(${wall.x * 56} ${wall.y * 56})" aria-hidden="true"><ellipse cx="29" cy="39" rx="21" ry="9" fill="#63786833"/><path d="m10 35 6-20 20-4 13 17-8 14-24 1Z" fill="#a3b3a2" stroke="#80957f" stroke-width="1.5"/><path d="m16 15 12 18 21-5m-21 5-11 10m11-10 8-22" fill="none" stroke="#bec8b3" stroke-width="1.5"/><path d="m16 37 7-2 6 5" fill="none" stroke="#768f74"/></g>`);
    }
    const hx = state.home.x * 56;
    const hy = state.home.y * 56;
    parts.push(`<g aria-label="Nursery and charger at column ${state.home.x}, row ${state.home.y}" transform="translate(${hx} ${hy})"><rect x="1" y="1" width="54" height="54" rx="14" fill="#a6c8b5" stroke="#5a8f7b" stroke-width="2"/><path d="m9 23 18-14 20 14M14 21v22h28V21" fill="none" stroke="#467b6b" stroke-width="2"/><text class="map-label" x="28" y="69">NURSERY</text></g>`);
    for (const patch of state.patches) {
      parts.push(`<g id="patch-${patch.id}" class="patch" data-patch="${patch.id}" transform="translate(${patch.x * 56 + 28} ${patch.y * 56 + 28})" role="button" tabindex="0" aria-label="${patch.name}: teach selected robot to gather here"><circle class="patch-ring" r="23"/><path d="M0 12V-8m0 15c-9 0-11-7-11-7 8-1 11 7 11 7m0-3c8-1 12-8 12-8C4-4 0 4 0 4" fill="#91b775" stroke="#62835b" stroke-width="1"/><path class="pod-symbol" d="m0-20 3 7 8-1-5 6 3 8-9-4-8 4 2-8-5-6 8 1Z"/><text id="patch-count-${patch.id}" class="map-label" x="0" y="38">${patch.name.toUpperCase()} / ${patch.remaining}</text></g>`);
    }
    for (const bot of state.robots) {
      parts.push(`<g id="map-robot-${bot.id}" class="bot" data-robot-map="${bot.id}" tabindex="0" role="button" aria-label="Select ${bot.name}"><circle class="selection" r="25"/><ellipse cx="0" cy="16" rx="18" ry="5" fill="#1d374424"/><path d="M-7 11v5m14-5v5" stroke="#304d52" stroke-width="4" stroke-linecap="round"/><path d="M0-14v-5" stroke="#304d52" stroke-width="2"/><circle cx="0" cy="-21" r="2.5" fill="${colors[bot.id]}"/><rect class="body" x="-16" y="-14" width="32" height="28" rx="${[7, 10, 6][bot.id]}" fill="${colors[bot.id]}"/><rect x="-11" y="-7" width="22" height="12" rx="4" fill="#304955"/><path d="M-5-3v3m10-3v3" stroke="#f4f5ce" stroke-width="2.4" stroke-linecap="round"/><path class="face" d="M-4 9h8"/><circle id="map-cargo-${bot.id}" class="carried" cx="17" cy="-14" r="6" visibility="hidden"/><text class="bot-name" y="28">${bot.name.toUpperCase()}</text></g>`);
    }
    $("board").innerHTML = parts.join("");
    document.querySelectorAll("[data-robot-map]").forEach((element) => {
      const select = () => { selected = Number(element.dataset.robotMap); render(controller.snapshot()); };
      element.addEventListener("click", select);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
      });
    });
    document.querySelectorAll("[data-patch]").forEach((element) => {
      const teach = () => perform(() => teachRule("focus", element.dataset.patch));
      element.addEventListener("click", teach);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); teach(); }
      });
    });
    boardScenario = state.scenario;
  }

  function render(state) {
    const view = controller.view();
    const replaying = view.mode === "replay";
    const locked = replaying || state.status !== "playing";
    const chosen = state.robots[selected];
    const score = controller.score();
    if (boardScenario !== state.scenario) drawBoard(state);
    $("delivered").textContent = state.delivered;
    $("goal").textContent = state.goal;
    $("goal-fill").style.width = `${Math.min(100, state.delivered / state.goal * 100)}%`;
    const seconds = (state.limit - state.tick) * 2;
    $("clock").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    $("beat-count").textContent = `${state.tick} / ${state.limit} beats`;
    $("energy").textContent = `${score.energy} / 72`;
    $("points").textContent = score.points;
    $("traffic").textContent = `${state.metrics.trafficWaits} traffic waits · ${state.metrics.strandedEvents} stranded`;
    $("garden-caption").textContent = engine.scenarios[state.scenario].name.toUpperCase();
    $("board-time").textContent = state.tick < 50 ? "MORNING / 01" : state.tick < 100 ? "AFTERNOON / 02" : "GOLDEN HOUR / 03";
    $("garden").value = state.scenario;
    $("build").value = state.version;
    if (document.activeElement !== $("seed")) $("seed").value = state.seed;
    $("build-description").textContent = builds[state.version].description;
    $("safety-copy").textContent = builds[state.version].energyPlanning
      ? "Budget a round trip. Charge fully before leaving."
      : "Historical rule: head home at 3 power. Its unsafe behavior is preserved.";
    $("auto-focus-label").textContent = builds[state.version].courtesy ? "Share patches fairly" : "Nearest patch (no reservations)";
    $("shift-state").textContent = replaying ? `VERIFIED REPLAY · ${view.cursor} / ${view.length}` :
      state.status === "won" ? "NURSERY GLOWING · YOU WON" : state.status === "lost" ? "SHIFT ENDED · TRY AGAIN" :
        timer ? "CLASS IN SESSION" : "PAUSED · LESSON TIME";
    $("pupil").textContent = chosen.name;
    $("thought").textContent = `“${chosen.mode}.”`;
    $("lesson-count").textContent = `${Number(chosen.program.delivery) + Number(chosen.program.safety)} / 2 learned`;
    $("delivery-lesson").setAttribute("aria-pressed", String(chosen.program.delivery));
    $("safety-lesson").setAttribute("aria-pressed", String(chosen.program.safety));
    $("delivery-check").textContent = chosen.program.delivery ? "✓" : "+";
    $("safety-check").textContent = chosen.program.safety ? "✓" : "+";
    $("focus").value = chosen.program.focus;
    $("rest").setAttribute("aria-pressed", String(chosen.program.job === "rest"));
    $("rest").textContent = chosen.program.job === "rest" ? "Resume collecting" : "Rest at home";
    $("kits").textContent = state.rescueKits;
    for (const id of ["delivery-lesson", "safety-lesson", "focus", "rest"]) $(id).disabled = locked;
    $("rescue").disabled = locked || state.rescueKits === 0 || (chosen.x === state.home.x && chosen.y === state.home.y);
    for (const bot of state.robots) {
      const card = document.querySelector(`[data-robot="${bot.id}"]`);
      card.setAttribute("aria-pressed", String(bot.id === selected));
      $("battery-" + bot.id).textContent = `${bot.energy} / 24`;
      $("battery-bar-" + bot.id).value = bot.energy;
      $("cargo-" + bot.id).textContent = bot.stranded ? "Needs rescue!" : bot.cargo ? "✳ Carrying pod" : "Empty hands";
      const marker = $("map-robot-" + bot.id);
      const home = bot.x === state.home.x && bot.y === state.home.y;
      marker.setAttribute("transform", `translate(${bot.x * 56 + 28 + (home ? (bot.id - 1) * 14 : 0)} ${bot.y * 56 + 26 + (home ? (bot.id === 1 ? -9 : 9) : 0)})`);
      marker.classList.toggle("selected", bot.id === selected);
      marker.classList.toggle("stranded", bot.stranded);
      marker.setAttribute("aria-label", `${bot.name}, energy ${bot.energy} of 24, ${bot.cargo ? "carrying a pod" : "empty hands"}, ${bot.mode}. Select robot.`);
      $("map-cargo-" + bot.id).setAttribute("visibility", bot.cargo ? "visible" : "hidden");
    }
    for (const patch of state.patches) {
      $("patch-count-" + patch.id).textContent = `${patch.name.toUpperCase()} / ${patch.remaining}`;
      $("patch-" + patch.id).classList.toggle("depleted", patch.remaining === 0);
      $("patch-" + patch.id).classList.toggle("focused", chosen.program.focus === patch.id);
      $("patch-" + patch.id).setAttribute("aria-label", `${patch.name}, ${patch.remaining} pods. Teach ${chosen.name} this route.`);
      $("patch-" + patch.id).setAttribute("aria-disabled", String(locked));
    }
    const finished = replaying ? view.cursor >= view.length : state.status !== "playing";
    $("play").disabled = finished;
    $("step").disabled = finished;
    $("five").disabled = finished;
    $("play").innerHTML = timer ? '<span aria-hidden="true">Ⅱ</span> Pause <kbd>Space</kbd>' :
      replaying ? '<span aria-hidden="true">▶</span> Play recording <kbd>Space</kbd>' :
        '<span aria-hidden="true">▶</span> Launch shift <kbd>Space</kbd>';
    $("step").innerHTML = replaying ? "1 action <kbd>N</kbd>" : "1 beat <kbd>N</kbd>";
    $("five").textContent = replaying ? "5 actions" : "5 beats";
    $("pace-note").textContent = replaying
      ? "Verified, read-only playback at 4 recorded actions per second. Historical failures are preserved."
      : timer ? "Running at one beat every 2 seconds. Teach while they work, or pause to think."
        : "Paused for lessons. One beat = 2 seconds; sunset after 150 beats. Pausing does not spend time.";
    $("replay-controls").hidden = !replaying;
    $("replay-position").max = view.length;
    $("replay-position").value = view.cursor;
    $("replay-position-label").textContent = `${view.cursor} / ${view.length}`;
    $("outcome").hidden = state.status === "playing";
    if (state.status !== "playing") {
      $("outcome-symbol").textContent = state.status === "won" ? "✳" : "☾";
      $("outcome-title").textContent = state.status === "won" ? "A little brighter." : "Tomorrow, a new lesson.";
      $("outcome-reason").textContent = state.reason;
      $("outcome-score").textContent = `${state.delivered} / ${state.goal} PODS · ${state.tick} BEATS · ${score.points} POINTS`;
    }
    const stranded = state.robots.find((r) => r.stranded);
    const waiting = state.robots.find((r) => r.cargo && !r.program.delivery);
    const untrained = state.robots.find((r) => !r.program.delivery || !r.program.safety);
    $("hint").textContent = replaying ? "You are watching a verified engine recording, not a claimed human playtest. Restart to make your own choices." :
      state.status !== "playing" ? "Download this run to preserve every choice, then try another lesson or garden." :
      stranded ? `${stranded.name} is stranded. Select them and spend a rescue kit; teach recharge before the next trip.` :
      waiting ? `${waiting.name} is holding a pod. Teach “When carrying → return home” so the nursery gets it.` :
      untrained ? `${untrained.name} still needs ${!untrained.program.delivery ? "the return-home" : "the recharge"} lesson. Select their card to teach it.` :
      state.metrics.blockedMoves > 20 ? "Traffic is building. Try separate patches, rest one robot, or compare the latest v4 build." :
      "Good little habits. Watch the class share its routes, or assign each robot a different patch.";
    const hash = engine.fingerprint(state);
    if (hash !== lastHash) {
      for (const event of state.events) journal.unshift(`${String(state.tick).padStart(2, "0")} · ${event}`);
      journal = journal.slice(0, 7);
      $("journal").replaceChildren(...journal.map((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        return li;
      }));
      if (state.events.length || state.status !== "playing") $("announcer").textContent = state.status !== "playing" ? state.reason : state.events.join(" ");
      lastHash = hash;
    }
  }

  function pause() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  function step(count = 1) {
    return controller.view().mode === "replay" ? controller.nextReplay(count) : controller.act({ type: "tick", count });
  }

  function togglePlay() {
    if (timer !== null) { pause(); render(controller.snapshot()); return; }
    const view = controller.view();
    if ((view.mode === "live" && controller.snapshot().status !== "playing") ||
      (view.mode === "replay" && view.cursor === view.length)) return;
    timer = setInterval(() => perform(() => step()), view.mode === "replay" ? 250 : 2000);
    render(controller.snapshot());
  }

  function teachRule(rule, value) {
    return controller.act({ type: "teach", robot: selected, rule, value });
  }

  function toggleRule(rule) {
    return teachRule(rule, !controller.snapshot().robots[selected].program[rule]);
  }

  function restart() {
    pause();
    if ($("seed").value.trim() === "") throw new RangeError("Enter an integer garden seed from 0 to 4294967295.");
    controller.reset({ version: $("build").value, scenario: $("garden").value, seed: Number($("seed").value) });
  }

  document.querySelectorAll("[data-robot]").forEach((button) => button.addEventListener("click", () => {
    selected = Number(button.dataset.robot);
    render(controller.snapshot());
  }));
  $("delivery-lesson").addEventListener("click", () => perform(() => toggleRule("delivery")));
  $("safety-lesson").addEventListener("click", () => perform(() => toggleRule("safety")));
  $("focus").addEventListener("change", () => perform(() => teachRule("focus", $("focus").value)));
  $("rest").addEventListener("click", () => perform(() => teachRule("job", controller.snapshot().robots[selected].program.job === "rest" ? "collect" : "rest")));
  $("rescue").addEventListener("click", () => perform(() => controller.act({ type: "rescue", robot: selected })));
  $("play").addEventListener("click", togglePlay);
  $("step").addEventListener("click", () => { pause(); perform(() => step()); });
  $("five").addEventListener("click", () => { pause(); perform(() => step(5)); });
  for (const id of ["restart", "again", "apply-seed"]) $(id).addEventListener("click", () => perform(restart));
  for (const id of ["garden", "build"]) $(id).addEventListener("change", () => perform(restart));
  $("watch").addEventListener("click", () => perform(() => {
    pause();
    const recording = globalThis.LittleSignalsReplays?.[$("recording").value];
    if (!recording) throw new Error("The bundled recording is missing. Import its JSON from evidence/runs.");
    controller.replay(recording, { at: 0 });
    toast(`Verified ${recording.trace.entries.length} recorded actions. Launch playback or use the replay slider.`);
  }));
  $("replay-position").addEventListener("input", () => { pause(); perform(() => controller.seek(Number($("replay-position").value))); });
  $("download").addEventListener("click", () => perform(() => {
    const report = {
      schema: "little-signals-export/1",
      exportedAt: new Date().toISOString(),
      observation: "Locally recorded gameplay. Human-versus-automated input is not determined unless replay metadata explicitly says automated.",
      score: controller.score(),
      trace: controller.trace(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `little-signals-${report.score.scenario}-${report.score.version}-beat-${report.score.tick}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast("Replay download prepared. It contains choices and game states, not personal information.");
  }));
  $("import-run").addEventListener("change", async (event) => {
    pause();
    render(controller.snapshot());
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error("Replay is too large. Maximum size is 2 MB.");
      const report = JSON.parse(await file.text());
      controller.replay(report, { at: 0 });
      toast("Replay verified. Every recorded frame and final state matched the engine.");
    } catch (error) {
      toast(`Import rejected: ${error.message}`);
    }
    event.target.value = "";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { pause(); render(controller.snapshot()); return; }
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat ||
      event.target.closest("button, input, select, textarea, summary, a, [role='button'], [contenteditable='true']")) return;
    const key = event.key.toLowerCase();
    if (["1", "2", "3"].includes(key)) {
      selected = Number(key) - 1;
      render(controller.snapshot());
    } else if (key === " ") { event.preventDefault(); togglePlay(); }
    else if (key === "n") { event.preventDefault(); pause(); perform(() => step()); }
    else if (key === "d") perform(() => toggleRule("delivery"));
    else if (key === "c") perform(() => toggleRule("safety"));
    else if (key === "r") perform(restart);
    else if (key === "arrowleft" || key === "arrowright") {
      event.preventDefault();
      const current = focusOrder.indexOf(controller.snapshot().robots[selected].program.focus);
      perform(() => teachRule("focus", focusOrder[(current + (key === "arrowleft" ? 3 : 1)) % 4]));
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { pause(); render(controller.snapshot()); }
  });
  window.addEventListener("pagehide", pause);
  const bounded = (method) => (...args) => { pause(); return controller[method](...args); };
  window.hiveGame = Object.freeze({
    contract: "little-signals-api/1",
    limits: engine.limits,
    reset: bounded("reset"),
    snapshot: controller.snapshot,
    act: bounded("act"),
    run: bounded("run"),
    score: controller.score,
    trace: controller.trace,
    replay: bounded("replay"),
    seek: bounded("seek"),
    nextReplay: bounded("nextReplay"),
    view: controller.view,
  });
  $("boot-notice").hidden = true;
  render(controller.snapshot());
  window.dispatchEvent(new CustomEvent("hive-game-ready", { detail: { game: "01-game-studio", contract: window.hiveGame.contract } }));
})();
