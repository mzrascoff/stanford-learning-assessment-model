import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import cors from "cors";
import express from "express";
import {
  createArtifactStore,
  FileStore,
  SlamService,
  buildStarterAnchors,
  buildStarterPrompts,
  getAllStarterDimensions,
  SlamError,
  statusForError,
  type ActorContext,
  type CreateAssessmentInput
} from "@slam/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = {
  port: Number(process.env.SLAM_API_PORT ?? 4000),
  dataDir: process.env.SLAM_DATA_DIR ?? ".slam-data",
  publicBaseUrl: process.env.SLAM_PUBLIC_BASE_URL ?? `http://localhost:${process.env.SLAM_API_PORT ?? 4000}`,
  publicApiBaseUrl:
    process.env.SLAM_PUBLIC_API_BASE_URL ??
    process.env.SLAM_API_BASE_URL ??
    `http://localhost:${process.env.SLAM_API_PORT ?? 4000}/api`,
  syncEvaluation: process.env.SLAM_SYNC_EVALUATION !== "false",
  devInstructorToken: process.env.SLAM_DEV_INSTRUCTOR_TOKEN ?? "slam-dev-instructor-token",
  artifactStorage: (process.env.SLAM_ARTIFACT_STORAGE as "local" | "s3" | undefined) ?? "local",
  artifactS3Bucket: process.env.SLAM_ARTIFACT_S3_BUCKET,
  artifactS3KeyPrefix: process.env.SLAM_ARTIFACT_S3_KEY_PREFIX
};

const store = new FileStore(config.dataDir);
const artifactStore = createArtifactStore({
  dataDir: config.dataDir,
  storageMode: config.artifactStorage,
  s3Bucket: config.artifactS3Bucket,
  s3Region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
  s3KeyPrefix: config.artifactS3KeyPrefix
});
const service = new SlamService(store, {
  publicBaseUrl: config.publicBaseUrl,
  syncEvaluation: config.syncEvaluation,
  devInstructorToken: config.devInstructorToken,
  artifactStore
});
await service.seed();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

type AuthedRequest = express.Request & { actor: ActorContext | null };

function bearerToken(request: express.Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) {
    return undefined;
  }
  return header.replace(/^Bearer\s+/i, "");
}

app.use(async (request, _response, next) => {
  const actor = await service.authenticate(bearerToken(request));
  (request as AuthedRequest).actor = actor;
  next();
});

function requireAuth(request: express.Request): ActorContext {
  const actor = (request as AuthedRequest).actor;
  if (!actor) {
    throw new SlamError("unauthorized", "Authentication required.");
  }
  return actor;
}

function requireInstructor(request: express.Request): ActorContext {
  const actor = requireAuth(request);
  if (actor.role !== "instructor") {
    throw new SlamError("forbidden", "Instructor access required.");
  }
  return actor;
}

async function buildBundle(installToken: string) {
  const manifestPath = resolve(__dirname, "../../slam-agent/manifest.template.json");
  const serverEntryPath = resolve(__dirname, "../../slam-agent/dist/server/index.js");
  let manifest: Record<string, unknown>;
  let serverEntry: string;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    serverEntry = await readFile(serverEntryPath, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SlamError(
        "internal",
        "SLAM agent bundle is not built. Run `npm run build` (or `npm --workspace @slam/agent run build`) before serving downloads."
      );
    }
    throw cause;
  }

  const server = manifest.server as {
    type: string;
    entry_point: string;
    mcp_config: { command: string; args: string[]; env?: Record<string, string> };
  };

  server.mcp_config.env = {
    ...(server.mcp_config.env ?? {}),
    SLAM_API_BASE_URL: config.publicApiBaseUrl,
    SLAM_INSTALL_TOKEN: installToken
  };

  const zip = new AdmZip();
  zip.addFile("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));
  zip.addFile("server/index.js", Buffer.from(serverEntry, "utf8"));
  return zip.toBuffer();
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "slam-api" });
});

app.get("/api/starter-dimensions", async (_request, response) => {
  response.json(await service.getStarterDimensions());
});

app.get("/api/me", async (request, response) => {
  response.json(await service.whoAmI((request as AuthedRequest).actor));
});

app.get("/api/assessments", async (request, response) => {
  response.json(await service.listAssessments(requireInstructor(request)));
});

app.post("/api/assessments", async (request, response) => {
  const input = request.body as Partial<CreateAssessmentInput>;
  const dimensions = input.rubricDimensions?.length ? input.rubricDimensions : getAllStarterDimensions().slice(0, 2);
  const payload: CreateAssessmentInput = {
    courseId: input.courseId ?? "course-demo",
    title: input.title ?? "Untitled SLAM assessment",
    description: input.description,
    durationMinutes: input.durationMinutes ?? 20,
    deliveryMode: input.deliveryMode ?? "guided",
    feedbackVisibility: input.feedbackVisibility ?? "instructor_and_student",
    rubricDimensions: dimensions,
    anchorExamples: input.anchorExamples?.length ? input.anchorExamples : buildStarterAnchors(dimensions),
    promptSequence: input.promptSequence?.length ? input.promptSequence : buildStarterPrompts(dimensions),
    artifactTypes: input.artifactTypes ?? ["text/plain", "text/markdown", "application/json"]
  };

  response.status(201).json(await service.createAssessment(payload, requireInstructor(request)));
});

app.get("/api/assessments/:assessmentId", async (request, response) => {
  response.json(await service.getAssessment(request.params.assessmentId, requireAuth(request)));
});

app.post("/api/assessments/:assessmentId/publish", async (request, response) => {
  const result = await service.publishInstallLink(
    {
      assessmentId: request.params.assessmentId,
      studentId: request.body?.studentId,
      studentName: request.body?.studentName,
      expiresInDays: request.body?.expiresInDays
    },
    requireInstructor(request)
  );

  response.json({
    downloadUrl: result.downloadUrl,
    installToken: {
      token: result.installToken.token,
      expiresAt: result.installToken.expiresAt
    }
  });
});

app.get("/api/assessments/:assessmentId/sessions", async (request, response) => {
  response.json(await service.listSessions(request.params.assessmentId, requireInstructor(request)));
});

app.post("/api/device-links/exchange", async (request, response) => {
  response.json(await service.exchangeInstallToken(request.body));
});

app.get("/api/instructions", async (request, response) => {
  const assessmentId = typeof request.query.assessmentId === "string" ? request.query.assessmentId : undefined;
  response.json(await service.getInstructions(assessmentId, requireAuth(request)));
});

app.get("/api/time-remaining/:sessionId", async (request, response) => {
  response.json(await service.getTimeRemaining(request.params.sessionId, requireAuth(request)));
});

app.post("/api/sessions", async (request, response) => {
  response.status(201).json(await service.startAssessment(request.body, requireAuth(request)));
});

app.post("/api/sessions/:sessionId/next-prompt", async (request, response) => {
  response.json(await service.nextPrompt(request.params.sessionId, requireAuth(request)));
});

app.post("/api/sessions/:sessionId/responses", async (request, response) => {
  response.status(201).json(
    await service.submitResponse(
      {
        sessionId: request.params.sessionId,
        promptId: request.body.promptId,
        content: request.body.content
      },
      requireAuth(request)
    )
  );
});

app.post("/api/sessions/:sessionId/confidence", async (request, response) => {
  response.status(201).json(
    await service.recordConfidence(
      {
        sessionId: request.params.sessionId,
        promptId: request.body.promptId,
        value: request.body.value,
        explanation: request.body.explanation
      },
      requireAuth(request)
    )
  );
});

app.post("/api/sessions/:sessionId/reflections", async (request, response) => {
  response.status(201).json(
    await service.submitReflection(
      {
        sessionId: request.params.sessionId,
        content: request.body.content,
        focus: request.body.focus
      },
      requireAuth(request)
    )
  );
});

app.post("/api/sessions/:sessionId/artifacts", async (request, response) => {
  response.status(201).json(
    await service.uploadArtifact(
      {
        sessionId: request.params.sessionId,
        name: request.body.name,
        mimeType: request.body.mimeType,
        contentBase64: request.body.contentBase64
      },
      requireAuth(request)
    )
  );
});

app.post("/api/sessions/:sessionId/complete", async (request, response) => {
  response.json(await service.completeSession(request.params.sessionId, requireAuth(request)));
});

app.post("/api/artifacts/analyze", async (request, response) => {
  response.json(await service.analyzeArtifact(request.body, requireInstructor(request)));
});

app.get("/api/reports/student/:sessionId", async (request, response) => {
  response.json(await service.getStudentReport(request.params.sessionId, requireAuth(request)));
});

app.get("/api/reports/class/:assessmentId", async (request, response) => {
  response.json(await service.getClassReport(request.params.assessmentId, requireInstructor(request)));
});

app.get("/api/reports/export/:assessmentId", async (request, response) => {
  const format = request.query.format === "csv" ? "csv" : "json";
  response.json(await service.exportResults(request.params.assessmentId, format, requireInstructor(request)));
});

app.get("/downloads/slam-agent.mcpb", async (request, response) => {
  const installToken = typeof request.query.installToken === "string" ? request.query.installToken : "";
  if (!installToken) {
    response.status(400).json({ error: "installToken query parameter is required." });
    return;
  }

  const bundle = await buildBundle(installToken);
  response.setHeader("content-type", "application/octet-stream");
  response.setHeader("content-disposition", 'attachment; filename="slam-agent.mcpb"');
  response.send(bundle);
});

const publicDir = resolve(__dirname, "../public");
app.use(express.static(publicDir));
app.get("/", (_request, response) => {
  response.sendFile(resolve(publicDir, "index.html"));
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  response.status(statusForError(error)).send(message);
});

app.listen(config.port, () => {
  console.log(`SLAM API listening on ${config.publicBaseUrl}`);
  console.log(`Demo instructor token: ${config.devInstructorToken}`);
});
