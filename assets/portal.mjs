const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

async function readJSON(url, allowMissing = false) {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 404 && allowMissing) return null;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function projectCard(spec, manifest, checks, error) {
  const card = element("article", undefined, `card project${spec.id === "10-pocket-arcade" ? " featured" : ""}`);
  card.dataset.project = spec.id;
  const top = element("div", undefined, "project-top");
  top.append(element("span", spec.id.slice(0, 2), "project-number"), element("span", spec.tag, "badge"));
  card.append(top, element("h3", spec.title), element("p", manifest?.summary || spec.summary));
  let label = "Awaiting integration";
  let stateClass = "muted";
  if (error) {
    label = `Artifact error: ${error.message}`;
    stateClass = "error";
  } else if (manifest) {
    label = checks?.status === "passed"
      ? "Local artifact / recorded checks passed / review pending"
      : checks?.status === "failed"
        ? "Local artifact / recorded check failure"
        : "Local artifact / checks not yet recorded";
    stateClass = checks?.status === "failed" ? "error" : "success";
  }
  card.append(element("p", label, `project-state ${stateClass}`));
  const links = element("div", undefined, "project-links");
  if (manifest && !error) {
    const open = element("a", "Open demo", "open");
    open.href = manifest.entrypoint;
    const evidence = element("a", "Evidence");
    evidence.href = `projects/${spec.id}/evidence/result.json`;
    const details = element("a", "Manifest");
    details.href = `projects/${spec.id}/manifest.json`;
    links.append(open, evidence, details);
  } else {
    links.append(element("span", "No completion claimed.", "muted"));
  }
  card.append(links);
  return card;
}

async function refresh() {
  const button = document.getElementById("refresh");
  const status = document.getElementById("load-status");
  button.disabled = true;
  status.className = "muted";
  status.textContent = "Reading local artifacts...";
  try {
    const [catalog, provenance, report] = await Promise.all([
      readJSON("assets/catalog.json"),
      readJSON("evidence/seed-verification.json"),
      readJSON("evidence/check-results.json", true),
    ]);
    if (!Array.isArray(catalog) || catalog.length !== 10) throw new Error("Expected exactly ten catalog entries.");
    const checks = new Map((report?.projects || []).map((item) => [item.id, item]));
    const projects = await Promise.all(catalog.map(async (spec) => {
      try {
        const manifest = await readJSON(`projects/${spec.id}/manifest.json`, true);
        if (manifest && (manifest.id !== spec.id ||
            manifest.seedSlug !== spec.seedSlug ||
            manifest.entrypoint !== `projects/${spec.id}/index.html` ||
            manifest.stage !== "work-produced")) {
          throw new Error("Manifest identity, entrypoint, or stage does not match its project.");
        }
        return { spec, manifest, error: null };
      } catch (error) {
        return { spec, manifest: null, error };
      }
    }));
    const grid = document.getElementById("project-grid");
    grid.replaceChildren(...projects.map(({ spec, manifest, error }) =>
      projectCard(spec, manifest, checks.get(spec.id), error)));
    const integrated = projects.filter((item) => item.manifest && !item.error).length;
    const failed = projects.filter((item) => item.error).length;
    const passed = projects.filter((item) => item.manifest && checks.get(item.spec.id)?.status === "passed").length;
    document.getElementById("artifact-count").textContent = `${integrated} / 10`;
    document.getElementById("seed-count").textContent = String(provenance.seeds.filter((seed) => seed.stage === "seed-verified").length);
    document.getElementById("check-count").textContent = `${passed} / 10`;
    status.textContent = failed
      ? `${failed} artifact error(s). Details are shown on the affected cards.`
      : `${integrated} local project manifests available. Recorded checks are historical evidence, not human acceptance.`;
    status.className = failed ? "error" : "muted";
  } catch (error) {
    status.textContent = `Cannot load showcase: ${error.message}`;
    status.className = "error";
  } finally {
    button.disabled = false;
  }
}

document.getElementById("refresh").addEventListener("click", refresh);
refresh();
