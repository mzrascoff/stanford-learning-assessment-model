import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AccessToken,
  ActorContext,
  ArtifactAnalysisInput,
  AssessmentBlueprint,
  AssessmentInstructions,
  AssessmentSession,
  ClassReport,
  CreateAssessmentInput,
  DeviceExchangeInput,
  DeviceExchangeResult,
  ExportPayload,
  InstallToken,
  PublishInstallLinkInput,
  QueueJob,
  RecordConfidenceInput,
  SessionEvent,
  StartAssessmentInput,
  StudentReport,
  SubmitReflectionInput,
  SubmitResponseInput,
  TimeRemaining,
  UploadArtifactInput
} from "./contracts.js";
import type { DatabaseState } from "./contracts.js";
import type { ArtifactStore } from "./artifact-store.js";
import { LocalArtifactStore } from "./artifact-store.js";
import { SlamError } from "./errors.js";
import { buildClassReport, buildStudentReport } from "./evaluator.js";
import { FileStore } from "./file-store.js";
import { buildStarterAnchors, buildStarterPrompts, getAllStarterDimensions } from "./starter-dimensions.js";

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 24 * 60 * 60_000).toISOString();
}

function makeOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}

// Compare two secrets without leaking their relationship through timing. Both
// sides are hashed to a fixed length first so timingSafeEqual never sees
// unequal-length buffers (which would itself reveal length).
function safeEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

// RFC 4180 quoting plus spreadsheet formula-injection guarding. Every field is
// quoted so embedded commas/quotes/newlines can't shift columns, and cells that
// would be interpreted as a formula are prefixed with a single quote.
function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new SlamError("validation", message);
  }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SlamError("validation", `${field} is required.`);
  }
  return value;
}

function normalizeAssessmentInput(input: CreateAssessmentInput): CreateAssessmentInput {
  const rubricDimensions = input.rubricDimensions.length > 0 ? input.rubricDimensions : getAllStarterDimensions().slice(0, 2);
  const promptSequence = input.promptSequence.length > 0 ? input.promptSequence : buildStarterPrompts(rubricDimensions);
  return {
    ...input,
    rubricDimensions,
    anchorExamples: input.anchorExamples?.length ? input.anchorExamples : buildStarterAnchors(rubricDimensions),
    promptSequence,
    artifactTypes: input.artifactTypes ?? ["text/plain", "text/markdown", "application/json"]
  };
}

function requireInstructor(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor) {
    throw new SlamError("unauthorized", "Authentication required.");
  }
  if (actor.role !== "instructor") {
    throw new SlamError("forbidden", "Instructor access required.");
  }
}

function requireAuthenticated(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor) {
    throw new SlamError("unauthorized", "Authentication required.");
  }
}

function selectAssessment(state: DatabaseState, assessmentId: string): AssessmentBlueprint {
  const assessment = state.assessments.find((entry) => entry.id === assessmentId);
  if (!assessment) {
    throw new SlamError("not_found", `Assessment ${assessmentId} was not found.`);
  }
  return assessment;
}

function selectSession(state: DatabaseState, sessionId: string): AssessmentSession {
  const session = state.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    throw new SlamError("not_found", `Session ${sessionId} was not found.`);
  }
  return session;
}

// Cross-tenant access is reported as not-found so the response never confirms
// the existence of another tenant's resources.
function assertTenantScope(condition: unknown): asserts condition {
  if (!condition) {
    throw new SlamError("not_found", "Resource not found for this tenant.");
  }
}

function assertSameStudent(condition: unknown): asserts condition {
  if (!condition) {
    throw new SlamError("forbidden", "Student token does not match this session.");
  }
}

function selectEvents(state: DatabaseState, sessionId: string): SessionEvent[] {
  return state.sessionEvents
    .filter((event) => event.sessionId === sessionId)
    .sort((left, right) => left.version - right.version);
}

export interface SlamServiceOptions {
  publicBaseUrl?: string;
  syncEvaluation?: boolean;
  devInstructorToken?: string;
  artifactStore?: ArtifactStore;
  artifactDataDir?: string;
}

export class SlamService {
  private readonly artifactStore: ArtifactStore;

  constructor(
    private readonly store: FileStore,
    private readonly options: SlamServiceOptions = {}
  ) {
    this.artifactStore = options.artifactStore ?? new LocalArtifactStore(options.artifactDataDir ?? ".slam-data/artifacts");
  }

  async seed(): Promise<void> {
    const tokenValue = this.options.devInstructorToken ?? "slam-dev-instructor-token";
    await this.store.transaction((state) => {
      const exists = state.accessTokens.some((token) => token.token === tokenValue);
      if (exists) {
        return;
      }

      const token: AccessToken = {
        id: randomUUID(),
        token: tokenValue,
        tenantId: "tenant-demo",
        role: "instructor",
        displayName: "SLAM Demo Instructor",
        issuedAt: nowIso(),
        expiresAt: addDays(nowIso(), 3650)
      };

      state.accessTokens.push(token);
    });
  }

  async authenticate(accessToken?: string): Promise<ActorContext | null> {
    if (!accessToken) {
      return null;
    }

    const state = await this.store.read();
    const token = state.accessTokens.find((entry) => safeEquals(entry.token, accessToken));
    if (!token || new Date(token.expiresAt).getTime() < Date.now()) {
      return null;
    }

    return {
      tokenId: token.id,
      tenantId: token.tenantId,
      role: token.role,
      assessmentId: token.assessmentId,
      studentId: token.studentId,
      studentName: token.studentName,
      displayName: token.displayName
    };
  }

  async getStarterDimensions() {
    return getAllStarterDimensions();
  }

  async listAssessments(actor: ActorContext | null): Promise<AssessmentBlueprint[]> {
    requireInstructor(actor);
    const state = await this.store.read();
    return state.assessments.filter((assessment) => assessment.tenantId === actor.tenantId);
  }

  async createAssessment(input: CreateAssessmentInput, actor: ActorContext | null): Promise<AssessmentBlueprint> {
    requireInstructor(actor);
    const normalized = normalizeAssessmentInput(input);
    assert(normalized.durationMinutes >= 5 && normalized.durationMinutes <= 240, "Duration must be between 5 and 240 minutes.");

    return this.store.transaction((state) => {
      const course = state.courses.find((entry) => entry.id === normalized.courseId && entry.tenantId === actor.tenantId);
      assert(course, `Course ${normalized.courseId} was not found.`);

      const assessment: AssessmentBlueprint = {
        id: randomUUID(),
        tenantId: actor.tenantId,
        courseId: normalized.courseId,
        title: normalized.title,
        description: normalized.description,
        durationMinutes: normalized.durationMinutes,
        deliveryMode: normalized.deliveryMode,
        feedbackVisibility: normalized.feedbackVisibility,
        rubricDimensions: normalized.rubricDimensions,
        anchorExamples: normalized.anchorExamples ?? [],
        promptSequence: normalized.promptSequence,
        artifactTypes: normalized.artifactTypes ?? [],
        createdBy: actor.displayName ?? actor.tokenId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        version: 1
      };

      state.assessments.push(assessment);
      return assessment;
    });
  }

  async getAssessment(assessmentId: string, actor: ActorContext | null): Promise<AssessmentBlueprint> {
    requireAuthenticated(actor);
    const state = await this.store.read();
    const assessment = selectAssessment(state, assessmentId);
    assertTenantScope(assessment.tenantId === actor.tenantId);
    if (actor.role === "student" && actor.assessmentId && actor.assessmentId !== assessmentId) {
      throw new SlamError("forbidden", "Student token is not scoped to this assessment.");
    }
    return assessment;
  }

  async publishInstallLink(input: PublishInstallLinkInput, actor: ActorContext | null): Promise<{ installToken: InstallToken; downloadUrl: string }> {
    requireInstructor(actor);

    return this.store.transaction((state) => {
      const assessment = selectAssessment(state, input.assessmentId);
      assertTenantScope(assessment.tenantId === actor.tenantId);

      const installToken: InstallToken = {
        id: randomUUID(),
        token: makeOpaqueToken("slam_install"),
        tenantId: actor.tenantId,
        role: "student",
        assessmentId: assessment.id,
        studentId: input.studentId,
        studentName: input.studentName,
        expiresAt: addDays(nowIso(), input.expiresInDays ?? 7)
      };

      state.installTokens.push(installToken);

      const base = this.options.publicBaseUrl ?? "http://localhost:4000";
      return {
        installToken,
        downloadUrl: `${base}/downloads/slam-agent.mcpb?installToken=${encodeURIComponent(installToken.token)}`
      };
    });
  }

  async exchangeInstallToken(input: DeviceExchangeInput): Promise<DeviceExchangeResult> {
    return this.store.transaction((state) => {
      const installToken = state.installTokens.find((entry) => safeEquals(entry.token, input.installToken));
      assert(installToken, "Install token was not found.");
      assert(new Date(installToken.expiresAt).getTime() > Date.now(), "Install token has expired.");
      assert(!installToken.usedAt, "Install token has already been exchanged.");

      installToken.usedAt = nowIso();

      const actorToken: AccessToken = {
        id: randomUUID(),
        token: makeOpaqueToken("slam_access"),
        tenantId: installToken.tenantId,
        role: installToken.role,
        assessmentId: installToken.assessmentId,
        studentId: installToken.studentId ?? `student-${installToken.id.slice(0, 8)}`,
        studentName: installToken.studentName,
        displayName: input.clientName ?? "SLAM Learner",
        issuedAt: nowIso(),
        expiresAt: addDays(nowIso(), 30)
      };

      state.accessTokens.push(actorToken);

      return {
        accessToken: actorToken.token,
        actor: {
          tokenId: actorToken.id,
          tenantId: actorToken.tenantId,
          role: actorToken.role,
          assessmentId: actorToken.assessmentId,
          studentId: actorToken.studentId,
          studentName: actorToken.studentName,
          displayName: actorToken.displayName
        }
      };
    });
  }

  async whoAmI(actor: ActorContext | null): Promise<ActorContext> {
    requireAuthenticated(actor);
    return actor;
  }

  private appendEvent(state: DatabaseState, session: AssessmentSession, event: Omit<SessionEvent, "id" | "version" | "assessmentId" | "tenantId" | "createdAt">): SessionEvent {
    const createdEvent: SessionEvent = {
      id: randomUUID(),
      assessmentId: session.assessmentId,
      tenantId: session.tenantId,
      createdAt: nowIso(),
      version: session.lastEventVersion + 1,
      ...event
    };

    session.lastEventVersion = createdEvent.version;
    state.sessionEvents.push(createdEvent);
    return createdEvent;
  }

  private ensureSessionOpen(session: AssessmentSession): void {
    assert(session.status === "in_progress", "Session is not active.");
    assert(new Date(session.dueAt).getTime() > Date.now(), "Assessment time has expired.");
  }

  async startAssessment(input: StartAssessmentInput, actor: ActorContext | null): Promise<AssessmentSession> {
    requireAuthenticated(actor);

    return this.store.transaction((state) => {
      const assessmentId = input.assessmentId ?? actor.assessmentId;
      assert(assessmentId, "Assessment id is required.");
      const assessment = selectAssessment(state, assessmentId);
      assertTenantScope(assessment.tenantId === actor.tenantId);

      const startedAt = nowIso();
      const session: AssessmentSession = {
        id: randomUUID(),
        tenantId: actor.tenantId,
        assessmentId: assessment.id,
        studentId: actor.studentId ?? `student-${actor.tokenId.slice(0, 8)}`,
        studentName: input.studentName ?? actor.studentName,
        startedAt,
        dueAt: addMinutes(startedAt, assessment.durationMinutes),
        status: "in_progress",
        currentPromptIndex: -1,
        lastEventVersion: 0
      };

      state.sessions.push(session);
      this.appendEvent(state, session, {
        sessionId: session.id,
        kind: "session_started",
        payload: {
          studentName: session.studentName,
          startedAt,
          durationMinutes: assessment.durationMinutes
        }
      });

      return session;
    });
  }

  async nextPrompt(sessionId: string, actor: ActorContext | null): Promise<{ prompt: AssessmentBlueprint["promptSequence"][number] | null; session: AssessmentSession }> {
    requireAuthenticated(actor);

    return this.store.transaction((state) => {
      const session = selectSession(state, sessionId);
      assertTenantScope(session.tenantId === actor.tenantId);
      if (actor.role === "student") {
        assertSameStudent(actor.studentId === session.studentId);
      }
      this.ensureSessionOpen(session);

      const assessment = selectAssessment(state, session.assessmentId);
      const nextIndex = session.currentPromptIndex + 1;
      const prompt = assessment.promptSequence[nextIndex] ?? null;
      if (prompt) {
        session.currentPromptIndex = nextIndex;
        this.appendEvent(state, session, {
          sessionId: session.id,
          kind: "prompt_presented",
          promptId: prompt.id,
          payload: {
            title: prompt.title,
            prompt: prompt.prompt
          }
        });
      }

      return { prompt, session };
    });
  }

  async submitResponse(input: SubmitResponseInput, actor: ActorContext | null): Promise<SessionEvent> {
    requireAuthenticated(actor);
    requireText(input.promptId, "promptId");
    requireText(input.content, "content");

    return this.store.transaction((state) => {
      const session = selectSession(state, input.sessionId);
      assertTenantScope(session.tenantId === actor.tenantId);
      if (actor.role === "student") {
        assertSameStudent(actor.studentId === session.studentId);
      }
      this.ensureSessionOpen(session);

      return this.appendEvent(state, session, {
        sessionId: session.id,
        kind: "response_submitted",
        promptId: input.promptId,
        payload: {
          content: input.content
        }
      });
    });
  }

  async recordConfidence(input: RecordConfidenceInput, actor: ActorContext | null): Promise<SessionEvent> {
    requireAuthenticated(actor);
    assert(input.value >= 1 && input.value <= 5, "Confidence must be between 1 and 5.");

    return this.store.transaction((state) => {
      const session = selectSession(state, input.sessionId);
      assertTenantScope(session.tenantId === actor.tenantId);
      if (actor.role === "student") {
        assertSameStudent(actor.studentId === session.studentId);
      }
      this.ensureSessionOpen(session);

      return this.appendEvent(state, session, {
        sessionId: session.id,
        kind: "confidence_recorded",
        promptId: input.promptId,
        payload: {
          value: input.value,
          explanation: input.explanation
        }
      });
    });
  }

  async submitReflection(input: SubmitReflectionInput, actor: ActorContext | null): Promise<SessionEvent> {
    requireAuthenticated(actor);
    requireText(input.content, "content");

    return this.store.transaction((state) => {
      const session = selectSession(state, input.sessionId);
      assertTenantScope(session.tenantId === actor.tenantId);
      if (actor.role === "student") {
        assertSameStudent(actor.studentId === session.studentId);
      }
      this.ensureSessionOpen(session);

      return this.appendEvent(state, session, {
        sessionId: session.id,
        kind: "reflection_submitted",
        payload: {
          content: input.content,
          focus: input.focus
        }
      });
    });
  }

  async uploadArtifact(input: UploadArtifactInput, actor: ActorContext | null): Promise<SessionEvent> {
    requireAuthenticated(actor);
    requireText(input.name, "name");
    requireText(input.mimeType, "mimeType");
    requireText(input.contentBase64, "contentBase64");

    return this.store.transaction(async (state) => {
      const session = selectSession(state, input.sessionId);
      assertTenantScope(session.tenantId === actor.tenantId);
      if (actor.role === "student") {
        assertSameStudent(actor.studentId === session.studentId);
      }
      this.ensureSessionOpen(session);
      const storedArtifact = await this.artifactStore.saveArtifact({
        tenantId: session.tenantId,
        assessmentId: session.assessmentId,
        sessionId: session.id,
        name: input.name,
        mimeType: input.mimeType,
        contentBase64: input.contentBase64
      });

      return this.appendEvent(state, session, {
        sessionId: session.id,
        kind: "artifact_uploaded",
        payload: {
          ...storedArtifact
        }
      });
    });
  }

  async completeSession(sessionId: string, actor: ActorContext | null): Promise<AssessmentSession> {
    requireAuthenticated(actor);

    const session = await this.store.transaction((state) => {
      const existing = selectSession(state, sessionId);
      assertTenantScope(existing.tenantId === actor.tenantId);
      if (actor.role === "student") {
        assertSameStudent(actor.studentId === existing.studentId);
      }
      assert(existing.status === "in_progress", "Session is not active.");

      existing.status = new Date(existing.dueAt).getTime() <= Date.now() ? "expired" : "submitted";
      existing.endedAt = nowIso();
      this.appendEvent(state, existing, {
        sessionId: existing.id,
        kind: "session_ended",
        payload: {
          endedAt: existing.endedAt,
          status: existing.status
        }
      });

      const jobs: QueueJob[] = [
        {
          id: randomUUID(),
          tenantId: existing.tenantId,
          assessmentId: existing.assessmentId,
          sessionId: existing.id,
          kind: "evaluate_session",
          status: "pending",
          attempts: 0,
          createdAt: nowIso(),
          updatedAt: nowIso()
        },
        {
          id: randomUUID(),
          tenantId: existing.tenantId,
          assessmentId: existing.assessmentId,
          kind: "rebuild_class_report",
          status: "pending",
          attempts: 0,
          createdAt: nowIso(),
          updatedAt: nowIso()
        }
      ];

      state.queueJobs.push(...jobs);
      return existing;
    });

    if (this.options.syncEvaluation) {
      await this.runPendingJobs(5);
    }

    return session;
  }

  async analyzeArtifact(input: ArtifactAnalysisInput, actor: ActorContext | null): Promise<{ session: AssessmentSession; report: StudentReport }> {
    requireInstructor(actor);
    const session = await this.store.transaction(async (state) => {
      const assessment = selectAssessment(state, input.assessmentId);
      assertTenantScope(assessment.tenantId === actor.tenantId);

      const startedAt = nowIso();
      const createdSession: AssessmentSession = {
        id: randomUUID(),
        tenantId: actor.tenantId,
        assessmentId: assessment.id,
        studentId: input.studentId,
        studentName: input.studentName,
        startedAt,
        dueAt: addMinutes(startedAt, assessment.durationMinutes),
        endedAt: startedAt,
        status: "submitted",
        currentPromptIndex: assessment.promptSequence.length - 1,
        lastEventVersion: 0
      };

      state.sessions.push(createdSession);
      this.appendEvent(state, createdSession, {
        sessionId: createdSession.id,
        kind: "session_started",
        payload: {
          source: "artifact_analysis"
        }
      });
      this.appendEvent(state, createdSession, {
        sessionId: createdSession.id,
        kind: "artifact_uploaded",
        payload: {
          ...(await this.artifactStore.saveArtifact({
            tenantId: createdSession.tenantId,
            assessmentId: createdSession.assessmentId,
            sessionId: createdSession.id,
            name: input.name,
            mimeType: input.mimeType,
            contentBase64: input.contentBase64
          }))
        }
      });
      this.appendEvent(state, createdSession, {
        sessionId: createdSession.id,
        kind: "session_ended",
        payload: {
          source: "artifact_analysis",
          endedAt: startedAt
        }
      });
      state.queueJobs.push(
        {
          id: randomUUID(),
          tenantId: createdSession.tenantId,
          assessmentId: createdSession.assessmentId,
          sessionId: createdSession.id,
          kind: "evaluate_session",
          status: "pending",
          attempts: 0,
          createdAt: nowIso(),
          updatedAt: nowIso()
        },
        {
          id: randomUUID(),
          tenantId: createdSession.tenantId,
          assessmentId: createdSession.assessmentId,
          kind: "rebuild_class_report",
          status: "pending",
          attempts: 0,
          createdAt: nowIso(),
          updatedAt: nowIso()
        }
      );

      return createdSession;
    });

    await this.runPendingJobs(5);
    const report = await this.getStudentReport(session.id, actor);
    return { session, report };
  }

  async listSessions(assessmentId: string, actor: ActorContext | null): Promise<AssessmentSession[]> {
    requireInstructor(actor);
    const state = await this.store.read();
    return state.sessions.filter((session) => session.assessmentId === assessmentId && session.tenantId === actor.tenantId);
  }

  async runPendingJobs(limit = 10): Promise<number> {
    const jobs = await this.store.transaction((state) => {
      const pending = state.queueJobs.filter((job) => job.status === "pending").slice(0, limit);
      pending.forEach((job) => {
        job.status = "processing";
        job.attempts += 1;
        job.updatedAt = nowIso();
      });
      return pending;
    });

    let processed = 0;

    for (const job of jobs) {
      try {
        if (job.kind === "evaluate_session" && job.sessionId) {
          await this.generateStudentReport(job.sessionId);
        }
        if (job.kind === "rebuild_class_report") {
          await this.generateClassReport(job.assessmentId);
        }

        await this.store.transaction((state) => {
          const stored = state.queueJobs.find((entry) => entry.id === job.id);
          if (stored) {
            stored.status = "done";
            stored.updatedAt = nowIso();
          }
        });
        processed += 1;
      } catch (error) {
        await this.store.transaction((state) => {
          const stored = state.queueJobs.find((entry) => entry.id === job.id);
          if (stored) {
            stored.status = "failed";
            stored.error = error instanceof Error ? error.message : String(error);
            stored.updatedAt = nowIso();
          }
        });
      }
    }

    return processed;
  }

  async generateStudentReport(sessionId: string): Promise<StudentReport> {
    return this.store.transaction((state) => {
      const session = selectSession(state, sessionId);
      const assessment = selectAssessment(state, session.assessmentId);
      const events = selectEvents(state, session.id);
      const report = buildStudentReport(assessment, session, events);
      const existingIndex = state.studentReports.findIndex((entry) => entry.sessionId === session.id);
      if (existingIndex >= 0) {
        state.studentReports[existingIndex] = report;
      } else {
        state.studentReports.push(report);
      }
      // Preserve a terminal "expired" status so late submissions stay
      // distinguishable from on-time ones after evaluation.
      if (session.status !== "expired") {
        session.status = "evaluated";
      }
      return report;
    });
  }

  async generateClassReport(assessmentId: string): Promise<ClassReport> {
    return this.store.transaction((state) => {
      const assessment = selectAssessment(state, assessmentId);
      const reports = state.studentReports.filter((report) => report.assessmentId === assessment.id);
      const classReport = buildClassReport(assessment, reports);
      const existingIndex = state.classReports.findIndex((entry) => entry.assessmentId === assessment.id);
      if (existingIndex >= 0) {
        state.classReports[existingIndex] = classReport;
      } else {
        state.classReports.push(classReport);
      }
      return classReport;
    });
  }

  async getStudentReport(sessionId: string, actor: ActorContext | null): Promise<StudentReport> {
    requireAuthenticated(actor);
    let report = await this.store.transaction((state) => {
      const session = selectSession(state, sessionId);
      assertTenantScope(session.tenantId === actor.tenantId);
      if (actor.role === "student") {
        assertSameStudent(actor.studentId === session.studentId);
      }
      return state.studentReports.find((entry) => entry.sessionId === sessionId) ?? null;
    });

    if (!report) {
      report = await this.generateStudentReport(sessionId);
      await this.generateClassReport(report.assessmentId);
    }

    return report;
  }

  async getClassReport(assessmentId: string, actor: ActorContext | null): Promise<ClassReport> {
    requireInstructor(actor);
    let report = await this.store.transaction((state) => {
      selectAssessment(state, assessmentId);
      return state.classReports.find((entry) => entry.assessmentId === assessmentId) ?? null;
    });

    if (!report) {
      report = await this.generateClassReport(assessmentId);
    }

    return report;
  }

  async exportResults(assessmentId: string, format: "json" | "csv", actor: ActorContext | null): Promise<ExportPayload> {
    requireInstructor(actor);
    const classReport = await this.getClassReport(assessmentId, actor);
    const state = await this.store.read();
    const studentReports = state.studentReports.filter((report) => report.assessmentId === assessmentId);

    if (format === "csv") {
      const rows = [
        ["session_id", "student_id", "student_name", "dimension_id", "dimension_label", "score", "confidence"]
          .map(csvCell)
          .join(",")
      ];
      for (const report of studentReports) {
        for (const dimension of report.dimensionResults) {
          rows.push(
            [
              report.sessionId,
              report.studentId,
              report.studentName ?? "",
              dimension.dimensionId,
              dimension.label,
              dimension.score,
              dimension.confidence
            ]
              .map(csvCell)
              .join(",")
          );
        }
      }
      return {
        format,
        body: rows.join("\n"),
        contentType: "text/csv; charset=utf-8",
        filename: `slam-${assessmentId}-export.csv`
      };
    }

    return {
      format,
      body: JSON.stringify({ classReport, studentReports }, null, 2),
      contentType: "application/json; charset=utf-8",
      filename: `slam-${assessmentId}-export.json`
    };
  }

  async getInstructions(assessmentId: string | undefined, actor: ActorContext | null): Promise<AssessmentInstructions> {
    requireAuthenticated(actor);
    const resolvedAssessmentId = assessmentId ?? actor.assessmentId;
    assert(resolvedAssessmentId, "Assessment id is required.");
    const assessment = await this.getAssessment(resolvedAssessmentId, actor);
    const instructions = [
      `Assessment: ${assessment.title}`,
      `Duration: ${assessment.durationMinutes} minutes`,
      `Delivery mode: ${assessment.deliveryMode}`,
      `Focus dimensions: ${assessment.rubricDimensions.map((dimension) => dimension.label).join(", ")}`,
      "This is a formative assessment. Reports are advisory and include cited evidence, confidence, and next steps rather than grades."
    ].join("\n");

    return {
      assessmentId: assessment.id,
      title: assessment.title,
      instructions
    };
  }

  async getTimeRemaining(sessionId: string, actor: ActorContext | null): Promise<TimeRemaining> {
    requireAuthenticated(actor);
    const state = await this.store.read();
    const session = selectSession(state, sessionId);
    assertTenantScope(session.tenantId === actor.tenantId);
    if (actor.role === "student") {
      assertSameStudent(actor.studentId === session.studentId);
    }

    return {
      sessionId: session.id,
      secondsRemaining: Math.max(0, Math.floor((new Date(session.dueAt).getTime() - Date.now()) / 1000)),
      status: session.status
    };
  }
}
