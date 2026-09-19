(function () {
  "use strict";
  const model = window.PocketArcade;
  const byId = id => document.getElementById(id);
  const availability = Object.fromEntries(model.projects.map(project => [project.id, "unknown"]));
  let report = null;
  let connected = null;
  let hashState = "not-checked";
  let busy = false;
  const isHttp = location.protocol === "http:" || location.protocol === "https:";
  const labels = {
    unknown: "Availability not checked", checking: "Checking current files…",
    present: "Entry page present · not acceptance", missing: "Not in this snapshot",
    invalid: "Invalid or unreadable contribution", "file-mode": "File mode · availability unknown"
  };

  function repositoryUrl(path) {
    if (!model.safePath(path)) throw new Error("Refusing an unsafe or foreign file path.");
    const url = new URL("../../" + path, location.href);
    if (url.origin !== location.origin) throw new Error("Only same-origin local files are allowed.");
    return url.href;
  }

  async function fetchLocal(path, method) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(repositoryUrl(path), {
        method: method || "GET", signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error"
      });
      if (!response.ok) {
        const error = new Error(`${path}: HTTP ${response.status}`);
        error.missing = response.status === 404;
        throw error;
      }
      if (method === "HEAD") return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("File exceeds the local verification limit.");
      return bytes;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(path) {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await fetchLocal(path)));
  }

  function render() {
    for (const project of model.projects) {
      const node = byId("availability-" + project.id);
      node.textContent = labels[availability[project.id]];
      node.dataset.state = availability[project.id];
      const contribution = report && report.contributions.find(item => item.id === project.id);
      let message = "Recorded checks not loaded";
      if (contribution) {
        if (contribution.status === "accepted-local") {
          message = ["verified", "verified-partial"].includes(hashState) && availability[project.id] === "present"
            ? `${contribution.gates.length} recorded gates · hashes current`
            : "Recorded pass · not currently reverified";
        } else if (contribution.status === "rejected") message = "Rejected · inspect report";
        else if (contribution.status === "blocked-by-dependency") message = contribution.contentChecksPassed
          ? "Local content checks recorded · integration dependency blocked"
          : "Blocked by an upstream contribution";
        else if (contribution.status === "missing") message = "Missing from recorded snapshot";
      }
      byId("acceptance-" + project.id).textContent = message;
    }
    const status = model.assessStatus(report, availability, hashState, connected);
    byId("integration-title").textContent = status.title;
    byId("integration-detail").textContent = status.detail;
    document.querySelector(".status-strip").dataset.tone = status.tone;
    byId("snapshot-title").textContent = hashState === "verified" ? "Input hashes match this snapshot"
      : hashState === "verified-partial" ? "Present inputs match · planner still missing"
      : hashState === "mismatch" ? "Snapshot differs from the saved report" : "Not reverified in this page";
    for (const id of ["refresh-button", "verify-button", "report-file"]) byId(id).disabled = busy;
  }

  async function probe(project) {
    availability[project.id] = "checking";
    render();
    try {
      model.inspectManifest(await fetchJson(`projects/${project.id}/manifest.json`), project);
      await fetchLocal(`projects/${project.id}/index.html`, "HEAD");
      availability[project.id] = "present";
    } catch (error) {
      availability[project.id] = error.missing ? "missing" : "invalid";
    }
    render();
  }

  async function refresh() {
    if (busy) return;
    hashState = "not-checked";
    if (!isHttp) {
      for (const project of model.projects) availability[project.id] = "file-mode";
      byId("transport-status").textContent = "Opened directly from disk. Navigation and notes work; browsers restrict reading neighboring files. Use the hosted public projection or the offline CLI for current-byte checks.";
      render();
      return;
    }
    busy = true;
    render();
    const reportTask = (async () => {
      try {
        report = model.inspectReport(await fetchJson("projects/10-pocket-arcade/evidence/integration-validation.json"));
        byId("verification-status").textContent = "Saved real-artifact report loaded. This alone is not a current hash verification.";
      } catch (error) {
        report = null;
        byId("verification-status").textContent = "No usable real-artifact report: " + error.message;
      }
    })();
    await Promise.all([...model.projects.map(probe), reportTask]);
    byId("transport-status").textContent = "Availability probes read local manifests and entrypoint headers only. A reachable page is not an acceptance check.";
    busy = false;
    render();
  }

  async function verify() {
    if (busy) return;
    if (!isHttp || !window.crypto || !window.crypto.subtle) {
      byId("verification-status").textContent = "Current-byte verification needs a secure local HTTP preview with Web Crypto. The Python CLI works without any server.";
      return;
    }
    const partial = report && report.integrationStatus === "awaiting-real-contributions"
      && report.summary && report.summary.verifiedLocalContributions > 0;
    if (!report || (!report.integrationPassed && !partial)) {
      byId("verification-status").textContent = "There is no passing real-artifact snapshot to verify. Run the strict CLI after actual contributions arrive.";
      return;
    }
    busy = true;
    hashState = "not-checked";
    render();
    try {
      await Promise.all(model.projects.map(probe));
      const required = report.contributions.filter(item => item.contentChecksPassed);
      if (!required.length || required.some(item => availability[item.id] !== "present")) {
        throw new Error("At least one recorded, received contribution is missing or incompatible.");
      }
      let count = 0;
      for (const file of report.inputFiles) {
        byId("verification-status").textContent = `Hashing ${++count} / ${report.inputFiles.length}: ${file.path}`;
        const bytes = await fetchLocal(file.path);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          byte => byte.toString(16).padStart(2, "0")).join("");
        if (bytes.byteLength !== file.bytes || digest !== file.sha256) throw new Error("Changed input: " + file.path);
      }
      hashState = partial ? "verified-partial" : "verified";
      byId("verification-status").textContent = `All ${report.inputFiles.length} present input hashes match the saved report. ${partial ? "Planner05 is still missing; integration has NOT passed. " : ""}Commands were not rerun; no signature or native authority is implied.`;
    } catch (error) {
      hashState = "mismatch";
      byId("verification-status").textContent = "Not verified: " + error.message;
    } finally {
      busy = false;
      render();
    }
  }

  for (const button of document.querySelectorAll("[data-select]")) {
    button.addEventListener("click", () => {
      const project = model.projects.find(item => item.id === button.dataset.select);
      if (!project) return;
      for (const station of document.querySelectorAll("[data-station]")) {
        const selected = station.dataset.station === project.id;
        station.classList.toggle("selected", selected);
        station.querySelector("button").setAttribute("aria-pressed", String(selected));
      }
      byId("station-title").textContent = project.station;
      const component = connected && [connected.game, connected.planner, connected.tray, connected.maintenance].find(item => item && item.id === project.id);
      byId("station-detail").textContent = component ? component.instructions : project.detail;
      byId("station-link").href = `../${project.id}/index.html`;
      byId("station-link").textContent = project.action + " ↗";
    });
  }
  byId("refresh-button").addEventListener("click", refresh);
  byId("verify-button").addEventListener("click", verify);
  byId("report-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file || busy) return;
    hashState = "not-checked";
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Report exceeds the 2 MiB limit.");
      report = model.inspectReport(JSON.parse(await file.text()));
      byId("verification-status").textContent = "Local report inspected, not reverified. No file was uploaded and no check command was run.";
    } catch (error) {
      report = null;
      byId("verification-status").textContent = "Report rejected: " + error.message;
    }
    render();
  });
  byId("session-sheet").addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const notes = model.sessionRecord(Array.from({ length: 8 }, (_, index) => form.get("alias" + (index + 1)) || ""),
      form.get("notes") || "");
    const url = URL.createObjectURL(new Blob([JSON.stringify(notes, null, 2) + "\n"], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pocket-arcade-session-notes.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    byId("notes-status").textContent = "Download requested. These notes are not a tournament result or integration acceptance.";
  });
  try {
    connected = model.inspectConnectedData(window.PocketArcadeData);
    const { game, planner, tray, maintenance } = connected;
    byId("recorded-game-value").textContent = `${game.score.delivered} / ${game.score.goal} pods`;
    byId("recorded-game-detail").textContent = `Won in ${game.score.tick} / ${game.score.limit} beats · ${game.score.points} recorded points. Untaught control: ${game.negativeControl.delivered} / ${game.negativeControl.goal}, lost. Automated, not a human match.`;
    if (planner) {
      const clock = minute => String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
      byId("recorded-planner-value").textContent = `${planner.requiredMinutes} > ${planner.availableMinutes} min`;
      byId("recorded-planner-detail").textContent = `Original cutoff refused. A +${planner.minimumChange.totalMinutes}-minute cutoff proposal keeps all ${planner.taskCount} tasks: ${clock(planner.start)}–${clock(planner.proposedCutoff)}. Model-feasible, not owner-approved.`;
    } else {
      byId("recorded-planner-value").textContent = "Not bound";
      byId("recorded-planner-detail").textContent = "Planner evidence is missing from this older saved binding. No schedule is invented.";
    }
    byId("recorded-tray-value").textContent = tray.outerMM.join(" × ") + " mm";
    byId("recorded-tray-detail").textContent = `${tray.bays} nominal card/token bays · ${tray.clearanceMM} mm centered gap. No fabricated product or verified printed-card fit.`;
    byId("recorded-maintenance-value").textContent = `${maintenance.inputRecords} records → ${maintenance.uniqueEvents} events`;
    byId("recorded-maintenance-detail").textContent = `${maintenance.replayedRecords} repeated receipt counted once. Synthetic open item: ${maintenance.openQueue.join(", ") || "none"}. Current public behavior is reproducible; the private historical invocation is not publicly reverified. No operational release authority.`;
    byId("connected-source").textContent = `${connected.pending.length ? "This binding is incomplete" : "All four public interfaces are bound"} to artifact set ${connected.artifactSetSha256.slice(0, 12)}. This content reference does not require private Git history. Recorded outputs are not a live tournament, physical inspection or current hash verification.`;
    byId("station-detail").textContent = game.instructions;
  } catch (error) {
    byId("connected-source").textContent = "Recorded interface data unavailable: " + error.message + " No replacement results are invented.";
  }
  refresh();
}());
