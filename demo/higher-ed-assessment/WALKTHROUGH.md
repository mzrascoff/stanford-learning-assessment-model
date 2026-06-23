# Higher-Ed Assessment Demo Walkthrough

This demo is tuned for assessment-and-outcomes conversations with Gates and Anthropic. It shows SLAM as a formative assessment layer around AI-enabled learning work: instructors define an outcome-aligned assessment, learners complete guided MCP sessions, and SLAM exports evidence-backed student and class reports.

## Scenario

Course: `EDUC 240: Assessment, Learning Analytics, and Equity`

Assessment: `EDUC 240 Outcomes Evidence Memo`

Learner task: advise a gateway biology instructor on whether students are meeting the course outcome `Interpret experimental results and justify a claim with evidence.`

Dashboard evidence used in the task:

- section average: 72 percent
- first-generation students: 64 percent
- continuing-generation students: 78 percent
- lab-note completion: 91 percent
- claim-evidence rubric pass rate: 58 percent

The assessment asks learners to produce an evidence memo, recommend an assessment action, and record a calibration note before sharing advice with a program assessment committee.

## What To Show

1. Open the instructor console at `http://localhost:4000` and use the local instructor token `slam-dev-instructor-token`.
2. Point to the generated assessment blueprint in `demo/higher-ed-assessment/exports/assessment.json`.
3. Show one individual report, for example `demo/higher-ed-assessment/exports/student-report-student-001.json`.
4. Show the class report in `demo/higher-ed-assessment/exports/class-report.json`.
5. Show the CSV export in `demo/higher-ed-assessment/exports/slam-export.csv` as the bridge to institutional analytics or outcomes reporting workflows.

## Talk Track

SLAM is not grading students. It is collecting process evidence during the learner's AI workflow and turning it into formative assessment signals.

For the student view, highlight:

- rubric dimensions include both cognitive outcomes and metacognitive calibration
- each score is attached to cited evidence from session events or uploaded artifacts
- reports include strengths, gaps, and next steps rather than final grades
- confidence is reported separately from performance so instructors can see calibration

For the class view, highlight:

- aggregate dimensions show average score, average confidence, and below-target counts
- misconception clusters identify where instruction or assessment design needs follow-up
- exemplar snippets give instructors concrete evidence to discuss in moderation or advising
- exports preserve student and class evidence for program assessment without requiring an LMS rebuild

## Regenerate The Demo

Run:

```bash
npm run demo:higher-ed
```

This recreates the course, assessment, six learner sessions, individual student reports, class report, JSON export, and CSV export under `demo/higher-ed-assessment/exports`.

The script also seeds the API workspace's default local store at `apps/api/.slam-data`, so the instructor console can show the same assessment and sessions after the API starts. Set `SLAM_DEMO_DATA_DIR` or `SLAM_DATA_DIR` if you want to seed a different store.
