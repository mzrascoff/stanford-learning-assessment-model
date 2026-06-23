// AUTO-GENERATED — do not edit by hand.
// Canned SLAM API responses captured from a real run (see demo/screencast/README.md),
// so the static/offline screencast shows genuine scores, evidence, and aggregates
// without needing a live backend. Regenerate by recording a fresh run.

const DATA = {
  "assessment": {
    "id": "0db750aa-3a3b-44f4-9452-d15d1721d9b6",
    "tenantId": "tenant-demo",
    "courseId": "course-demo",
    "title": "EDUC 240 — Outcomes Evidence Memo",
    "durationMinutes": 20,
    "deliveryMode": "guided",
    "feedbackVisibility": "instructor_and_student",
    "rubricDimensions": [
      {
        "id": "writing-claim-evidence",
        "label": "Claim and evidence",
        "category": "cognitive",
        "scale": {
          "min": 1,
          "max": 4,
          "labels": [
            "emerging",
            "developing",
            "proficient",
            "advanced"
          ]
        },
        "criteria": [
          "States a defensible claim or thesis.",
          "Uses relevant evidence to support the main idea.",
          "Connects evidence back to the central argument."
        ],
        "evidenceRequirements": [
          "At least one explicit claim",
          "Evidence from the provided material or task"
        ]
      },
      {
        "id": "writing-revision-awareness",
        "label": "Revision awareness",
        "category": "metacognitive",
        "scale": {
          "min": 1,
          "max": 4,
          "labels": [
            "emerging",
            "developing",
            "proficient",
            "advanced"
          ]
        },
        "criteria": [
          "Explains what is uncertain or incomplete.",
          "Identifies a concrete revision goal.",
          "Reflects on strategy choices."
        ],
        "evidenceRequirements": [
          "A reflection on confidence or uncertainty",
          "A next-step revision plan"
        ]
      }
    ],
    "anchorExamples": [
      {
        "id": "anchor-1-writing-claim-evidence",
        "dimensionId": "writing-claim-evidence",
        "performanceLevel": "advanced",
        "excerpt": "This response demonstrates claim and evidence with explicit evidence and a clear explanation of strategy choices.",
        "rationale": "Use this as an anchor for strong evidence of claim and evidence."
      },
      {
        "id": "anchor-2-writing-revision-awareness",
        "dimensionId": "writing-revision-awareness",
        "performanceLevel": "advanced",
        "excerpt": "This response demonstrates revision awareness with explicit evidence and a clear explanation of strategy choices.",
        "rationale": "Use this as an anchor for strong evidence of revision awareness."
      }
    ],
    "promptSequence": [
      {
        "id": "prompt-1",
        "title": "Primary task",
        "prompt": "Produce a first-pass response to the assignment. Make your reasoning explicit and show the steps you used.",
        "responseType": "text",
        "targetDimensionIds": [
          "writing-claim-evidence"
        ],
        "guidance": "Use concrete evidence, examples, or intermediate reasoning rather than only a final answer."
      },
      {
        "id": "prompt-2",
        "title": "Confidence check",
        "prompt": "Explain what you are most confident about, what remains uncertain, and how you would verify or improve your work.",
        "responseType": "reflection",
        "targetDimensionIds": [
          "writing-revision-awareness"
        ],
        "guidance": "Name at least one uncertainty and one strategy for checking your work."
      }
    ],
    "artifactTypes": [
      "text/plain",
      "text/markdown",
      "application/json"
    ],
    "createdBy": "SLAM Demo Instructor",
    "createdAt": "2026-06-23T21:33:35.230Z",
    "updatedAt": "2026-06-23T21:33:35.230Z",
    "version": 1
  },
  "publish": {
    "downloadUrl": "http://localhost:4000/downloads/slam-agent.mcpb?installToken=slam_install_1QcKHjZionBIsU9T2HIPzVI2",
    "installToken": {
      "token": "slam_install_1QcKHjZionBIsU9T2HIPzVI2",
      "expiresAt": "2026-06-30T21:33:35.234Z"
    }
  },
  "report": {
    "id": "report-62cd4d4e-4a49-46c0-817b-7bc6fda10f0a",
    "tenantId": "tenant-demo",
    "assessmentId": "0db750aa-3a3b-44f4-9452-d15d1721d9b6",
    "sessionId": "62cd4d4e-4a49-46c0-817b-7bc6fda10f0a",
    "studentId": "student-27d2a808",
    "studentName": "Jordan Rivera",
    "generatedAt": "2026-06-23T21:33:35.258Z",
    "formativeOnly": true,
    "rubricVersion": 1,
    "promptVersion": 1,
    "evaluatorVersion": "slam-heuristic-evaluator@0.1.0",
    "modelSettingsVersion": "rubric-plus-anchors-v1",
    "generatedFromEventVersion": 8,
    "overallSummary": "The learner shows emerging-to-strong evidence across most configured dimensions with clear opportunities for refinement.",
    "metacognitiveSignals": [
      "Confidence was tracked during the session.",
      "The learner included self-reflection or monitoring language."
    ],
    "submittedArtifacts": [],
    "dimensionResults": [
      {
        "dimensionId": "writing-claim-evidence",
        "label": "Claim and evidence",
        "category": "cognitive",
        "score": 4,
        "scaleMax": 4,
        "confidence": 0.85,
        "summary": "Claim and evidence is currently a relative strength in this assessment.",
        "strengths": [
          "Claim and evidence is supported by explicit evidence and reasoning.",
          "The response addresses states a defensible claim or thesis.."
        ],
        "gaps": [
          "A clearer connection between the work and the rubric criteria would improve confidence."
        ],
        "nextSteps": [
          "Revise with focus on states a defensible claim or thesis..",
          "Add one explicit note showing how you checked or improved your work for claim and evidence."
        ],
        "evidence": [
          {
            "eventId": "8b1e8db5-2a8e-41ef-900a-054cb8414f20",
            "promptId": "prompt-1",
            "quote": "The section is only partly meeting the outcome: the claim–evidence pass rate is 58%, and first-gen students trail continuing-gen (64% vs 78%). Because lab-note completion is high …",
            "rationale": "Evidence for claim and evidence drawn from response submitted."
          },
          {
            "eventId": "8be2c317-4af5-44f3-8a8f-203704c5ff81",
            "quote": "I'm fairly confident in the gap, but uncertain whether the 58% reflects the rubric or the prompt wording. I'd verify by re-scoring a sample with a second rater before advising the…",
            "rationale": "Evidence for claim and evidence drawn from reflection submitted."
          }
        ]
      },
      {
        "dimensionId": "writing-revision-awareness",
        "label": "Revision awareness",
        "category": "metacognitive",
        "score": 4,
        "scaleMax": 4,
        "confidence": 0.7,
        "summary": "Revision awareness is currently a relative strength in this assessment.",
        "strengths": [
          "Revision awareness is supported by explicit evidence and reasoning.",
          "The response addresses explains what is uncertain or incomplete.."
        ],
        "gaps": [
          "A clearer connection between the work and the rubric criteria would improve confidence."
        ],
        "nextSteps": [
          "Revise with focus on explains what is uncertain or incomplete..",
          "Add one explicit note showing how you checked or improved your work for revision awareness."
        ],
        "evidence": [
          {
            "eventId": "8be2c317-4af5-44f3-8a8f-203704c5ff81",
            "quote": "I'm fairly confident in the gap, but uncertain whether the 58% reflects the rubric or the prompt wording. I'd verify by re-scoring a sample with a second rater before advising the…",
            "rationale": "Evidence for revision awareness drawn from reflection submitted."
          }
        ]
      }
    ]
  },
  "cls": {
    "id": "class-report-0db750aa-3a3b-44f4-9452-d15d1721d9b6",
    "tenantId": "tenant-demo",
    "assessmentId": "0db750aa-3a3b-44f4-9452-d15d1721d9b6",
    "generatedAt": "2026-06-23T21:33:35.259Z",
    "sessionCount": 1,
    "evaluatedCount": 1,
    "aggregateDimensions": [
      {
        "dimensionId": "writing-claim-evidence",
        "label": "Claim and evidence",
        "averageScore": 4,
        "averageConfidence": 0.85,
        "belowTargetCount": 0,
        "strengths": [
          "Claim and evidence is supported by explicit evidence and reasoning.",
          "The response addresses states a defensible claim or thesis.."
        ],
        "misconceptions": [
          "A clearer connection between the work and the rubric criteria would improve confidence."
        ]
      },
      {
        "dimensionId": "writing-revision-awareness",
        "label": "Revision awareness",
        "averageScore": 4,
        "averageConfidence": 0.7,
        "belowTargetCount": 0,
        "strengths": [
          "Revision awareness is supported by explicit evidence and reasoning.",
          "The response addresses explains what is uncertain or incomplete.."
        ],
        "misconceptions": [
          "A clearer connection between the work and the rubric criteria would improve confidence."
        ]
      }
    ],
    "misconceptionClusters": [],
    "exemplarSnippets": [
      {
        "dimensionId": "writing-claim-evidence",
        "studentAlias": "Learner 1",
        "quote": "The section is only partly meeting the outcome: the claim–evidence pass rate is 58%, and first-gen students trail continuing-gen (64% vs 78%). Because lab-note completion is high …"
      },
      {
        "dimensionId": "writing-revision-awareness",
        "studentAlias": "Learner 1",
        "quote": "I'm fairly confident in the gap, but uncertain whether the 58% reflects the rubric or the prompt wording. I'd verify by re-scoring a sample with a second rater before advising the…"
      }
    ]
  },
  "csv": {
    "format": "csv",
    "body": "\"session_id\",\"student_id\",\"student_name\",\"dimension_id\",\"dimension_label\",\"score\",\"confidence\"\n\"62cd4d4e-4a49-46c0-817b-7bc6fda10f0a\",\"student-27d2a808\",\"Jordan Rivera\",\"writing-claim-evidence\",\"Claim and evidence\",\"4\",\"0.85\"\n\"62cd4d4e-4a49-46c0-817b-7bc6fda10f0a\",\"student-27d2a808\",\"Jordan Rivera\",\"writing-revision-awareness\",\"Revision awareness\",\"4\",\"0.7\"",
    "contentType": "text/csv; charset=utf-8",
    "filename": "slam-0db750aa-3a3b-44f4-9452-d15d1721d9b6-export.csv"
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value));

let promptIndex = -1;
export function resetCanned() {
  promptIndex = -1;
}

function sessionObject(currentPromptIndex) {
  return {
    id: "session-demo",
    assessmentId: DATA.assessment.id,
    studentId: "student-demo",
    studentName: "Jordan Rivera",
    status: "in_progress",
    currentPromptIndex
  };
}

// Mirrors the subset of the REST API the screencast director calls.
export function cannedApi(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  if (path === "/starter-dimensions") return clone(DATA.assessment.rubricDimensions);
  if (path === "/assessments" && method === "POST") return clone(DATA.assessment);
  if (/^\/assessments\/[^/]+\/publish$/.test(path)) return clone(DATA.publish);
  if (path === "/device-links/exchange") {
    return { accessToken: "slam_access_demo", actor: { tokenId: "tok-demo", tenantId: DATA.assessment.tenantId, role: "student", assessmentId: DATA.assessment.id, studentId: "student-demo", studentName: "Jordan Rivera" } };
  }
  if (path === "/sessions" && method === "POST") { promptIndex = -1; return sessionObject(-1); }
  if (/\/next-prompt$/.test(path)) {
    promptIndex += 1;
    const prompt = DATA.assessment.promptSequence[promptIndex] ?? null;
    const presented = prompt ? promptIndex : DATA.assessment.promptSequence.length - 1;
    return { prompt: prompt ? clone(prompt) : null, session: sessionObject(presented) };
  }
  if (/\/complete$/.test(path)) return { ...sessionObject(DATA.assessment.promptSequence.length - 1), status: "submitted" };
  if (/^\/reports\/student\//.test(path)) return clone(DATA.report);
  if (/^\/reports\/class\//.test(path)) return clone(DATA.cls);
  if (/^\/reports\/export\//.test(path)) return clone(DATA.csv);
  // responses / reflections / confidence — director only awaits these
  return {};
}
