const tokenInput = document.querySelector("#token");
const saveTokenButton = document.querySelector("#save-token");
const dimensionList = document.querySelector("#dimension-list");
const assessmentForm = document.querySelector("#assessment-form");
const assessmentCards = document.querySelector("#assessment-cards");
const refreshAssessmentsButton = document.querySelector("#refresh-assessments");
const artifactForm = document.querySelector("#artifact-form");
const artifactResult = document.querySelector("#artifact-result");
const reportOutput = document.querySelector("#report-output");

const tokenStorageKey = "slam-instructor-token";
const defaultToken = localStorage.getItem(tokenStorageKey) || "slam-dev-instructor-token";
tokenInput.value = defaultToken;

saveTokenButton.addEventListener("click", () => {
  localStorage.setItem(tokenStorageKey, tokenInput.value.trim());
});

function headers() {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${tokenInput.value.trim()}`
  };
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function renderJson(target, payload) {
  target.textContent = JSON.stringify(payload, null, 2);
}

function promptSequenceFromText(text, dimensionIds) {
  return text
    .split(/\n+/)
    .map((prompt) => prompt.trim())
    .filter(Boolean)
    .map((prompt, index) => ({
      id: `prompt-${index + 1}`,
      title: `Prompt ${index + 1}`,
      prompt,
      responseType: index === 0 ? "text" : "reflection",
      targetDimensionIds: index === 0 ? dimensionIds.filter((_, i) => i % 2 === 0 || dimensionIds.length === 1) : dimensionIds,
      guidance: index === 0 ? "Use concrete evidence and explicit reasoning." : "Name confidence, uncertainty, and next steps."
    }));
}

function selectedDimensions() {
  return [...dimensionList.querySelectorAll('input[type="checkbox"]:checked')].map((checkbox) =>
    JSON.parse(checkbox.value)
  );
}

async function loadDimensions() {
  const dimensions = await fetch("/api/starter-dimensions").then((response) => response.json());
  dimensionList.innerHTML = "";
  for (const dimension of dimensions) {
    const wrapper = document.createElement("label");
    wrapper.className = "chip";
    wrapper.innerHTML = `
      <input type="checkbox" value='${JSON.stringify(dimension)}' ${dimension.category === "cognitive" ? "checked" : ""} />
      <span>${dimension.label}</span>
    `;
    dimensionList.appendChild(wrapper);
  }
}

async function loadAssessments() {
  const assessments = await api("/assessments", { method: "GET" });
  assessmentCards.innerHTML = "";

  if (assessments.length === 0) {
    assessmentCards.innerHTML = "<p class=\"hint\">No assessments yet.</p>";
    return;
  }

  for (const assessment of assessments) {
    const card = document.createElement("article");
    card.className = "assessment-card";
    card.innerHTML = `
      <div class="card-head">
        <div>
          <h3>${assessment.title}</h3>
          <p class="card-meta">${assessment.deliveryMode} · ${assessment.durationMinutes} min · ${assessment.rubricDimensions.length} dimensions</p>
        </div>
        <div class="actions">
          <button data-action="publish">Publish link</button>
          <button data-action="class-report" class="secondary">Class report</button>
          <button data-action="sessions" class="secondary">Sessions</button>
        </div>
      </div>
      <div class="stack install-area"></div>
    `;

    card.querySelector('[data-action="publish"]').addEventListener("click", async () => {
      const published = await api(`/assessments/${assessment.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ expiresInDays: 7 })
      });
      const installArea = card.querySelector(".install-area");
      installArea.innerHTML = `
        <p class="hint">Install token expires at ${published.installToken.expiresAt}</p>
        <a class="install-link" href="${published.downloadUrl}">${published.downloadUrl}</a>
      `;
    });

    card.querySelector('[data-action="class-report"]').addEventListener("click", async () => {
      renderJson(reportOutput, await api(`/reports/class/${assessment.id}`, { method: "GET" }));
    });

    card.querySelector('[data-action="sessions"]').addEventListener("click", async () => {
      const sessions = await api(`/assessments/${assessment.id}/sessions`, { method: "GET" });
      renderJson(reportOutput, sessions);
    });

    assessmentCards.appendChild(card);
  }
}

assessmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(assessmentForm);
  const dimensions = selectedDimensions();
  const promptSequence = promptSequenceFromText(String(form.get("promptSequence") || ""), dimensions.map((dimension) => dimension.id));

  const payload = {
    title: String(form.get("title")),
    courseId: String(form.get("courseId")),
    description: String(form.get("description") || ""),
    durationMinutes: Number(form.get("durationMinutes")),
    deliveryMode: String(form.get("deliveryMode")),
    feedbackVisibility: String(form.get("feedbackVisibility")),
    rubricDimensions: dimensions,
    promptSequence,
    artifactTypes: String(form.get("artifactTypes") || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  };

  const created = await api("/assessments", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  renderJson(reportOutput, created);
  await loadAssessments();
  assessmentForm.reset();
});

refreshAssessmentsButton.addEventListener("click", () => {
  loadAssessments().catch((error) => {
    reportOutput.textContent = error.message;
  });
});

artifactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(artifactForm);
  const content = String(form.get("content") || "");
  const payload = {
    assessmentId: String(form.get("assessmentId")),
    studentId: String(form.get("studentId")),
    studentName: String(form.get("studentName") || ""),
    name: String(form.get("name")),
    mimeType: String(form.get("mimeType")),
    contentBase64: btoa(unescape(encodeURIComponent(content)))
  };

  const result = await api("/artifacts/analyze", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  renderJson(artifactResult, result);
  renderJson(reportOutput, result.report);
});

Promise.all([loadDimensions(), loadAssessments()]).catch((error) => {
  reportOutput.textContent = error.message;
});
