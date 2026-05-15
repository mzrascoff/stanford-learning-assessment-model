import type {
  AggregateDimensionResult,
  AssessmentBlueprint,
  AssessmentSession,
  ClassReport,
  DimensionResult,
  SessionEvent,
  StudentReport
} from "./contracts.js";

const EVALUATOR_VERSION = "slam-heuristic-evaluator@0.1.0";
const MODEL_SETTINGS_VERSION = "rubric-plus-anchors-v1";

function excerpt(value: string, maxLength = 180): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1)}…`;
}

function getTextPayload(event: SessionEvent): string {
  if (typeof event.payload.content === "string") {
    return event.payload.content;
  }

  if (typeof event.payload.textPreview === "string") {
    return event.payload.textPreview;
  }

  return "";
}

function hasReasoningLanguage(text: string): boolean {
  return /(because|therefore|so that|i noticed|i revised|i checked|tradeoff|assumption|debug|verify|uncertain)/i.test(text);
}

function hasTransferLanguage(text: string): boolean {
  return /(similar to|compared with|this reminds me|previously|another example|by analogy)/i.test(text);
}

function hasMonitoringLanguage(text: string): boolean {
  return /(confidence|uncertain|double-check|verify|monitor|i would test|i would revise)/i.test(text);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildStudentReport(
  assessment: AssessmentBlueprint,
  session: AssessmentSession,
  events: SessionEvent[]
): StudentReport {
  const responses = events.filter((event) => event.kind === "response_submitted");
  const reflections = events.filter((event) => event.kind === "reflection_submitted");
  const confidences = events.filter((event) => event.kind === "confidence_recorded");
  const artifacts = events.filter((event) => event.kind === "artifact_uploaded");
  const allText = events.map(getTextPayload).join("\n");

  const dimensionResults: DimensionResult[] = assessment.rubricDimensions.map((dimension) => {
    const relevantPromptIds = assessment.promptSequence
      .filter((prompt) => prompt.targetDimensionIds.includes(dimension.id))
      .map((prompt) => prompt.id);
    const relevantEvents = events.filter(
      (event) => !event.promptId || relevantPromptIds.length === 0 || relevantPromptIds.includes(event.promptId)
    );
    const relevantTexts = relevantEvents.map(getTextPayload).filter(Boolean);
    const relevantText = relevantTexts.join("\n");
    const targetedResponses = responses.filter(
      (response) => !response.promptId || relevantPromptIds.length === 0 || relevantPromptIds.includes(response.promptId)
    );
    const targetedReflections = reflections.filter(
      (reflection) => !reflection.promptId || relevantPromptIds.length === 0 || relevantPromptIds.includes(reflection.promptId)
    );
    const targetedConfidences = confidences.filter(
      (confidence) => !confidence.promptId || relevantPromptIds.length === 0 || relevantPromptIds.includes(confidence.promptId)
    );
    const wordCount = relevantText.split(/\s+/).filter(Boolean).length;

    let score = dimension.scale.min;
    if (wordCount >= 40) score += 1;
    if (targetedResponses.length >= Math.max(1, Math.ceil(relevantPromptIds.length * 0.6))) score += 1;
    if (hasReasoningLanguage(relevantText)) score += 1;

    if (dimension.category === "cognitive") {
      if (artifacts.length > 0 || hasTransferLanguage(relevantText)) score += 1;
    }

    if (dimension.category === "metacognitive") {
      if (targetedReflections.length > 0) score += 1;
      if (targetedConfidences.length > 0 || hasMonitoringLanguage(relevantText)) score += 1;
    }

    score = Math.min(score, dimension.scale.max);

    const evidence = relevantEvents
      .filter((event) => getTextPayload(event))
      .slice(0, 3)
      .map((event) => ({
        eventId: event.id,
        promptId: event.promptId,
        quote: excerpt(getTextPayload(event)),
        rationale: `Evidence for ${dimension.label.toLowerCase()} drawn from ${event.kind.replaceAll("_", " ")}.`
      }));

    const confidence = Math.min(
      0.95,
      0.35 + evidence.length * 0.15 + (targetedReflections.length > 0 ? 0.1 : 0) + (targetedConfidences.length > 0 ? 0.1 : 0)
    );

    const strong = score >= dimension.scale.max - 1;
    const developing = score <= Math.ceil((dimension.scale.min + dimension.scale.max) / 2);

    const strengths = strong
      ? [
          `${dimension.label} is supported by explicit evidence and reasoning.`,
          `The response addresses ${dimension.criteria[0]?.toLowerCase() ?? "the primary criterion"}.`
        ]
      : [`There is some evidence of ${dimension.label.toLowerCase()}, especially in the submitted response.`];

    const gaps = developing
      ? [
          `Stronger evidence is needed for ${dimension.label.toLowerCase()}.`,
          dimension.evidenceRequirements[0] ?? "Add more explicit evidence to support the rubric."
        ]
      : [`A clearer connection between the work and the rubric criteria would improve confidence.`];

    const nextSteps = [
      `Revise with focus on ${dimension.criteria[0]?.toLowerCase() ?? dimension.label.toLowerCase()}.`,
      `Add one explicit note showing how you checked or improved your work for ${dimension.label.toLowerCase()}.`
    ];

    return {
      dimensionId: dimension.id,
      label: dimension.label,
      category: dimension.category,
      score,
      scaleMax: dimension.scale.max,
      confidence: round(confidence),
      summary: strong
        ? `${dimension.label} is currently a relative strength in this assessment.`
        : `${dimension.label} shows partial evidence and would benefit from another revision cycle.`,
      strengths,
      gaps,
      nextSteps,
      evidence
    };
  });

  const metacognitiveSignals = [
    confidences.length > 0 ? "Confidence was tracked during the session." : "No explicit confidence check was recorded.",
    reflections.length > 0 ? "The learner included self-reflection or monitoring language." : "No dedicated reflection entry was captured."
  ];

  const overallSummary =
    dimensionResults.filter((dimension) => dimension.score >= dimension.scaleMax - 1).length >=
    Math.max(1, Math.floor(dimensionResults.length / 2))
      ? "The learner shows emerging-to-strong evidence across most configured dimensions with clear opportunities for refinement."
      : "The learner has partial evidence across the selected dimensions and would benefit from targeted follow-up prompts and revision guidance.";

  return {
    id: `report-${session.id}`,
    tenantId: assessment.tenantId,
    assessmentId: assessment.id,
    sessionId: session.id,
    studentId: session.studentId,
    studentName: session.studentName,
    generatedAt: new Date().toISOString(),
    formativeOnly: true,
    rubricVersion: assessment.version,
    promptVersion: assessment.version,
    evaluatorVersion: EVALUATOR_VERSION,
    modelSettingsVersion: MODEL_SETTINGS_VERSION,
    generatedFromEventVersion: session.lastEventVersion,
    overallSummary,
    metacognitiveSignals,
    submittedArtifacts: artifacts.map((artifact) => String(artifact.payload.name ?? "artifact")),
    dimensionResults
  };
}

export function buildClassReport(assessment: AssessmentBlueprint, reports: StudentReport[]): ClassReport {
  const aggregates: AggregateDimensionResult[] = assessment.rubricDimensions.map((dimension) => {
    const results = reports
      .map((report) => report.dimensionResults.find((entry) => entry.dimensionId === dimension.id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const averageScore = results.length === 0 ? 0 : round(results.reduce((sum, entry) => sum + entry.score, 0) / results.length);
    const averageConfidence =
      results.length === 0 ? 0 : round(results.reduce((sum, entry) => sum + entry.confidence, 0) / results.length);
    const belowTargetCount = results.filter((entry) => entry.score < dimension.scale.max - 1).length;

    return {
      dimensionId: dimension.id,
      label: dimension.label,
      averageScore,
      averageConfidence,
      belowTargetCount,
      strengths: results.flatMap((entry) => entry.strengths).slice(0, 3),
      misconceptions: results.flatMap((entry) => entry.gaps).slice(0, 3)
    };
  });

  const misconceptionClusters = aggregates
    .filter((aggregate) => aggregate.belowTargetCount > 0)
    .map((aggregate) => `${aggregate.label}: ${aggregate.misconceptions[0] ?? "More evidence is needed."}`)
    .slice(0, 5);

  const exemplarSnippets = reports
    .flatMap((report, index) =>
      report.dimensionResults.flatMap((dimension) =>
        dimension.evidence.slice(0, 1).map((evidence) => ({
          dimensionId: dimension.dimensionId,
          studentAlias: `Learner ${index + 1}`,
          quote: evidence.quote
        }))
      )
    )
    .slice(0, 6);

  return {
    id: `class-report-${assessment.id}`,
    tenantId: assessment.tenantId,
    assessmentId: assessment.id,
    generatedAt: new Date().toISOString(),
    sessionCount: reports.length,
    evaluatedCount: reports.length,
    aggregateDimensions: aggregates,
    misconceptionClusters,
    exemplarSnippets
  };
}
