import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  FileStore,
  SlamService,
  type AssessmentBlueprint,
  type ClassReport,
  type RubricDimension,
  type StudentReport
} from "../packages/slam-core/src/index.js";

const dataDir = resolve(process.env.SLAM_DEMO_DATA_DIR ?? process.env.SLAM_DATA_DIR ?? "apps/api/.slam-data");
const exportsDir = resolve("demo/higher-ed-assessment/exports");
const instructorToken = process.env.SLAM_DEV_INSTRUCTOR_TOKEN ?? "slam-dev-instructor-token";
const courseId = "course-educ-240";
const assessmentTitle = "EDUC 240 Outcomes Evidence Memo";

const dimensions: RubricDimension[] = [
  {
    id: "outcome-evidence-alignment",
    label: "Outcome evidence alignment",
    category: "cognitive",
    scale: { min: 1, max: 4, labels: ["emerging", "developing", "proficient", "advanced"] },
    criteria: [
      "Maps claims to a stated course or program outcome.",
      "Uses direct evidence from student work or learning analytics.",
      "Explains why the evidence is sufficient or insufficient for the outcome."
    ],
    evidenceRequirements: [
      "At least one named learning outcome",
      "At least two concrete evidence points from the case materials"
    ]
  },
  {
    id: "equity-validity-reasoning",
    label: "Equity and validity reasoning",
    category: "cognitive",
    scale: { min: 1, max: 4, labels: ["emerging", "developing", "proficient", "advanced"] },
    criteria: [
      "Identifies who may be overrepresented, underrepresented, or misclassified by the measure.",
      "Distinguishes performance gaps from measurement or access gaps.",
      "Recommends a validation check before making an instructional decision."
    ],
    evidenceRequirements: [
      "A subgroup or access-related observation",
      "A specific validity or bias check"
    ]
  },
  {
    id: "metacognitive-calibration",
    label: "Metacognitive calibration",
    category: "metacognitive",
    scale: { min: 1, max: 4, labels: ["emerging", "developing", "proficient", "advanced"] },
    criteria: [
      "Tracks confidence in the interpretation.",
      "Names what remains uncertain or incomplete.",
      "Plans a concrete next check or revision."
    ],
    evidenceRequirements: [
      "A confidence or uncertainty statement",
      "A revision, verification, or stakeholder follow-up plan"
    ]
  }
];

const promptSequence: AssessmentBlueprint["promptSequence"] = [
  {
    id: "outcomes-memo",
    title: "Outcomes evidence memo",
    prompt:
      "You are advising a gateway biology instructor. Write a short evidence memo about whether students are meeting the outcome: 'Interpret experimental results and justify a claim with evidence.' Use the provided dashboard: section average 72 percent, first-generation students 64 percent, continuing-generation students 78 percent, lab-note completion 91 percent, and claim-evidence rubric pass rate 58 percent.",
    responseType: "text",
    guidance:
      "Tie each claim to a learning outcome and at least two evidence points. Separate outcome performance from possible measurement limitations.",
    targetDimensionIds: ["outcome-evidence-alignment", "equity-validity-reasoning"]
  },
  {
    id: "assessment-action",
    title: "Assessment action plan",
    prompt:
      "Recommend one near-term assessment action and one instructional follow-up. Explain what outcome signal each action would strengthen and what equity or validity risk it would reduce.",
    responseType: "text",
    guidance:
      "Prefer specific checks, such as rubric moderation, disaggregated item review, artifact sampling, or a targeted revision opportunity.",
    targetDimensionIds: ["outcome-evidence-alignment", "equity-validity-reasoning"]
  },
  {
    id: "calibration-note",
    title: "Calibration note",
    prompt:
      "Record your confidence, what you are uncertain about, and how you would verify or revise the recommendation before sharing it with the program assessment committee.",
    responseType: "reflection",
    guidance: "Name one confidence level, one uncertainty, and one next verification step.",
    targetDimensionIds: ["metacognitive-calibration"]
  }
];

const anchorExamples: AssessmentBlueprint["anchorExamples"] = [
  {
    id: "anchor-outcome-evidence-alignment-advanced",
    dimensionId: "outcome-evidence-alignment",
    performanceLevel: "advanced",
    excerpt:
      "The memo names the target outcome, uses pass-rate and subgroup evidence, and explains why a rubric artifact sample is needed before concluding mastery.",
    rationale:
      "Strong evidence alignment connects the course outcome, direct student artifacts, and limits of the available measure."
  },
  {
    id: "anchor-equity-validity-reasoning-advanced",
    dimensionId: "equity-validity-reasoning",
    performanceLevel: "advanced",
    excerpt:
      "The response treats the first-generation gap as a signal to investigate access and scoring consistency, not as a fixed learner deficit.",
    rationale:
      "Advanced validity reasoning separates learning needs from possible measurement and opportunity-to-learn effects."
  },
  {
    id: "anchor-metacognitive-calibration-advanced",
    dimensionId: "metacognitive-calibration",
    performanceLevel: "advanced",
    excerpt:
      "The learner states confidence, identifies missing rubric artifacts, and proposes a concrete moderation check before final recommendations.",
    rationale:
      "Calibration is visible when uncertainty changes the next evidence-gathering step."
  }
];

interface LearnerSeed {
  id: string;
  name: string;
  responses: Partial<Record<string, string>>;
  confidence?: {
    value: number;
    explanation: string;
  };
  reflection?: string;
  artifact?: string;
}

const learners: LearnerSeed[] = [
  {
    id: "student-001",
    name: "Avery Patel",
    responses: {
      "outcomes-memo":
        "The outcome is not just general biology success; it is the ability to interpret results and justify a claim with evidence. I would not use the 72 percent section average alone because it mixes many skills. The more direct signal is that only 58 percent passed the claim-evidence rubric, even though 91 percent completed lab notes. Therefore students are doing the activity but many are not yet converting observations into justified claims. The first-generation group average of 64 percent compared with 78 percent suggests an equity signal, but I would verify whether the rubric examples, lab access, or scoring consistency differ before interpreting it as only a learning gap.",
      "assessment-action":
        "The near-term assessment action is a blind moderation pass on 20 lab-note artifacts, stratified by first-generation status and section attendance. That would strengthen the outcome signal because it checks whether the claim-evidence rubric is scoring the intended outcome consistently. The instructional follow-up is a short revision cycle where students compare two claim-evidence examples and revise one lab conclusion. This reduces the risk that the dashboard gap reflects unclear expectations rather than ability. I would also compare completion timing because late lab-note completion may mask access barriers."
    },
    confidence: {
      value: 4,
      explanation:
        "I am confident that the rubric pass rate is the strongest outcome signal, but uncertain whether subgroup differences reflect scoring, access, or instruction."
    },
    reflection:
      "I would verify my recommendation by sampling actual lab notes, double-checking rubric reliability, and asking whether students saw anchor examples before the task. If those checks contradicted my assumption, I would revise the plan before sending it to the committee.",
    artifact:
      "Outcome: interpret experimental results and justify a claim with evidence.\nEvidence used: 58 percent claim-evidence pass rate, 91 percent lab-note completion, 64/78 subgroup split.\nProposed validity check: blind rubric moderation plus disaggregated artifact sampling."
  },
  {
    id: "student-002",
    name: "Jordan Kim",
    responses: {
      "outcomes-memo":
        "The evidence suggests a partial outcome gap. The 72 percent average makes the course look acceptable, but the relevant outcome asks students to justify claims with evidence, and only 58 percent pass that rubric. Because lab-note completion is 91 percent, the problem is probably not participation alone. I noticed the first-generation average is lower, so the next step should compare whether those students had the same access to examples and feedback. This reminds me of a previous assessment case where a subgroup gap got smaller after the rubric language was clarified.",
      "assessment-action":
        "I would add a common claim-evidence item to the next lab and review a small sample with two raters. The action strengthens evidence for the target outcome because it checks the same skill directly. The follow-up would be a worked-example mini lesson plus a chance to revise claims. The equity risk it reduces is assuming the 64 percent average means lower ability when it may be uncertainty about what the rubric requires."
    },
    confidence: {
      value: 4,
      explanation:
        "My confidence is fairly high because two direct indicators point to claim-evidence weakness, but I would verify the subgroup pattern."
    },
    reflection:
      "I would test the recommendation by comparing scores before and after a worked-example revision. I am uncertain about whether the existing rubric was calibrated, so I would ask for two raters on a sample.",
    artifact:
      "Action table: direct outcome evidence = common claim-evidence item; validation = two-rater scoring; equity check = compare access to examples and feedback."
  },
  {
    id: "student-003",
    name: "Maya Rodriguez",
    responses: {
      "outcomes-memo":
        "The class average is 72 percent and the lab-note completion rate is 91 percent, so most students seem to be doing fine. First-generation students are lower than continuing-generation students, which means the instructor should spend more time helping that group. The rubric pass rate is 58 percent, so students also need clearer writing. Overall I think the outcome is being met by some students but not all.",
      "assessment-action":
        "The instructor should give more practice with writing claims. I would also show examples because students may be uncertain. A follow-up assessment could be another lab report. This would help students improve and make the outcome clearer."
    },
    confidence: {
      value: 3,
      explanation:
        "I am somewhat confident, but I did not check whether the measures are aligned or whether the subgroup gap has another explanation."
    },
    reflection:
      "I would revise by adding more direct evidence from student work and double-checking what the rubric pass rate means.",
    artifact:
      "Notes: class average 72; first-generation 64; continuing-generation 78; completion 91; rubric pass 58."
  },
  {
    id: "student-004",
    name: "Samira Lee",
    responses: {
      "outcomes-memo":
        "Students are not meeting the learning outcome because the pass rate is 58 percent. The first-generation score is 64 percent, so that group is behind. The class average is 72 percent."
    },
    confidence: {
      value: 2,
      explanation: "I am uncertain because I only used the numbers and did not verify the evidence."
    },
    reflection:
      "I would check actual student work next time and revise the recommendation after seeing examples."
  },
  {
    id: "student-005",
    name: "Diego Nguyen",
    responses: {
      "outcomes-memo":
        "The outcome evidence is mixed because average performance and completion are not the same as claim-evidence mastery. I would privilege the 58 percent rubric pass rate because it directly matches interpreting results and justifying a claim. However, the 64 versus 78 subgroup difference is a warning about equity and validity. It could be a real learning gap, a feedback access gap, or a scoring gap if examples were not culturally or linguistically clear. Therefore I would not label one group as deficient without a verification step.",
      "assessment-action":
        "Near term, run a disaggregated rubric audit with two raters and compare which rubric rows drive failures. Instructionally, assign a 15-minute claim revision using one common data display, then reassess the same outcome. This strengthens the outcome signal because it uses a direct artifact and reduces the validity risk of relying on a course average. It also gives students an opportunity to learn from the assessment instead of only being measured by it."
    },
    confidence: {
      value: 5,
      explanation:
        "I am confident in the assessment logic because the recommendation follows the outcome, evidence, and validity concern."
    },
    reflection:
      "The main uncertainty is whether the rubric pass rate was reliable. I would verify with interrater agreement and revise the plan if raters disagree. I would also monitor whether confidence changes after seeing the artifact sample.",
    artifact:
      "Committee-ready recommendation: do not report final outcome attainment until a disaggregated rubric audit and short reassessment confirm the signal."
  },
  {
    id: "student-006",
    name: "Taylor Brooks",
    responses: {
      "outcomes-memo":
        "The dashboard says 72 percent, so the outcome is probably okay. The lower first-generation score should be mentioned. The rubric pass rate also looks low."
    }
  }
];

function toBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

async function removePriorDemo(store: FileStore) {
  await store.transaction((state) => {
    const assessmentIds = new Set(
      state.assessments.filter((assessment) => assessment.title === assessmentTitle).map((assessment) => assessment.id)
    );
    const sessionIds = new Set(state.sessions.filter((session) => assessmentIds.has(session.assessmentId)).map((session) => session.id));

    state.courses = state.courses.filter((course) => course.id !== courseId);
    state.assessments = state.assessments.filter((assessment) => !assessmentIds.has(assessment.id));
    state.sessions = state.sessions.filter((session) => !sessionIds.has(session.id));
    state.sessionEvents = state.sessionEvents.filter((event) => !sessionIds.has(event.sessionId));
    state.studentReports = state.studentReports.filter((report) => !sessionIds.has(report.sessionId));
    state.classReports = state.classReports.filter((report) => !assessmentIds.has(report.assessmentId));
    state.installTokens = state.installTokens.filter((token) => !token.assessmentId || !assessmentIds.has(token.assessmentId));
    state.accessTokens = state.accessTokens.filter((token) => !token.assessmentId || !assessmentIds.has(token.assessmentId));
    state.queueJobs = state.queueJobs.filter((job) => !assessmentIds.has(job.assessmentId));

    state.courses.push({
      id: courseId,
      tenantId: "tenant-demo",
      title: "EDUC 240: Assessment, Learning Analytics, and Equity",
      section: "Spring assessment studio"
    });
  });
}

async function runLearner(service: SlamService, assessment: AssessmentBlueprint, instructor: NonNullable<Awaited<ReturnType<SlamService["authenticate"]>>>, learner: LearnerSeed) {
  const published = await service.publishInstallLink(
    {
      assessmentId: assessment.id,
      studentId: learner.id,
      studentName: learner.name,
      expiresInDays: 14
    },
    instructor
  );
  const exchanged = await service.exchangeInstallToken({
    installToken: published.installToken.token,
    clientName: `${learner.name} MCP client`
  });
  const student = await service.authenticate(exchanged.accessToken);
  if (!student) {
    throw new Error(`Could not authenticate seeded learner ${learner.name}.`);
  }

  const session = await service.startAssessment({ studentName: learner.name }, student);
  for (const prompt of assessment.promptSequence) {
    await service.nextPrompt(session.id, student);
    const content = learner.responses[prompt.id];
    if (content) {
      await service.submitResponse({ sessionId: session.id, promptId: prompt.id, content }, student);
    }
    if (prompt.id === "calibration-note" && learner.confidence) {
      await service.recordConfidence(
        {
          sessionId: session.id,
          promptId: prompt.id,
          value: learner.confidence.value,
          explanation: learner.confidence.explanation
        },
        student
      );
    }
  }

  if (learner.reflection) {
    await service.submitReflection(
      {
        sessionId: session.id,
        focus: "assessment calibration",
        content: learner.reflection
      },
      student
    );
  }

  if (learner.artifact) {
    await service.uploadArtifact(
      {
        sessionId: session.id,
        name: `${learner.id}-outcomes-notes.md`,
        mimeType: "text/markdown",
        contentBase64: toBase64(learner.artifact)
      },
      student
    );
  }

  await service.completeSession(session.id, student);
  return service.getStudentReport(session.id, instructor);
}

function buildSummary(assessment: AssessmentBlueprint, classReport: ClassReport, reports: StudentReport[]) {
  const lines = [
    "# Generated Higher-Ed Demo Summary",
    "",
    `Assessment: ${assessment.title}`,
    `Assessment ID: ${assessment.id}`,
    `Learner sessions: ${classReport.sessionCount}`,
    "",
    "## Class Outcome Signals",
    "",
    "| Dimension | Average score | Below target | Avg confidence |",
    "| --- | ---: | ---: | ---: |",
    ...classReport.aggregateDimensions.map(
      (dimension) =>
        `| ${dimension.label} | ${dimension.averageScore} / 4 | ${dimension.belowTargetCount} | ${dimension.averageConfidence} |`
    ),
    "",
    "## Student Report Index",
    "",
    "| Student | Session | Overall formative summary |",
    "| --- | --- | --- |",
    ...reports.map(
      (report) =>
        `| ${report.studentName ?? report.studentId} | ${report.sessionId} | ${report.overallSummary.replace(/\|/g, "\\|")} |`
    ),
    "",
    "## Useful Files",
    "",
    "- `class-report.json`: instructor-facing class aggregate with misconception clusters and exemplar snippets.",
    "- `student-reports.json`: all individual formative reports.",
    "- `student-report-*.json`: one report per learner, useful for a student-view walkthrough.",
    "- `slam-export.json`: native SLAM export payload with class and student reports.",
    "- `slam-export.csv`: row-level dimension scores for analysis in a spreadsheet."
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  await mkdir(exportsDir, { recursive: true });

  const store = new FileStore(dataDir);
  const service = new SlamService(store, {
    publicBaseUrl: "http://localhost:4000",
    syncEvaluation: true,
    devInstructorToken: instructorToken,
    artifactDataDir: resolve(dataDir, "artifacts")
  });
  await service.seed();
  await removePriorDemo(store);

  const instructor = await service.authenticate(instructorToken);
  if (!instructor) {
    throw new Error("Demo instructor token was not accepted.");
  }

  const assessment = await service.createAssessment(
    {
      courseId,
      title: assessmentTitle,
      description:
        "A higher-ed assessment conversation demo focused on course outcome evidence, equity-validity checks, and formative next steps.",
      durationMinutes: 35,
      deliveryMode: "guided",
      feedbackVisibility: "instructor_and_student",
      rubricDimensions: dimensions,
      anchorExamples,
      promptSequence,
      artifactTypes: ["text/plain", "text/markdown"]
    },
    instructor
  );

  const reports: StudentReport[] = [];
  for (const learner of learners) {
    reports.push(await runLearner(service, assessment, instructor, learner));
  }

  const classReport = await service.getClassReport(assessment.id, instructor);
  const jsonExport = await service.exportResults(assessment.id, "json", instructor);
  const csvExport = await service.exportResults(assessment.id, "csv", instructor);

  await writeFile(resolve(exportsDir, "assessment.json"), `${JSON.stringify(assessment, null, 2)}\n`, "utf8");
  await writeFile(resolve(exportsDir, "class-report.json"), `${JSON.stringify(classReport, null, 2)}\n`, "utf8");
  await writeFile(resolve(exportsDir, "student-reports.json"), `${JSON.stringify(reports, null, 2)}\n`, "utf8");
  await writeFile(resolve(exportsDir, "slam-export.json"), `${jsonExport.body}\n`, "utf8");
  await writeFile(resolve(exportsDir, "slam-export.csv"), `${csvExport.body}\n`, "utf8");

  for (const report of reports) {
    await writeFile(
      resolve(exportsDir, `student-report-${report.studentId}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
  }

  await writeFile(resolve(exportsDir, "summary.md"), buildSummary(assessment, classReport, reports), "utf8");

  console.log(`Seeded ${reports.length} learner sessions for ${assessment.title}`);
  console.log(`Assessment ID: ${assessment.id}`);
  console.log(`Exports written to ${exportsDir}`);
}

await main();
