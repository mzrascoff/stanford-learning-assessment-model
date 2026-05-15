import type {
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
  PublishInstallLinkInput,
  RecordConfidenceInput,
  SessionEvent,
  StartAssessmentInput,
  StudentReport,
  SubmitReflectionInput,
  SubmitResponseInput,
  TimeRemaining,
  UploadArtifactInput
} from "./contracts.js";

export interface SlamApiClientOptions {
  baseUrl: string;
  accessToken?: string;
}

export class SlamApiClient {
  private accessToken?: string;

  constructor(private readonly options: SlamApiClientOptions) {
    this.accessToken = options.accessToken;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getBaseUrl(): string {
    return this.options.baseUrl;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    headers.set("content-type", "application/json");
    if (this.accessToken) {
      headers.set("authorization", `Bearer ${this.accessToken}`);
    }

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed with ${response.status}`);
    }

    if (response.headers.get("content-type")?.includes("application/json")) {
      return (await response.json()) as T;
    }

    return {
      body: await response.text(),
      contentType: response.headers.get("content-type") ?? "text/plain",
      filename: response.headers.get("content-disposition") ?? "download"
    } as T;
  }

  whoAmI(): Promise<ActorContext> {
    return this.request("/me", { method: "GET" });
  }

  exchangeInstallToken(input: DeviceExchangeInput): Promise<DeviceExchangeResult> {
    return this.request("/device-links/exchange", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getStarterDimensions() {
    return this.request("/starter-dimensions", { method: "GET" });
  }

  listAssessments(): Promise<AssessmentBlueprint[]> {
    return this.request("/assessments", { method: "GET" });
  }

  createAssessment(input: CreateAssessmentInput): Promise<AssessmentBlueprint> {
    return this.request("/assessments", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  publishInstallLink(input: PublishInstallLinkInput): Promise<{ downloadUrl: string; installToken: { token: string; expiresAt: string } }> {
    return this.request(`/assessments/${input.assessmentId}/publish`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  listSessions(assessmentId: string): Promise<AssessmentSession[]> {
    return this.request(`/assessments/${assessmentId}/sessions`, { method: "GET" });
  }

  startAssessment(input: StartAssessmentInput): Promise<AssessmentSession> {
    return this.request("/sessions", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  nextPrompt(sessionId: string): Promise<{ prompt: AssessmentBlueprint["promptSequence"][number] | null; session: AssessmentSession }> {
    return this.request(`/sessions/${sessionId}/next-prompt`, { method: "POST" });
  }

  submitResponse(input: SubmitResponseInput): Promise<SessionEvent> {
    return this.request(`/sessions/${input.sessionId}/responses`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  recordConfidence(input: RecordConfidenceInput): Promise<SessionEvent> {
    return this.request(`/sessions/${input.sessionId}/confidence`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  submitReflection(input: SubmitReflectionInput): Promise<SessionEvent> {
    return this.request(`/sessions/${input.sessionId}/reflections`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  uploadArtifact(input: UploadArtifactInput): Promise<SessionEvent> {
    return this.request(`/sessions/${input.sessionId}/artifacts`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  endAssessment(sessionId: string): Promise<AssessmentSession> {
    return this.request(`/sessions/${sessionId}/complete`, { method: "POST" });
  }

  getStudentReport(sessionId: string): Promise<StudentReport> {
    return this.request(`/reports/student/${sessionId}`, { method: "GET" });
  }

  getClassReport(assessmentId: string): Promise<ClassReport> {
    return this.request(`/reports/class/${assessmentId}`, { method: "GET" });
  }

  exportResults(assessmentId: string, format: "json" | "csv" = "json"): Promise<ExportPayload> {
    return this.request(`/reports/export/${assessmentId}?format=${format}`, { method: "GET" });
  }

  analyzeArtifact(input: ArtifactAnalysisInput): Promise<{ session: AssessmentSession; report: StudentReport }> {
    return this.request("/artifacts/analyze", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getInstructions(assessmentId?: string): Promise<AssessmentInstructions> {
    const suffix = assessmentId ? `?assessmentId=${encodeURIComponent(assessmentId)}` : "";
    return this.request(`/instructions${suffix}`, { method: "GET" });
  }

  getTimeRemaining(sessionId: string): Promise<TimeRemaining> {
    return this.request(`/time-remaining/${sessionId}`, { method: "GET" });
  }
}
