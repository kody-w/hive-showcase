(() => {
  "use strict";
  const element = (id) => document.getElementById(id);
  const data = window.HANDOFF_REPLAY;
  if (!data || !data.cases || !data.cases.duplicate) {
    element("frame-status").textContent = "Recorded replay data is unavailable. Follow the evidence links below.";
    for (const id of ["play", "step", "reset", "case-select"]) element(id).disabled = true;
    return;
  }

  let selected = "duplicate";
  let position = data.cases[selected].records.length;
  let timer = null;
  const select = element("case-select");
  const play = element("play");
  const step = element("step");
  const reset = element("reset");

  function stop() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    play.textContent = "Replay all";
    play.setAttribute("aria-pressed", "false");
  }

  function itemRows(id, summary) {
    const rows = summary.items.map((item) => {
      const row = document.createElement("div");
      row.className = "item-row";
      const name = document.createElement("span");
      name.textContent = item.item_id;
      const detail = document.createElement("span");
      detail.textContent = `${item.state} · ${item.event_count} events · minute ${item.last_minute}`;
      row.append(name, detail);
      return row;
    });
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No receipts applied yet.";
      rows.push(empty);
    }
    element(id).replaceChildren(...rows);
  }

  function render() {
    const current = data.cases[selected];
    const before = current.before[position];
    const after = current.after[position];
    const complete = position === current.records.length;
    const beforePass = JSON.stringify(before) === JSON.stringify(current.expected);
    const afterPass = JSON.stringify(after) === JSON.stringify(current.expected);
    const seen = new Set();
    const inputRows = current.records.map((record, index) => {
      const replayed = seen.has(record.event_id);
      seen.add(record.event_id);
      const row = document.createElement("tr");
      row.className = [
        index < position ? "processed" : "",
        index === position - 1 ? "current" : "",
      ].filter(Boolean).join(" ");
      for (const value of [
        String(index + 1), record.event_id,
        `${record.item_id} / ${record.action}`, String(record.at_minute),
        replayed ? "IDENTICAL REPLAY" : "Original record",
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (value === "IDENTICAL REPLAY") cell.className = "replayed";
        row.append(cell);
      }
      return row;
    });
    element("receipts").replaceChildren(...inputRows);
    element("before-count").textContent = String(before.event_count);
    element("after-count").textContent = String(after.event_count);
    element("before-verdict").textContent = complete
      ? (beforePass
          ? "PASS · this behavior already worked"
          : `FAIL · expected ${current.expected.event_count} unique events`)
      : "Partial replay · not a final acceptance verdict";
    element("after-verdict").textContent = complete
      ? (afterPass ? "PASS · unchanged acceptance target" : "FAIL · recorded result differs from target")
      : "Partial replay · not a final acceptance verdict";
    element("before-verdict").className = complete && beforePass ? "success" : "error";
    element("after-verdict").className = complete && !afterPass ? "error" : "success";
    itemRows("before-items", before);
    itemRows("after-items", after);
    element("progress").max = current.records.length;
    element("progress").value = position;
    const difference = before.event_count !== after.event_count
      ? "The replay added work only in the unfinished version."
      : "Both versions agree at this frame.";
    element("frame-status").textContent = `Recorded frame ${position} / ${current.records.length}. ${difference}`;
    element("frame-json").textContent = JSON.stringify({
      mode: data.mode,
      fixture_sha256: current.input_sha256,
      records_applied: position,
      before, after,
      final_acceptance_target: current.expected,
    }, null, 2);
    step.disabled = complete;
    reset.disabled = position === 0;
  }

  reset.addEventListener("click", () => {
    stop();
    position = 0;
    render();
  });
  step.addEventListener("click", () => {
    stop();
    position = Math.min(position + 1, data.cases[selected].records.length);
    render();
  });
  select.addEventListener("change", () => {
    stop();
    selected = Object.hasOwn(data.cases, select.value) ? select.value : "duplicate";
    select.value = selected;
    position = data.cases[selected].records.length;
    render();
  });
  play.addEventListener("click", () => {
    if (timer !== null) {
      stop();
      return;
    }
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      position = data.cases[selected].records.length;
      render();
      return;
    }
    if (position === data.cases[selected].records.length) position = 0;
    render();
    play.textContent = "Pause";
    play.setAttribute("aria-pressed", "true");
    timer = window.setInterval(() => {
      position += 1;
      render();
      if (position === data.cases[selected].records.length) stop();
    }, 1050);
  });
  select.value = selected;
  render();
})();
