import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SlamApiClient } from "./api-client.js";
import type { CreateAssessmentInput } from "./contracts.js";

function textResult(title: string, payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${title}\n\n${JSON.stringify(payload, null, 2)}`
      }
    ]
  };
}

const rubricDimensionSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(["cognitive", "metacognitive"]),
  scale: z.object({
    min: z.number(),
    max: z.number(),
    labels: z.array(z.string()).optional()
  }),
  criteria: z.array(z.string()),
  evidenceRequirements: z.array(z.string())
});

const anchorSchema = z.object({
  id: z.string(),
  dimensionId: z.string(),
  performanceLevel: z.string(),
  excerpt: z.string(),
  rationale: z.string()
});

const promptSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  responseType: z.enum(["text", "code", "reflection", "file"]),
  guidance: z.string().optional(),
  targetDimensionIds: z.array(z.string())
});

export function createSlamMcpServer(api: SlamApiClient, metadata: { name: string; version: string }) {
  const server = new McpServer(metadata);
  const resourceParam = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  server.resource(
    "assessment-instructions",
    new ResourceTemplate("slam://instructions/{assessmentId}", { list: undefined }),
    async (uri, { assessmentId }) => {
      const resolvedAssessmentId = resourceParam(assessmentId);
      const instructions = await api.getInstructions(resolvedAssessmentId === "current" ? undefined : resolvedAssessmentId);
      return {
        contents: [
          {
            uri: uri.href,
            text: instructions.instructions
          }
        ]
      };
    }
  );

  server.resource(
    "time-remaining",
    new ResourceTemplate("slam://time-remaining/{sessionId}", { list: undefined }),
    async (uri, { sessionId }) => {
      const resolvedSessionId = resourceParam(sessionId);
      if (!resolvedSessionId) {
        throw new Error("sessionId is required.");
      }
      const timeRemaining = await api.getTimeRemaining(resolvedSessionId);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(timeRemaining, null, 2)
          }
        ]
      };
    }
  );

  server.prompt(
    "reflection-coach",
    {
      challenge: z.string(),
      evidence: z.string().optional()
    },
    ({ challenge, evidence }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help the learner reflect on this challenge: ${challenge}.${evidence ? ` Evidence to consider: ${evidence}` : ""} Ask them to name their confidence, uncertainty, and next verification step.`
          }
        }
      ]
    })
  );

  server.tool(
    "start_assessment",
    {
      assessmentId: z.string().optional(),
      studentName: z.string().optional()
    },
    async (input) => textResult("Assessment session started", await api.startAssessment(input))
  );

  server.tool(
    "next_prompt",
    {
      sessionId: z.string()
    },
    async ({ sessionId }) => textResult("Next prompt", await api.nextPrompt(sessionId))
  );

  server.tool(
    "submit_response",
    {
      sessionId: z.string(),
      promptId: z.string(),
      content: z.string()
    },
    async (input) => textResult("Response submitted", await api.submitResponse(input))
  );

  server.tool(
    "record_confidence",
    {
      sessionId: z.string(),
      promptId: z.string(),
      value: z.number().min(1).max(5),
      explanation: z.string().optional()
    },
    async (input) => textResult("Confidence recorded", await api.recordConfidence(input))
  );

  server.tool(
    "submit_reflection",
    {
      sessionId: z.string(),
      content: z.string(),
      focus: z.string().optional()
    },
    async (input) => textResult("Reflection submitted", await api.submitReflection(input))
  );

  server.tool(
    "upload_artifact",
    {
      sessionId: z.string(),
      name: z.string(),
      mimeType: z.string(),
      contentBase64: z.string()
    },
    async (input) => textResult("Artifact uploaded", await api.uploadArtifact(input))
  );

  server.tool(
    "end_assessment",
    {
      sessionId: z.string()
    },
    async ({ sessionId }) => textResult("Assessment completed", await api.endAssessment(sessionId))
  );

  server.tool(
    "create_assessment",
    {
      courseId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      durationMinutes: z.number().min(5).max(240),
      deliveryMode: z.enum(["guided", "artifact", "hybrid"]),
      feedbackVisibility: z.enum(["instructor_only", "instructor_and_student"]),
      rubricDimensions: z.array(rubricDimensionSchema),
      anchorExamples: z.array(anchorSchema).optional(),
      promptSequence: z.array(promptSchema),
      artifactTypes: z.array(z.string()).optional()
    },
    async (input) => textResult("Assessment created", await api.createAssessment(input as CreateAssessmentInput))
  );

  server.tool(
    "publish_install_link",
    {
      assessmentId: z.string(),
      studentId: z.string().optional(),
      studentName: z.string().optional(),
      expiresInDays: z.number().min(1).max(30).optional()
    },
    async (input) => textResult("Install link published", await api.publishInstallLink(input))
  );

  server.tool(
    "list_sessions",
    {
      assessmentId: z.string()
    },
    async ({ assessmentId }) => textResult("Assessment sessions", await api.listSessions(assessmentId))
  );

  server.tool(
    "get_student_report",
    {
      sessionId: z.string()
    },
    async ({ sessionId }) => textResult("Student report", await api.getStudentReport(sessionId))
  );

  server.tool(
    "get_class_report",
    {
      assessmentId: z.string()
    },
    async ({ assessmentId }) => textResult("Class report", await api.getClassReport(assessmentId))
  );

  server.tool(
    "export_results",
    {
      assessmentId: z.string(),
      format: z.enum(["json", "csv"]).default("json")
    },
    async ({ assessmentId, format }) => textResult("Export payload", await api.exportResults(assessmentId, format))
  );

  return server;
}
