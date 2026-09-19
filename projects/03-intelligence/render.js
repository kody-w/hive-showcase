(function (root) {
  "use strict";

  const M = root.EvidenceModel;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const names = { experiment: "Experiment", observational: "Observational", benchmark: "Benchmark method", commercial: "Commercial report" };
  const stanceNames = { support: "+ Support", challenge: "− Challenge", context: "≈ Context" };
  const kindNames = { fact: "Reported finding", attribution: "Attributed claim", inference: "Inference", uncertainty: "Uncertainty", "missing-evidence": "Missing evidence" };
  const date = (value) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));

  function externalUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? escape(url.href) : "";
    } catch {
      return "";
    }
  }

  function claimLink(data, id, className = "mini-link") {
    const claim = M.claimById(data, id);
    return `<button type="button" class="${className}" data-claim="${escape(id)}">${escape(claim.title)}</button>`;
  }

  function sourceButton(data, id, locator = "") {
    const source = M.sourceById(data, id);
    return `<button type="button" class="citation-button" data-source="${escape(id)}"><strong><span class="source-code">${escape(source.label)}</span>${escape(source.shortTitle)}</strong><small>${escape(source.publisher)} · ${escape(date(source.publicationDate))}${locator ? "<br>" + escape(locator) : ""}</small></button>`;
  }

  function sourceNodes(data, state, claims) {
    const selectedClaim = state.selectedType === "claim" ? M.claimById(data, state.selectedId) : null;
    const related = new Set(selectedClaim?.citations.map((citation) => citation.sourceId) || []);
    return M.visibleSources(data, claims).map((source) => {
      const selected = state.selectedType === "source" && state.selectedId === source.id;
      return `<button type="button" class="node node-source${related.has(source.id) ? " related" : ""}" id="node-${escape(source.id)}" data-source="${escape(source.id)}" data-focus-key="node-${escape(source.id)}" aria-pressed="${selected}"><span class="node-top"><span class="source-code">${escape(source.label)}</span><span>${escape(source.publicationDate.slice(0, 4))} ↗</span></span><span class="node-title">${escape(source.shortTitle)}</span><span class="node-bottom">${escape(names[source.kind])} · ${escape(source.publisher)}</span></button>`;
    }).join("");
  }

  function claimNodes(data, state, claims) {
    return claims.map((claim) => {
      const selected = state.selectedType === "claim" && state.selectedId === claim.id;
      const related = state.selectedType === "source" && claim.citations.some((citation) => citation.sourceId === state.selectedId);
      const labels = claim.citations.map((citation) => M.sourceById(data, citation.sourceId).label).join(" · ");
      return `<button type="button" class="node node-claim ${escape(claim.stance)}${related ? " related" : ""}" id="node-${escape(claim.id)}" data-claim="${escape(claim.id)}" data-focus-key="node-${escape(claim.id)}" aria-pressed="${selected}"><span class="node-top"><span class="${escape(claim.stance)}">${escape(stanceNames[claim.stance])}</span><span>${escape(kindNames[claim.kind])}</span></span><span class="node-title">${escape(claim.title)}</span><span class="node-bottom">Citations: ${escape(labels)}</span></button>`;
    }).join("");
  }

  function claimInspector(bundle, claim) {
    const data = bundle.research;
    const tensions = data.contradictions.filter((item) => item.claimIds.includes(claim.id));
    return `<article data-inspected-claim="${escape(claim.id)}">
      <span class="stance-tag ${escape(claim.stance)}">${escape(stanceNames[claim.stance])}</span><span class="kind-tag">${escape(kindNames[claim.kind])}</span>
      <h2>${escape(claim.title)}</h2><p>${escape(claim.text)}</p>
      <h3>Interpretation, not an extra fact</h3><p>${escape(claim.implication)}</p>
      <p class="limitation-box"><strong>Boundary.</strong> ${escape(claim.limit)}</p>
      <h3>Trace to inspected sources</h3>${claim.citations.map((citation) => sourceButton(data, citation.sourceId, citation.locator)).join("")}
      ${tensions.length ? `<h3>Keep the tension visible</h3>${tensions.map((item) => `<div class="tension"><h4>${escape(item.title)}</h4><p>${escape(item.analysis)}</p>${item.claimIds.filter((id) => id !== claim.id).map((id) => claimLink(data, id)).join("")}<p><strong>What would resolve it:</strong> ${escape(item.resolutionObservation)}</p></div>`).join("")}` : ""}
    </article>`;
  }

  function sourceInspector(bundle, source) {
    const data = bundle.research;
    const capture = bundle.captures[source.id];
    const family = data.families.find((item) => item.id === source.familyId);
    const claims = data.claims.filter((claim) => claim.citations.some((citation) => citation.sourceId === source.id));
    const excerpts = capture.excerpts.filter((item) => item.found);
    return `<article data-inspected-source="${escape(source.id)}">
      <span class="kind-tag">${escape(source.label)} / ${escape(names[source.kind])}</span>
      <h2>${escape(source.title)}</h2>
      <p class="source-meta">${escape(source.authors || "Byline not preserved in fetched extract")}<br>${escape(source.publisher)} · ${escape(date(source.publicationDate))}<br>Retrieved ${escape(capture.retrievedAt.slice(0, 10))} UTC</p>
      <p class="source-meta">${escape(source.dateNote)}</p>
      <div class="source-actions"><a href="${externalUrl(source.url)}" target="_blank" rel="noopener noreferrer">Original source (online) ↗</a><a href="${escape(source.capture)}" target="_blank" rel="noopener">Saved capture ↗</a></div>
      <h3>What was inspected</h3><p>${escape(source.inspection)}</p>
      <h3>Method &amp; measured outcome</h3><p>${escape(source.method)}</p>
      <h3>Origin and independence</h3><p>${escape(source.interest)}</p><p class="limitation-box"><strong>${escape(family.label)}.</strong> ${escape(family.note)}</p>
      <h3>What this cannot establish</h3><ul>${source.limitations.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>
      <h3>Capture receipt</h3><div class="hash-receipt">Local capture SHA-256<code>${escape(bundle.receipt.sourceCaptureSha256[source.id])}</code>${capture.responseSha256 ? `Raw response SHA-256<code>${escape(capture.responseSha256)}</code>` : `<p>Raw response bytes were not exposed by the successful fetch tool. No body hash or HTTP status is invented.</p>`}</div>
      <details><summary>Short saved source excerpts (${excerpts.length})</summary><p>Exact, bounded fragments—not a full-page archive. Open the source for surrounding context. All analysis above is paraphrased.</p>${excerpts.map((item) => `<blockquote>${escape(item.text)}</blockquote><span class="excerpt-label">${escape(item.id)} · ${escape(item.locator || "normalized text characters " + item.startCharacter + "–" + item.endCharacter)}</span>`).join("")}</details>
      <h3>Claims using this source</h3>${claims.map((claim) => claimLink(data, claim.id)).join("")}
    </article>`;
  }

  function inspector(bundle, state) {
    if (!state.selectedId) return '<h2>No claim selected</h2><p>Reset or adjust the filters to inspect a claim and its sources. The verdict has not changed.</p>';
    return state.selectedType === "source"
      ? sourceInspector(bundle, M.sourceById(bundle.research, state.selectedId))
      : claimInspector(bundle, M.claimById(bundle.research, state.selectedId));
  }

  function strongestCases(data) {
    return data.strongestCases.map((item, index) => `<article class="argument ${index === 0 ? "support" : "challenge"}"><p class="eyebrow">${index === 0 ? "BUILD THE BEST CASE" : "KEEP THE BEST OBJECTION"}</p><h2>${escape(item.label)}</h2><p>${escape(item.text)}</p><div class="citation-chips">${item.claimIds.map((id) => claimLink(data, id, "citation-chip")).join("")}</div></article>`).join("");
  }

  function scenarioMessage(gateIds, protocol) {
    const result = M.counterfactual(gateIds, protocol);
    return result.allMet
      ? "Counterfactual only: if one independently inspected, same-period case supplied every gate, bounded existence would be demonstrated. This has NOT happened in the reviewed evidence. The actual verdict is unchanged."
      : `${result.supplied} of ${result.total} hypothetical conditions supplied. All seven are jointly required. These checkboxes are not observations; the actual verdict remains conditionally plausible, not established.`;
  }

  function gates(bundle, state) {
    const data = bundle.research;
    const protocol = bundle.protocol;
    const gateCards = protocol.gates.map((gate, index) => {
      const assessment = data.gateAssessments.find((item) => item.gateId === gate.id);
      return `<article class="gate-card" id="${escape(gate.id)}"><span class="gate-number">GATE ${String(index + 1).padStart(2, "0")}</span><h3>${escape(gate.label)}</h3><span class="gate-status">Not established in this corpus</span><p><strong>Required observation:</strong> ${escape(gate.requiredObservation)}</p><p>${escape(assessment.note)}</p>${assessment.claimIds.map((id) => claimLink(data, id)).join("")}</article>`;
    }).join("");
    const rows = data.businessCases.map((item) => `<tr><td>${escape(item.label)}<small>${escape(item.note)}</small>${item.sourceIds.map((id) => `<button type="button" class="mini-link" data-source="${escape(id)}">${escape(M.sourceById(data, id).label)} · Inspect source</button>`).join("")}</td>${protocol.gates.map((gate) => `<td class="cell-${escape(item.gates[gate.id])}">${escape(item.gates[gate.id])}</td>`).join("")}</tr>`).join("");
    const directions = { upgrade: "Upgrade the existence claim", downgrade: "Withdraw the tested-profile advice", broaden: "Consider wider transfer" };
    return `<div class="section-intro"><p class="eyebrow">THE PRE-COLLECTION STANDARD</p><h2>Seven gates. One operating period.</h2><p>We defined “solo,” “useful,” “most” and “business” before searching. A single independently corroborated case meeting all gates for the same six months would establish bounded existence. Zero complete cases in this corpus is a missing-evidence result—not a claim that no such business exists.</p></div>
      <div class="gate-grid">${gateCards}</div>
      <div class="case-table"><table><caption>Commercial leads are not complete operating records</caption><thead><tr><th scope="col">Inspected lead</th>${protocol.gates.map((gate, index) => `<th scope="col">${index + 1}. ${escape(gate.label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
      <details class="scenario" id="scenario-panel"><summary>Explore a counterfactual—not a new observation</summary><p>Imagine one future, independently inspected record bundle. These local checkboxes never edit the research JSON, certify a company or change the actual assessment.</p><fieldset><legend>Hypothetical supplied evidence, same six-month period</legend>${protocol.gates.map((gate) => `<label for="scenario-${escape(gate.id)}"><input type="checkbox" id="scenario-${escape(gate.id)}" data-gate-toggle="${escape(gate.id)}"${state.hypotheticalGates.includes(gate.id) ? " checked" : ""}>${escape(gate.label)}</label>`).join("")}</fieldset><p id="scenario-result" class="scenario-result" role="status" aria-live="polite">${escape(scenarioMessage(state.hypotheticalGates, protocol))}</p><button type="button" id="reset-scenario">Reset hypothetical inputs</button></details>
      <section class="reversals"><h2>Specific observations that would change the answer</h2><div class="reversal-grid">${protocol.reversalConditions.map((item) => `<article class="reversal-card" id="${escape(item.id)}"><span class="kind-tag">${escape(item.id)} · Not observed</span><h3>${escape(directions[item.direction])}</h3><p>${escape(item.observation)}</p><p class="effect">${escape(item.effect)}</p></article>`).join("")}</div></section>`;
  }

  function method(bundle) {
    const data = bundle.research;
    const protocol = bundle.protocol;
    const hypotheses = protocol.hypotheses.map((item) => {
      const assessment = data.hypothesisAssessments.find((entry) => entry.hypothesisId === item.id);
      return `<h4>${escape(item.label)}</h4><p><strong>Predicted before collection:</strong> ${escape(item.predicts)}</p><p><strong>Assessment:</strong> ${escape(assessment.assessment)}</p><p><strong>Supporting observations:</strong></p>${assessment.supportClaimIds.map((id) => claimLink(data, id)).join("")}<p><strong>Challenge / alternative:</strong></p>${assessment.challengeClaimIds.map((id) => claimLink(data, id)).join("")}<p><strong>Non-discriminating:</strong></p>${assessment.nonDiscriminatingClaimIds.map((id) => claimLink(data, id)).join("")}<p>${escape(assessment.limit)}</p><p><strong>Would weaken it:</strong> ${escape(item.disconfirmer)}</p>`;
    }).join("");
    return `<div class="section-intro"><p class="eyebrow">PROVENANCE BEFORE PERSUASION</p><h2>The rules came before the answer.</h2><p>This is original public research extending an inert, synthetic seed. It is not the seed’s example dressed up as a new finding, and no organization was activated. The procedure was committed locally before public collection; that is not an externally preregistered study.</p></div>
      <div class="method-grid"><div>
        <article class="method-card"><h3>Operational definitions</h3><p>These are declared decision rules, not industry standards. Different founders can choose different floors—but not after seeing results in this review.</p><dl>${protocol.definitions.map((item) => `<dt id="definition-${escape(item.id)}">${escape(item.term)}</dt><dd>${escape(item.meaning)}</dd>`).join("")}</dl></article>
        <article class="method-card"><h3>Competing explanations</h3>${hypotheses}</article>
      </div><div>
        <article class="method-card"><h3>Locked local protocol</h3><p class="lock-receipt">Committed 19 Sep 2026, 01:16:43 UTC<br>8b58d0e81935da505f8dc0878e8230277c8aa557<br><br>Protocol SHA-256<br>${escape(bundle.receipt.protocolSha256)}</p><p><a href="research/protocol.json">Read the original protocol</a> · <a href="research/protocol-lock.json">Inspect lock receipt</a></p><p>No amendments were made after collection. Source discovery is not evidence; incorrect search summaries were discarded after primary inspection.</p><p><a href="research/collection-log.json">Read the bounded collection log</a></p></article>
        <article class="method-card"><h3>Nine documents, six families</h3><p>Family labels track shared origins, not statistical independence. Documents are not votes and claim counts are not probabilities.</p><ul class="family-list">${data.families.map((item) => `<li><strong>${escape(item.label)}.</strong> ${escape(item.note)}</li>`).join("")}</ul></article>
        <article class="method-card"><span class="synthetic-label">SEPARATE BASELINE / SYNTHETIC</span><h3>The seed stays in its lane</h3><p>The fictional Juniper Queue case contains five source CSVs, eighteen authored records, nine coded claims and three conflicts. Its original question concerns a disconnected kiosk—not solo AI businesses.</p><p>Twenty-one reviewed data/license files were copied and checked against the parent’s exact byte inventory. No downloaded seed code was executed. No synthetic source appears in this evidence map.</p><p><a href="evidence/seed-inputs.json">Input hashes and row IDs</a> · <a href="inputs/seed/LICENSE">MIT attribution</a></p><p>Collection, analysis, competing-hypotheses, verification and briefing roles were translated into local research checks. No actual team, collaborators or accepted handoffs are claimed.</p></article>
      </div></div>
      <section class="limits-section"><h2>What this work does not know</h2><ol>${data.limitations.map((item) => `<li>${escape(item)}</li>`).join("")}</ol><p><a href="evidence/integrity.json">Reproducible local hashes</a> · <a href="evidence/result.json">Executed checks</a> · <a href="research/evidence.json">Machine-readable claims and sources</a></p></section>`;
  }

  root.EvidenceRender = Object.freeze({
    escape, externalUrl, sourceNodes, claimNodes, claimInspector, sourceInspector,
    inspector, strongestCases, scenarioMessage, gates, method,
  });
})(globalThis);
