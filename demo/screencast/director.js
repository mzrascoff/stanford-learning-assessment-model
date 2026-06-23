// Screencast director: runs the real SLAM REST flow live and choreographs it
// into timed, captioned scenes. Served same-origin from /demo/ so all fetches
// hit the running API with no CORS friction.

const API = (location.protocol === "file:" ? "http://localhost:4000" : location.origin) + "/api";
const INSTRUCTOR_TOKEN = new URLSearchParams(location.search).get("token") || "slam-dev-instructor-token";
const CANCEL = Symbol("cancel");

const $ = (sel) => document.querySelector(sel);
const el = {
  url: $("#url"), stage: $("#stage"), tag: $("#scene-tag"), caption: $("#caption"),
  bar: $("#bar"), time: $("#time"), status: $("#status"),
  play: $("#btn-play"), restart: $("#btn-restart")
};

let run = null;       // current run token { cancelled }
let paused = false;
let elapsed = 0;

setInterval(() => {
  if (!run || run.cancelled || paused) return;
  elapsed += 200;
  el.time.textContent = fmt(elapsed);
}, 200);

function fmt(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Progress tracks scene completion, so the bar is honest regardless of how
// fast the live API responds.
function setProgress(fraction) {
  el.bar.style.width = `${Math.round(fraction * 100)}%`;
}

function wait(ms) {
  return new Promise((resolve, reject) => {
    let left = ms;
    const id = setInterval(() => {
      if (!run || run.cancelled) { clearInterval(id); reject(CANCEL); return; }
      if (!paused) { left -= 60; if (left <= 0) { clearInterval(id); resolve(); } }
    }, 60);
  });
}

async function api(path, opts = {}, token) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

function scene(key) {
  for (const node of el.stage.querySelectorAll(".scene")) node.classList.toggle("active", node.dataset.scene === key);
}
function say(tag, text) { el.tag.textContent = tag; el.caption.textContent = text; }
function setUrl(u) { el.url.textContent = u; }

async function type(node, text, perChar = 16) {
  node.textContent = "";
  node.classList.add("cursor");
  for (const ch of text) {
    if (!run || run.cancelled) throw CANCEL;
    if (paused) { await wait(60); }
    node.textContent += ch;
    await wait(perChar);
  }
  node.classList.remove("cursor");
}

function bubble(host, kind, who, text) {
  const node = document.createElement("div");
  node.className = `bubble ${kind}`;
  if (who) node.innerHTML = `<span class="who">${who}</span>`;
  host.appendChild(node);
  host.scrollTop = host.scrollHeight;
  return node;
}
function chip(host, text, cls = "metachip") {
  const node = document.createElement("div");
  node.className = cls;
  node.textContent = text;
  host.appendChild(node);
  host.scrollTop = host.scrollHeight;
  return node;
}

// ---- the choreographed run ----
async function sequence() {
  // Scene 1 — title
  scene("title"); setUrl("localhost:4000"); setProgress(0.02);
  say("Intro", "SLAM turns an AI-enabled learning task into formative, evidence-based assessment — no grades.");
  await wait(6500);

  // Scene 2 — teacher: create
  scene("teacher-create"); setUrl("localhost:4000  ·  Instructor console"); setProgress(0.16);
  say("Teacher · Setup", "An instructor signs in and defines an outcome-aligned assessment.");
  const dims = await api("/starter-dimensions", { method: "GET" });
  const picked = [dims.find((d) => d.category === "cognitive"), dims.find((d) => d.category === "metacognitive")].filter(Boolean);
  await wait(800);
  await type($("#f-title"), "EDUC 240 — Outcomes Evidence Memo");
  $("#f-mode").textContent = "Guided · 20 minutes";
  await wait(500);
  $("#f-dims").innerHTML = picked.map((d) => `<span class="chip">${d.label} · ${d.category}</span>`).join(" ");
  say("Teacher · Setup", "Pick cognitive and metacognitive rubric dimensions — SLAM measures reasoning and calibration.");
  await wait(2600);
  const assessment = await api("/assessments", {
    method: "POST",
    body: JSON.stringify({
      title: "EDUC 240 — Outcomes Evidence Memo", courseId: "course-demo", durationMinutes: 20,
      deliveryMode: "guided", feedbackVisibility: "instructor_and_student", rubricDimensions: picked, promptSequence: []
    })
  }, INSTRUCTOR_TOKEN);
  $("#f-submit").classList.add("pressed");
  say("Teacher · Setup", "On create, SLAM scaffolds starter prompts and a cited rubric automatically.");
  await type($("#f-prompts"), assessment.promptSequence.map((p, i) => `${i + 1}. ${p.prompt}`).join("\n"), 6);
  $("#assessment-list").innerHTML =
    `<div class="asset"><h3>${assessment.title}</h3>` +
    `<p class="meta">${assessment.deliveryMode} · ${assessment.durationMinutes} min · ${assessment.rubricDimensions.length} dimensions · v${assessment.version}</p></div>`;
  await wait(2600);

  // Scene 3 — teacher: publish
  scene("teacher-publish"); setUrl("localhost:4000  ·  Instructor console"); setProgress(0.34);
  $("#publish-list").innerHTML =
    `<div class="asset"><h3>${assessment.title}</h3><p class="meta">${assessment.deliveryMode} · ${assessment.durationMinutes} min</p>` +
    `<div style="margin-top:.5rem"><button class="btn" id="pub-btn">Publish link</button></div></div>`;
  say("Teacher · Share", "One click mints a single-use install link to hand to learners.");
  await wait(1600);
  $("#pub-btn").classList.add("pressed");
  const published = await api(`/assessments/${assessment.id}/publish`, {
    method: "POST", body: JSON.stringify({ studentName: "Jordan Rivera", expiresInDays: 7 })
  }, INSTRUCTOR_TOKEN);
  const installToken = published.installToken.token;
  $("#publish-out").innerHTML =
    `<div class="asset"><h3>Install link ready</h3>` +
    `<p class="meta">Expires ${new Date(published.installToken.expiresAt).toLocaleDateString()} · single use</p>` +
    `<p class="install-link">${published.downloadUrl}</p>` +
    `<p class="meta">Token binds the learner to this assessment + tenant.</p></div>`;
  await wait(3200);

  // Scene 4 — student session
  scene("student"); setUrl("localhost:4000/student.html  ·  Learner"); setProgress(0.50);
  say("Learner · Session", "The learner opens the link — it exchanges the install token for a scoped session.");
  const chat = $("#chat"); const side = $("#student-side"); chat.innerHTML = ""; side.innerHTML = "";
  const toolLog = (name) => chip(side, `▸ ${name}  ✓`, "chip");
  side.innerHTML = `<p class="meta" style="color:var(--muted)">Each learner action maps to an MCP tool the AI client calls:</p>`;

  const exchanged = await api("/device-links/exchange", {
    method: "POST", body: JSON.stringify({ installToken, clientName: "SLAM Web Learner" })
  });
  const ST = exchanged.accessToken;
  toolLog("exchange_install_token");
  const instructions = await api(`/instructions?assessmentId=${assessment.id}`, { method: "GET" }, ST);
  let session = await api("/sessions", { method: "POST", body: JSON.stringify({ assessmentId: assessment.id }) }, ST);
  toolLog("start_assessment");
  await type(bubble(chat, "assistant", "SLAM"), instructions.instructions.split("\n").slice(0, 2).join(" — "), 8);
  await wait(900);

  const answers = [
    "The section is only partly meeting the outcome: the claim–evidence pass rate is 58%, and first-gen students trail continuing-gen (64% vs 78%). Because lab-note completion is high (91%), the gap looks like reasoning support, not effort — so I recommend a calibrated re-assessment with worked exemplars.",
    "I'm fairly confident in the gap, but uncertain whether the 58% reflects the rubric or the prompt wording. I'd verify by re-scoring a sample with a second rater before advising the committee."
  ];

  for (let i = 0; ; i += 1) {
    const next = await api(`/sessions/${session.id}/next-prompt`, { method: "POST" }, ST);
    toolLog("next_prompt");
    session = next.session;
    if (!next.prompt) break;
    const p = next.prompt;
    await type(bubble(chat, "assistant", `Prompt ${session.currentPromptIndex + 1}`), p.prompt, 9);
    if (p.guidance) chip(chat, `Guidance: ${p.guidance}`, "bubble guidance");
    await wait(700);
    say("Learner · Session", p.responseType === "reflection" ? "Reflection prompts capture monitoring and calibration." : "The learner responds with a claim grounded in evidence.");
    await type(bubble(chat, "learner", "Jordan"), answers[i] ?? answers[answers.length - 1], 8);

    if (p.responseType === "reflection") {
      await api(`/sessions/${session.id}/reflections`, { method: "POST", body: JSON.stringify({ content: answers[i] ?? answers[1], focus: "monitoring" }) }, ST);
      toolLog("submit_reflection");
    } else {
      await api(`/sessions/${session.id}/responses`, { method: "POST", body: JSON.stringify({ promptId: p.id, content: answers[i] ?? answers[0] }) }, ST);
      toolLog("submit_response");
    }

    const dots = chip(chat, "", "metachip");
    dots.innerHTML = `Confidence: <span class="dots">${[1, 2, 3, 4, 5].map((n) => `<i data-n="${n}">${n}</i>`).join("")}</span>`;
    for (let n = 1; n <= 4; n += 1) { dots.querySelector(`[data-n="${n}"]`).classList.add("on"); await wait(160); }
    await api(`/sessions/${session.id}/confidence`, { method: "POST", body: JSON.stringify({ promptId: p.id, value: 4 }) }, ST);
    toolLog("record_confidence");
    await wait(1100);
  }

  // Scene 5 — submit + reports
  scene("reports"); setUrl("localhost:4000  ·  Reports"); setProgress(0.80);
  say("Insight · Report", "Submitting runs the evaluator: scores with cited evidence, confidence, and next steps.");
  session = await api(`/sessions/${session.id}/complete`, { method: "POST" }, ST);
  const report = await api(`/reports/student/${session.id}`, { method: "GET" }, ST);
  const out = $("#report-out");
  out.innerHTML = `<p class="meta" style="color:var(--muted)">${report.overallSummary}</p>`;
  for (const d of report.dimensionResults) {
    const ev = d.evidence[0];
    const card = document.createElement("div");
    card.className = "dimension";
    card.innerHTML =
      `<span class="score">${d.score}/${d.scaleMax}</span><h3>${d.label}</h3>` +
      `<p class="meta" style="color:var(--muted)">${d.category} · evaluator confidence ${Math.round(d.confidence * 100)}%</p>` +
      `<p style="margin:.4rem 0 0">Next: ${d.nextSteps[0]}</p>` +
      (ev ? `<div class="evidence">“${ev.quote}”</div>` : "");
    out.appendChild(card);
    await wait(900);
  }

  await wait(800);
  say("Insight · Class", "The instructor sees class aggregates and exports row-level evidence for program assessment.");
  const cls = await api(`/reports/class/${assessment.id}`, { method: "GET" }, INSTRUCTOR_TOKEN);
  const csv = await api(`/reports/export/${assessment.id}?format=csv`, { method: "GET" }, INSTRUCTOR_TOKEN);
  const classOut = $("#class-out");
  classOut.innerHTML =
    `<div class="asset"><h3>Class report</h3><p class="meta">${cls.sessionCount} session(s) evaluated</p>` +
    cls.aggregateDimensions.map((a) => `<div style="margin-top:.4rem">${a.label} — avg <b>${a.averageScore}</b> · confidence ${a.averageConfidence}</div>`).join("") +
    `</div>`;
  const csvBox = document.createElement("div");
  csvBox.className = "csv";
  classOut.appendChild(csvBox);
  await type(csvBox, csv.body.split("\n").slice(0, 3).join("\n"), 4);
  await wait(2600);

  // Scene 6 — outro
  scene("outro"); setUrl("localhost:4000"); setProgress(1);
  say("Wrap", "Setup → guided session → cited reports. Teacher console, learner session, and MCP — one workflow.");
  await wait(6000);
  el.status.textContent = "Demo complete — press ↻ Restart to replay.";
}

async function play() {
  run = { cancelled: false };
  paused = false; elapsed = 0;
  el.play.textContent = "⏸ Pause"; el.status.textContent = "Live against the running API.";
  el.bar.style.width = "0%"; el.time.textContent = "0:00";
  try {
    await sequence();
  } catch (e) {
    if (e !== CANCEL) {
      el.status.textContent = "";
      say("Error", `Demo could not reach the API: ${e.message}. Open this via http://localhost:4000/demo/ with the API running.`);
    }
  }
}

el.play.addEventListener("click", () => {
  paused = !paused;
  el.play.textContent = paused ? "▶ Play" : "⏸ Pause";
});
el.restart.addEventListener("click", () => {
  if (run) run.cancelled = true;
  setTimeout(play, 120);
});

play();
