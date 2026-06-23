import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileStore } from "./file-store.js";
import { SlamService } from "./service.js";
import { buildStarterAnchors, buildStarterPrompts, getAllStarterDimensions } from "./starter-dimensions.js";

async function createService() {
  const dataDir = await mkdtemp(join(tmpdir(), "slam-test-"));
  const store = new FileStore(dataDir);
  const service = new SlamService(store, {
    publicBaseUrl: "http://localhost:4000",
    syncEvaluation: true,
    devInstructorToken: "test-instructor-token"
  });
  await service.seed();
  const instructor = await service.authenticate("test-instructor-token");
  assert(instructor);
  return {
    dataDir,
    service,
    instructor
  };
}

test("publishes install link and generates reports for a completed session", async () => {
  const { dataDir, service, instructor } = await createService();
  const dimensions = getAllStarterDimensions().slice(0, 2);
  const assessment = await service.createAssessment(
    {
      courseId: "course-demo",
      title: "Argument quality check",
      durationMinutes: 20,
      deliveryMode: "guided",
      feedbackVisibility: "instructor_and_student",
      rubricDimensions: dimensions,
      anchorExamples: buildStarterAnchors(dimensions),
      promptSequence: buildStarterPrompts(dimensions),
      artifactTypes: ["text/plain"]
    },
    instructor
  );

  const published = await service.publishInstallLink({ assessmentId: assessment.id, studentName: "Jordan" }, instructor);
  assert.match(published.downloadUrl, /slam-agent\.mcpb/);

  const exchanged = await service.exchangeInstallToken({ installToken: published.installToken.token, clientName: "Learner Device" });
  const student = await service.authenticate(exchanged.accessToken);
  assert(student);

  const session = await service.startAssessment({ studentName: "Jordan" }, student);
  const nextPrompt = await service.nextPrompt(session.id, student);
  assert(nextPrompt.prompt);

  await service.submitResponse(
    {
      sessionId: session.id,
      promptId: nextPrompt.prompt.id,
      content: "I claim the strongest answer uses two pieces of evidence because the prompt asks for justification and a clear rationale."
    },
    student
  );

  await service.recordConfidence(
    {
      sessionId: session.id,
      promptId: nextPrompt.prompt.id,
      value: 4,
      explanation: "I am confident in the claim but want to verify the evidence fit."
    },
    student
  );

  await service.submitReflection(
    {
      sessionId: session.id,
      content: "I noticed I still need to verify whether my evidence is precise enough, so I would revise the explanation after checking the source.",
      focus: "monitoring"
    },
    student
  );

  await service.completeSession(session.id, student);
  const report = await service.getStudentReport(session.id, instructor);
  const classReport = await service.getClassReport(assessment.id, instructor);

  assert.equal(report.assessmentId, assessment.id);
  assert.equal(classReport.assessmentId, assessment.id);
  assert.ok(report.dimensionResults.length >= 1);

  await rm(dataDir, { recursive: true, force: true });
});

test("CSV export quotes fields and neutralizes formula injection", async () => {
  const { dataDir, service, instructor } = await createService();
  const dimensions = getAllStarterDimensions().slice(0, 1);
  const assessment = await service.createAssessment(
    {
      courseId: "course-demo",
      title: "Export safety",
      durationMinutes: 20,
      deliveryMode: "artifact",
      feedbackVisibility: "instructor_and_student",
      rubricDimensions: dimensions,
      anchorExamples: buildStarterAnchors(dimensions),
      promptSequence: buildStarterPrompts(dimensions),
      artifactTypes: ["text/plain"]
    },
    instructor
  );

  await service.analyzeArtifact(
    {
      assessmentId: assessment.id,
      studentId: "student-csv",
      // Comma + quote would break columns; leading "=" is a spreadsheet formula.
      studentName: '=cmd(),"Doe"',
      name: "submission.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("I claim X because Y, and I verified the result.").toString("base64")
    },
    instructor
  );

  const csv = await service.exportResults(assessment.id, "csv", instructor);
  const lines = csv.body.split("\n");
  const headerLine = lines[0] ?? "";
  const dataLine = lines[1] ?? "";

  // Formula-leading cell is prefixed with a quote and the whole field is quoted,
  // with embedded double-quotes doubled per RFC 4180.
  assert.match(dataLine, /"'=cmd\(\),""Doe"""/);
  // The injected comma stays inside its quoted field rather than adding a column.
  assert.equal(headerLine.split(",").length, 7);

  await rm(dataDir, { recursive: true, force: true });
});
