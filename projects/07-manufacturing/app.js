(function () {
  "use strict";
  const E = globalThis.Stackline;
  const A = globalThis.StacklineArchive;
  const byId = (id) => document.getElementById(id);
  const form = byId("parameters");
  let selected = E.PRESETS[0];
  let current = null;
  let exploded = false;
  const downloads = [byId("download-bundle"), ...document.querySelectorAll("[data-download]")];

  function readParameters() {
    const p = {};
    for (const key of Object.keys(E.LIMITS)) {
      const value = form.elements.namedItem(key).value.trim();
      p[key] = value === "" ? NaN : Number(value);
    }
    p.layout = form.elements.namedItem("layout").value;
    return p;
  }

  function draw() {
    if (current) byId("preview").innerHTML = E.previewSVG(current, { exploded });
    byId("assembled").setAttribute("aria-pressed", String(!exploded));
    byId("exploded").setAttribute("aria-pressed", String(exploded));
  }

  function update() {
    const p = readParameters();
    const errors = E.validate(p);
    for (const key of [...Object.keys(E.LIMITS), "layout"]) {
      form.elements.namedItem(key).setAttribute("aria-invalid", String(errors.some((e) => e.field === key)));
    }
    const problem = byId("validation-errors");
    problem.replaceChildren();
    problem.hidden = errors.length === 0;
    downloads.forEach((button) => { button.disabled = errors.length > 0; });
    if (errors.length) {
      const list = document.createElement("ul");
      for (const error of errors) {
        const item = document.createElement("li");
        item.textContent = error.message;
        list.append(item);
      }
      problem.append(list);
      current = null;
      byId("preview").innerHTML = "<p>Adjust the highlighted dimensions to regenerate geometry.</p>";
      byId("live-status").textContent = "HOLD — invalid parameters. No stale geometry or download is available.";
      byId("live-status").classList.add("warn");
      byId("metric-mass").textContent = "—";
      byId("metric-time").textContent = "—";
      byId("metric-cost").textContent = "—";
      byId("fit-strip").textContent = "Geometry must pass dimension checks before review files can be generated.";
      return;
    }
    current = E.model(p);
    const changed = Object.keys(p).some((k) => p[k] !== selected.params[k]);
    byId("design-name").textContent = `${selected.title}${changed ? " / custom" : ""}`;
    draw();
    byId("metric-mass").textContent = `${current.economics.solidMassG.toFixed(1)} g`;
    byId("metric-time").textContent = `${current.handling.minutes.toFixed(2)} min`;
    byId("metric-cost").textContent = `$${current.economics.displayedUnitUSD}`;
    const packHold = !current.pack.pass;
    const payloadHold = current.payload.applicable && !current.payload.pass;
    const edgePass = Object.values(current.meshChecks).every((c) => c.closedOrientedEdges);
    const holds = [
      ...(packHold ? ["packing envelope or mass HOLD"] : []),
      ...(payloadHold ? ["assumed card/token fit HOLD"] : [])
    ];
    byId("live-status").textContent = `${edgePass ? "✓" : "HOLD"} Nominal geometry ${edgePass ? "checked" : "needs review"} · ${p.clearance} mm centered side gap${holds.length ? ` · ${holds.join(" · ")}` : " · digital review only"}`;
    byId("live-status").classList.toggle("warn", holds.length > 0 || !edgePass);
    byId("fit-strip").innerHTML =
      `<strong>Clear bay widths</strong> ${current.bays.map((b) => E.number(b.width, 2)).join(" / ")} mm &nbsp; · &nbsp; <strong>Clear depth</strong> ${E.number(current.bays[0].depth)} mm<br>` +
      `<strong>Insert</strong> ${current.insertMM.map((v) => E.number(v)).join(" × ")} mm &nbsp; · &nbsp; <strong>Pack</strong> <span class="${packHold ? "hold-text" : ""}">${current.pack.pass ? "nominal pass" : "HOLD"} (${current.pack.packedMM.join(" × ")} mm incl. padding)</span>` +
      (current.payload.applicable ? `<br><strong>Assumed payload</strong> <span class="${payloadHold ? "hold-text" : ""}">${current.payload.pass ? "rectangle/circle containment passes" : "card/token envelope does not fit"}; physical retrieval and retention untested.</span>` : "");
    byId("download-status").textContent = holds.length
      ? "Review export remains available with HOLD findings in review.json. No fabrication approval."
      : "Everything stays local. No accounts, uploads, or background requests.";
  }

  function choosePreset(id) {
    selected = E.PRESETS.find((preset) => preset.id === id);
    for (const [key, value] of Object.entries(selected.params)) form.elements.namedItem(key).value = value;
    document.querySelectorAll("[data-preset]").forEach((button) => {
      const active = button.dataset.preset === id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    update();
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    byId("download-status").textContent = `Prepared ${filename} locally. Review-only; import STL coordinates as mm.`;
  }

  function filename(suffix) {
    const p = current.params;
    return `${selected.id}-${p.width}x${p.depth}x${p.height}-${suffix}`;
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", (event) => event.preventDefault());
  byId("reset").addEventListener("click", () => choosePreset(selected.id));
  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => choosePreset(button.dataset.preset)));
  byId("assembled").addEventListener("click", () => { exploded = false; draw(); });
  byId("exploded").addEventListener("click", () => { exploded = true; draw(); });
  byId("download-bundle").addEventListener("click", () => {
    if (current) download(filename("review.zip"), A.zip(A.reviewFiles(E, current)), "application/zip");
  });
  document.querySelectorAll("[data-download]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!current) return;
      const options = {
        tray: ["tray.stl", () => E.stl(current, "tray"), "model/stl"],
        insert: ["insert.stl", () => E.stl(current, "insert"), "model/stl"],
        drawing: ["drawing.svg", () => E.drawingSVG(current), "image/svg+xml"],
        bom: ["bom.csv", () => E.bomCSV(current), "text/csv"],
        parameters: ["parameters.json", () => E.parameterJSON(current), "application/json"]
      };
      const [suffix, generate, mime] = options[button.dataset.download];
      download(filename(suffix), generate(), mime);
    });
  });

  byId("comparison-body").innerHTML = E.PRESETS.map((preset) => {
    const m = E.model(preset.params);
    const percent = m.economics.solidMassG / E.model(E.BASE).economics.solidMassG * 100;
    return `<tr><th scope="row">${preset.title}<small>${m.params.bays} bays · 2 parts</small></th><td>${m.params.width} × ${m.params.depth} × ${m.params.height}</td><td>${m.economics.solidMassG.toFixed(2)} g<span class="material-bar" aria-hidden="true"><i style="width:${percent.toFixed(2)}%"></i></span></td><td>${m.handling.minutes.toFixed(2)} min</td><td>$${m.economics.displayedUnitUSD}</td><td><a href="generated/${preset.id}/review-bundle.zip" download aria-label="Download ${preset.title} review ZIP">ZIP ↓</a></td></tr>`;
  }).join("");
  choosePreset("stackline");
})();
