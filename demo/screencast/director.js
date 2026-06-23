// Screencast director: runs the real SLAM REST flow live and choreographs it
// into timed, captioned scenes. Served same-origin from /demo/ so all fetches
// hit the running API with no CORS friction.

import { cannedApi, resetCanned } from "./canned-data.js";

const API = (location.protocol === "file:" ? "http://localhost:4000" : location.origin) + "/api";
const INSTRUCTOR_TOKEN = new URLSearchParams(location.search).get("token") || "slam-dev-instructor-token";
// Static hosts (e.g. GitHub Pages) have no SLAM backend, so replay canned
// responses instead of hitting the API. `?static` forces it anywhere.
const STATIC = location.hostname.endsWith("github.io") || new URLSearchParams(location.search).has("static");
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
  if (STATIC) {
    await wait(180); // a touch of latency so the choreography reads naturally
    return cannedApi(path, opts);
  }
  try {
    const res = await fetch(API + path, {
      ...opts,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) }
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 120)}`);
    return res.json();
  } catch (error) {
    // If the live API is unreachable, fall back to canned data so the demo
    // still plays rather than dead-ending on a network error.
    if (error === CANCEL) throw error;
    return cannedApi(path, opts);
  }
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

// A Claude chat message. Assistant messages get the ✳ avatar; the returned
// node is the text body so type() can stream into it.
function claudeMsg(host, role) {
  const node = document.createElement("div");
  node.className = `cmsg ${role}`;
  if (role === "assistant") node.innerHTML = `<span class="av">✳</span><span class="body"></span>`;
  host.appendChild(node);
  host.scrollTop = host.scrollHeight;
  return role === "assistant" ? node.querySelector(".body") : node;
}

// An MCP tool-use card, the way an AI client surfaces a tool call: a brief
// "running" state, then the result summary.
async function toolCard(host, name, summary) {
  const card = document.createElement("div");
  card.className = "tool-card";
  card.innerHTML =
    `<div class="thead"><span class="ticon">⚒</span>` +
    `<span class="tname">SLAM · ${name}</span>` +
    `<span class="tstatus"><span class="spin">↻</span> running</span></div>`;
  host.appendChild(card);
  host.scrollTop = host.scrollHeight;
  await wait(650);
  card.querySelector(".tstatus").className = "tstatus ok";
  card.querySelector(".tstatus").textContent = "✓ done";
  const res = document.createElement("div");
  res.className = "tres";
  res.textContent = `→ ${summary}`;
  card.appendChild(res);
  host.scrollTop = host.scrollHeight;
  return card;
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

  // Scene 4 — the learner works inside Claude; the SLAM MCP agent supplies the tools
  scene("student"); setUrl("claude.ai  ·  Claude  ·  SLAM connected"); setProgress(0.50);
  say("Learner · In Claude", "The learner works inside Claude. The installed SLAM MCP agent gives Claude the assessment tools.");
  const thread = $("#thread");
  thread.innerHTML = "";

  // On first launch the agent silently exchanges the install token for a scoped token.
  const exchanged = await api("/device-links/exchange", {
    method: "POST", body: JSON.stringify({ installToken, clientName: "Claude" })
  });
  const ST = exchanged.accessToken;

  await type(claudeMsg(thread, "user"), "I'm ready to start my EDUC 240 assessment.", 13);
  await wait(450);
  await type(claudeMsg(thread, "assistant"), "Great — I'll start your session and pull up the first prompt.", 11);
  let session = await api("/sessions", { method: "POST", body: JSON.stringify({ assessmentId: assessment.id }) }, ST);
  await toolCard(thread, "start_assessment", `session started · ${assessment.durationMinutes} min`);
  await wait(500);

  const answers = [
    "The section is only partly meeting the outcome: the claim–evidence pass rate is 58%, and first-gen students trail continuing-gen (64% vs 78%). Because lab-note completion is high (91%), the gap looks like reasoning support, not effort — so I recommend a calibrated re-assessment with worked exemplars.",
    "I'm fairly confident in the gap, but uncertain whether the 58% reflects the rubric or the prompt wording. I'd verify by re-scoring a sample with a second rater before advising the committee."
  ];

  for (let i = 0; ; i += 1) {
    const next = await api(`/sessions/${session.id}/next-prompt`, { method: "POST" }, ST);
    session = next.session;
    await toolCard(thread, "next_prompt", next.prompt ? `prompt ${session.currentPromptIndex + 1} of ${assessment.promptSequence.length}` : "no more prompts");
    if (!next.prompt) break;
    const p = next.prompt;
    await type(claudeMsg(thread, "assistant"), `Prompt ${session.currentPromptIndex + 1}: ${p.prompt}`, 8);
    await wait(450);
    say("Learner · In Claude", p.responseType === "reflection" ? "Reflection prompts capture monitoring and calibration." : "The learner answers with a claim grounded in evidence.");
    await type(claudeMsg(thread, "user"), answers[i] ?? answers[answers.length - 1], 8);
    await wait(300);
    await type(
      claudeMsg(thread, "assistant"),
      p.responseType === "reflection" ? "Saving your reflection and confidence." : "Recording your response and confidence.",
      11
    );

    if (p.responseType === "reflection") {
      await api(`/sessions/${session.id}/reflections`, { method: "POST", body: JSON.stringify({ content: answers[i] ?? answers[1], focus: "monitoring" }) }, ST);
      await toolCard(thread, "submit_reflection", "reflection saved");
    } else {
      await api(`/sessions/${session.id}/responses`, { method: "POST", body: JSON.stringify({ promptId: p.id, content: answers[i] ?? answers[0] }) }, ST);
      await toolCard(thread, "submit_response", "response saved");
    }
    await api(`/sessions/${session.id}/confidence`, { method: "POST", body: JSON.stringify({ promptId: p.id, value: 4 }) }, ST);
    await toolCard(thread, "record_confidence", "confidence 4 / 5");
    await wait(700);
  }

  // Scene 5 — Claude submits (end_assessment); the evaluator returns the report
  await type(claudeMsg(thread, "user"), "That's everything — please submit it.", 13);
  await type(claudeMsg(thread, "assistant"), "Submitting now. I'll bring back your formative report.", 11);
  await toolCard(thread, "end_assessment", "session submitted for evaluation");
  await wait(500);
  scene("reports"); setUrl("localhost:4000  ·  Instructor console · Reports"); setProgress(0.80);
  say("Insight · Report", "The evaluator returns scores with cited evidence, confidence, and next steps — visible to learner and instructor.");
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
  resetCanned();
  el.play.textContent = "⏸ Pause";
  el.status.textContent = STATIC ? "Recorded demo (canned data)." : "Live against the running API.";
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
