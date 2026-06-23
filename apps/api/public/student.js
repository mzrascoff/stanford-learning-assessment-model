// Real student-facing session client. Drives the same REST flow the MCP agent
// uses (exchange install token → start → prompts → response/confidence/
// reflection → complete → report), rendered as a guided chat.

const els = {
  heroTitle: document.querySelector("#hero-title"),
  heroLede: document.querySelector("#hero-lede"),
  identityPill: document.querySelector("#identity-pill"),
  timerPill: document.querySelector("#timer-pill"),
  joinPanel: document.querySelector("#join-panel"),
  installToken: document.querySelector("#install-token"),
  joinButton: document.querySelector("#join-button"),
  joinError: document.querySelector("#join-error"),
  sessionPanel: document.querySelector("#session-panel"),
  transcript: document.querySelector("#transcript"),
  composer: document.querySelector("#composer"),
  responseLabel: document.querySelector("#response-label"),
  responseInput: document.querySelector("#response-input"),
  reflectionInput: document.querySelector("#reflection-input"),
  confidenceDots: document.querySelector("#confidence-dots"),
  sendButton: document.querySelector("#send-button"),
  sessionError: document.querySelector("#session-error"),
  finishArea: document.querySelector("#finish-area"),
  finishButton: document.querySelector("#finish-button"),
  reportPanel: document.querySelector("#report-panel"),
  reportSummary: document.querySelector("#report-summary"),
  reportCard: document.querySelector("#report-card")
};

const state = {
  accessToken: null,
  assessment: null,
  session: null,
  currentPrompt: null,
  confidence: 4,
  timerHandle: null
};

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(state.accessToken ? { authorization: `Bearer ${state.accessToken}` } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `Request failed (${response.status})`);
  }
  return response.json();
}

function bubble(kind, who, text) {
  const node = document.createElement("div");
  node.className = `bubble ${kind}`;
  node.innerHTML = `<span class="who">${who}</span>`;
  node.appendChild(document.createTextNode(text));
  els.transcript.appendChild(node);
  node.scrollIntoView({ behavior: "smooth", block: "end" });
  return node;
}

function metaChip(text) {
  const node = document.createElement("div");
  node.className = "meta-chip";
  node.textContent = text;
  els.transcript.appendChild(node);
  node.scrollIntoView({ behavior: "smooth", block: "end" });
}

function buildConfidenceDots() {
  els.confidenceDots.innerHTML = "";
  for (let value = 1; value <= 5; value += 1) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "dot";
    dot.textContent = String(value);
    dot.setAttribute("aria-pressed", String(value === state.confidence));
    dot.addEventListener("click", () => {
      state.confidence = value;
      [...els.confidenceDots.children].forEach((child, index) =>
        child.setAttribute("aria-pressed", String(index + 1 === value))
      );
    });
    els.confidenceDots.appendChild(dot);
  }
}

function startTimer() {
  const tick = async () => {
    try {
      const remaining = await api(`/time-remaining/${state.session.id}`, { method: "GET" });
      const mins = Math.floor(remaining.secondsRemaining / 60);
      const secs = remaining.secondsRemaining % 60;
      els.timerPill.hidden = false;
      els.timerPill.textContent = `⏱ ${mins}:${String(secs).padStart(2, "0")} remaining`;
    } catch {
      /* non-fatal */
    }
  };
  tick();
  state.timerHandle = setInterval(tick, 15000);
}

async function join() {
  els.joinError.textContent = "";
  const token = els.installToken.value.trim();
  if (!token) {
    els.joinError.textContent = "Enter the install token from your instructor's link.";
    return;
  }
  els.joinButton.disabled = true;
  try {
    const exchanged = await api("/device-links/exchange", {
      method: "POST",
      body: JSON.stringify({ installToken: token, clientName: "SLAM Web Learner" })
    });
    state.accessToken = exchanged.accessToken;
    const actor = exchanged.actor;
    els.identityPill.hidden = false;
    els.identityPill.textContent = `● ${actor.studentName ?? actor.displayName ?? "Learner"}`;

    const instructions = await api(
      `/instructions${actor.assessmentId ? `?assessmentId=${encodeURIComponent(actor.assessmentId)}` : ""}`,
      { method: "GET" }
    );
    state.assessment = await api(`/assessments/${actor.assessmentId}`, { method: "GET" });

    els.joinPanel.classList.add("hidden");
    els.sessionPanel.classList.remove("hidden");
    els.heroTitle.textContent = state.assessment.title;
    els.heroLede.textContent = "Formative session in progress. Reports are advisory and cite evidence.";

    bubble("assistant", "SLAM", instructions.instructions);
    buildConfidenceDots();

    state.session = await api("/sessions", {
      method: "POST",
      body: JSON.stringify({ assessmentId: actor.assessmentId })
    });
    startTimer();
    await advancePrompt();
  } catch (error) {
    els.joinError.textContent = error.message;
    els.joinButton.disabled = false;
  }
}

async function advancePrompt() {
  const result = await api(`/sessions/${state.session.id}/next-prompt`, { method: "POST" });
  state.session = result.session;
  state.currentPrompt = result.prompt;

  if (!result.prompt) {
    els.composer.classList.add("hidden");
    els.finishArea.classList.remove("hidden");
    bubble("assistant", "SLAM", "That's the last prompt. When you're ready, submit your session for formative review.");
    return;
  }

  const isReflection = result.prompt.responseType === "reflection";
  bubble("assistant", `Prompt ${state.session.currentPromptIndex + 1}`, result.prompt.prompt);
  if (result.prompt.guidance) {
    const g = document.createElement("div");
    g.className = "bubble guidance";
    g.textContent = `Guidance: ${result.prompt.guidance}`;
    els.transcript.appendChild(g);
  }
  els.responseLabel.firstChild.textContent = isReflection ? "Your reflection" : "Your response";
  els.responseInput.placeholder = isReflection
    ? "Name your confidence, what's uncertain, and your next verification step…"
    : "Write your response to the prompt…";
  els.responseInput.value = "";
  els.reflectionInput.value = "";
  state.confidence = 4;
  buildConfidenceDots();
}

async function send() {
  els.sessionError.textContent = "";
  const content = els.responseInput.value.trim();
  if (!content) {
    els.sessionError.textContent = "Add a response before continuing.";
    return;
  }
  els.sendButton.disabled = true;
  try {
    const prompt = state.currentPrompt;
    bubble("learner", "You", content);

    if (prompt.responseType === "reflection") {
      await api(`/sessions/${state.session.id}/reflections`, {
        method: "POST",
        body: JSON.stringify({ content, focus: "monitoring" })
      });
    } else {
      await api(`/sessions/${state.session.id}/responses`, {
        method: "POST",
        body: JSON.stringify({ promptId: prompt.id, content })
      });
    }

    await api(`/sessions/${state.session.id}/confidence`, {
      method: "POST",
      body: JSON.stringify({ promptId: prompt.id, value: state.confidence })
    });
    metaChip(`Confidence ${state.confidence}/5 recorded`);

    const reflection = els.reflectionInput.value.trim();
    if (reflection && prompt.responseType !== "reflection") {
      await api(`/sessions/${state.session.id}/reflections`, {
        method: "POST",
        body: JSON.stringify({ content: reflection, focus: "monitoring" })
      });
      metaChip("Reflection saved");
    }

    await advancePrompt();
  } catch (error) {
    els.sessionError.textContent = error.message;
  } finally {
    els.sendButton.disabled = false;
  }
}

async function finish() {
  els.finishButton.disabled = true;
  try {
    if (state.timerHandle) clearInterval(state.timerHandle);
    await api(`/sessions/${state.session.id}/complete`, { method: "POST" });
    bubble("assistant", "SLAM", "Session submitted. Generating your evidence-based report…");
    const report = await api(`/reports/student/${state.session.id}`, { method: "GET" });
    renderReport(report);
  } catch (error) {
    els.sessionError.textContent = error.message;
    els.finishButton.disabled = false;
  }
}

function renderReport(report) {
  els.reportPanel.classList.remove("hidden");
  els.reportSummary.textContent = report.overallSummary;
  els.reportCard.innerHTML = "";
  for (const dimension of report.dimensionResults) {
    const card = document.createElement("div");
    card.className = "dimension";
    const evidence = dimension.evidence[0];
    card.innerHTML = `
      <span class="score">${dimension.score}/${dimension.scaleMax}</span>
      <h3 style="margin:0 0 0.2rem">${dimension.label}</h3>
      <p class="hint" style="margin:0">${dimension.category} · confidence ${Math.round(dimension.confidence * 100)}%</p>
      <p style="margin:0.5rem 0 0">${dimension.summary}</p>
      <strong style="font-size:0.85rem">Next steps</strong>
      <ul>${dimension.nextSteps.map((step) => `<li>${step}</li>`).join("")}</ul>
      ${evidence ? `<div class="evidence">“${evidence.quote}”</div>` : ""}
    `;
    els.reportCard.appendChild(card);
  }
  els.reportPanel.scrollIntoView({ behavior: "smooth" });
}

els.joinButton.addEventListener("click", join);
els.sendButton.addEventListener("click", send);
els.finishButton.addEventListener("click", finish);

const fromQuery = new URLSearchParams(location.search).get("installToken");
if (fromQuery) {
  els.installToken.value = fromQuery;
}
buildConfidenceDots();
