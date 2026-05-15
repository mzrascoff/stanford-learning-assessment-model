export type ActorRole = "instructor" | "student" | "worker";
export type DeliveryMode = "guided" | "artifact" | "hybrid";
export type FeedbackVisibility = "instructor_only" | "instructor_and_student";
export type RubricCategory = "cognitive" | "metacognitive";
export type SessionStatus = "draft" | "in_progress" | "submitted" | "expired" | "evaluated";
export type SessionEventKind =
  | "session_started"
  | "prompt_presented"
  | "response_submitted"
  | "confidence_recorded"
  | "reflection_submitted"
  | "artifact_uploaded"
  | "session_ended";
export type QueueJobKind = "evaluate_session" | "rebuild_class_report";
export type QueueJobStatus = "pending" | "processing" | "done" | "failed";

export interface ActorContext {
  tokenId: string;
  tenantId: string;
  role: ActorRole;
  assessmentId?: string;
  studentId?: string;
  studentName?: string;
  displayName?: string;
}

export interface Course {
  id: string;
  tenantId: string;
  title: string;
  section?: string;
}

export interface RubricScale {
  min: number;
  max: number;
  labels?: string[];
}

export interface RubricDimension {
  id: string;
  label: string;
  category: RubricCategory;
  scale: RubricScale;
  criteria: string[];
  evidenceRequirements: string[];
}

export interface AnchorExample {
  id: string;
  dimensionId: string;
  performanceLevel: string;
  excerpt: string;
  rationale: string;
}

export interface PromptStep {
  id: string;
  title: string;
  prompt: string;
  responseType: "text" | "code" | "reflection" | "file";
  guidance?: string;
  targetDimensionIds: string[];
}

export interface AssessmentBlueprint {
  id: string;
  tenantId: string;
  courseId: string;
  title: string;
  description?: string;
  durationMinutes: number;
  deliveryMode: DeliveryMode;
  feedbackVisibility: FeedbackVisibility;
  rubricDimensions: RubricDimension[];
  anchorExamples: AnchorExample[];
  promptSequence: PromptStep[];
  artifactTypes: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  assessmentId: string;
  tenantId: string;
  kind: SessionEventKind;
  promptId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  version: number;
}

export interface AssessmentSession {
  id: string;
  tenantId: string;
  assessmentId: string;
  studentId: string;
  studentName?: string;
  startedAt: string;
  dueAt: string;
  endedAt?: string;
  status: SessionStatus;
  currentPromptIndex: number;
  lastEventVersion: number;
}

export interface EvidenceCitation {
  eventId: string;
  promptId?: string;
  quote: string;
  rationale: string;
}

export interface DimensionResult {
  dimensionId: string;
  label: string;
  category: RubricCategory;
  score: number;
  scaleMax: number;
  confidence: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  nextSteps: string[];
  evidence: EvidenceCitation[];
}

export interface StudentReport {
  id: string;
  tenantId: string;
  assessmentId: string;
  sessionId: string;
  studentId: string;
  studentName?: string;
  generatedAt: string;
  formativeOnly: true;
  rubricVersion: number;
  promptVersion: number;
  evaluatorVersion: string;
  modelSettingsVersion: string;
  generatedFromEventVersion: number;
  overallSummary: string;
  metacognitiveSignals: string[];
  submittedArtifacts: string[];
  dimensionResults: DimensionResult[];
}

export interface AggregateDimensionResult {
  dimensionId: string;
  label: string;
  averageScore: number;
  averageConfidence: number;
  belowTargetCount: number;
  strengths: string[];
  misconceptions: string[];
}

export interface ClassReport {
  id: string;
  tenantId: string;
  assessmentId: string;
  generatedAt: string;
  sessionCount: number;
  evaluatedCount: number;
  aggregateDimensions: AggregateDimensionResult[];
  misconceptionClusters: string[];
  exemplarSnippets: Array<{
    dimensionId: string;
    studentAlias: string;
    quote: string;
  }>;
}

export interface InstallToken {
  id: string;
  token: string;
  tenantId: string;
  role: Extract<ActorRole, "instructor" | "student">;
  assessmentId?: string;
  studentId?: string;
  studentName?: string;
  expiresAt: string;
  usedAt?: string;
}

export interface AccessToken {
  id: string;
  token: string;
  tenantId: string;
  role: ActorRole;
  assessmentId?: string;
  studentId?: string;
  studentName?: string;
  displayName?: string;
  issuedAt: string;
  expiresAt: string;
}

export interface QueueJob {
  id: string;
  tenantId: string;
  assessmentId: string;
  sessionId?: string;
  kind: QueueJobKind;
  status: QueueJobStatus;
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseState {
  courses: Course[];
  assessments: AssessmentBlueprint[];
  sessions: AssessmentSession[];
  sessionEvents: SessionEvent[];
  studentReports: StudentReport[];
  classReports: ClassReport[];
  installTokens: InstallToken[];
  accessTokens: AccessToken[];
  queueJobs: QueueJob[];
}

export interface CreateAssessmentInput {
  courseId: string;
  title: string;
  description?: string;
  durationMinutes: number;
  deliveryMode: DeliveryMode;
  feedbackVisibility: FeedbackVisibility;
  rubricDimensions: RubricDimension[];
  anchorExamples?: AnchorExample[];
  promptSequence: PromptStep[];
  artifactTypes?: string[];
}

export interface PublishInstallLinkInput {
  assessmentId: string;
  studentId?: string;
  studentName?: string;
  expiresInDays?: number;
}

export interface StartAssessmentInput {
  assessmentId?: string;
  studentName?: string;
}

export interface SubmitResponseInput {
  sessionId: string;
  promptId: string;
  content: string;
}

export interface RecordConfidenceInput {
  sessionId: string;
  promptId: string;
  value: number;
  explanation?: string;
}

export interface SubmitReflectionInput {
  sessionId: string;
  content: string;
  focus?: string;
}

export interface UploadArtifactInput {
  sessionId: string;
  name: string;
  mimeType: string;
  contentBase64: string;
}

export interface ArtifactAnalysisInput {
  assessmentId: string;
  studentId: string;
  studentName?: string;
  name: string;
  mimeType: string;
  contentBase64: string;
}

export interface ExportPayload {
  format: "json" | "csv";
  body: string;
  contentType: string;
  filename: string;
}

export interface DeviceExchangeInput {
  installToken: string;
  clientName?: string;
}

export interface DeviceExchangeResult {
  accessToken: string;
  actor: ActorContext;
}

export interface AssessmentInstructions {
  assessmentId: string;
  title: string;
  instructions: string;
}

export interface TimeRemaining {
  sessionId: string;
  secondsRemaining: number;
  status: SessionStatus;
}
