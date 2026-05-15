# SLAM

Stanford Learning Assessment Model (SLAM) is a cloud-native formative assessment layer for AI workflows. It combines:

- a cloud API for instructor setup, reporting, and signed install-link issuance
- a remote MCP server over Streamable HTTP for direct cloud MCP integration
- a background worker for session evaluation and class report regeneration
- a thin installable `.mcpb` bridge (`slam-agent`) for one-click learner install

SLAM is intentionally formative in this version. Reports surface evidence, uncertainty, strengths, gaps, and next steps. They do not calculate final grades.

## Workspace layout

- `packages/slam-core`: shared contracts, file-backed local store, deterministic evaluator, API client, reusable MCP tool registration
- `apps/api`: instructor-facing web/API service and dynamic `.mcpb` download endpoint
- `apps/mcp-server`: remote MCP server using Streamable HTTP transport
- `apps/worker`: polling worker for queued session evaluation jobs
- `apps/slam-agent`: installable stdio MCP bridge packaged as `.mcpb`

## Local quickstart

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build everything:
   ```bash
   npm run build
   ```
3. Start the API, remote MCP server, and worker in separate terminals:
   ```bash
   npm run dev:api
   npm run dev:mcp
   npm run dev:worker
   ```
4. Open the instructor console at [http://localhost:4000](http://localhost:4000).
5. Use the default local instructor token:
   ```text
   slam-dev-instructor-token
   ```

## Higher-ed assessment demo

For Gates and Anthropic assessment conversations, seed a concrete higher-ed outcomes scenario:

```bash
npm run demo:higher-ed
```

This creates `EDUC 240 Outcomes Evidence Memo`, six believable learner sessions, individual student reports, a class report, and JSON/CSV exports. The walkthrough is at [demo/higher-ed-assessment/WALKTHROUGH.md](/Users/mrascoff/Documents/Codex/demo/higher-ed-assessment/WALKTHROUGH.md), and generated exports are under [demo/higher-ed-assessment/exports](/Users/mrascoff/Documents/Codex/demo/higher-ed-assessment/exports).

## AWS deployment

The repo includes a repeatable single-instance AWS deployment that provisions:

- one EC2 host running the API, remote MCP server, worker, and nginx
- one deployment artifact bucket
- one runtime artifact bucket for student uploads
- one IAM instance role/profile
- one public security group on port `80`

Commands:

```bash
npm run deploy:aws
npm run test:aws
npm run destroy:aws
```

Notes:

- the deploy script targets the configured AWS CLI region and defaults to `us-west-2`
- the CloudFormation template is at [deploy/aws/slam-ec2.yaml](/Users/mrascoff/Documents/Codex/deploy/aws/slam-ec2.yaml)
- the EC2 bootstrap installs Node 22 so the AWS SDK runtime matches the app's S3 artifact-store dependency requirements

## What is implemented

### Instructor workflows

- create assessment blueprints with rubric dimensions, anchor examples, prompt sequences, duration, and feedback visibility
- publish a signed install link that downloads a tenant-bound `.mcpb` package
- inspect student sessions, student reports, class reports, and export payloads
- submit artifact-only analyses through the web app or API

### Student workflows

- exchange a one-time install token for a scoped access token on first launch
- start timed guided assessments
- fetch prompts, submit responses, record confidence, submit reflections, and upload artifacts
- end the assessment and trigger report generation

### Reporting

- versioned `SessionEvent` audit trail for all student actions
- student reports with rubric scores, confidence, evidence citations, strengths, gaps, and next steps
- class reports with aggregates, misconception clusters, and exemplar snippets
- JSON and CSV export payload generation

## API surface

Base URL: `http://localhost:4000/api`

Key endpoints:

- `GET /health`
- `GET /starter-dimensions`
- `POST /assessments`
- `POST /assessments/:assessmentId/publish`
- `POST /device-links/exchange`
- `POST /sessions`
- `POST /sessions/:sessionId/next-prompt`
- `POST /sessions/:sessionId/responses`
- `POST /sessions/:sessionId/confidence`
- `POST /sessions/:sessionId/reflections`
- `POST /sessions/:sessionId/artifacts`
- `POST /sessions/:sessionId/complete`
- `GET /reports/student/:sessionId`
- `GET /reports/class/:assessmentId`
- `GET /reports/export/:assessmentId?format=json|csv`
- `GET /instructions`
- `GET /time-remaining/:sessionId`

The `.mcpb` download endpoint is:

- `GET /downloads/slam-agent.mcpb?installToken=...`

## MCP interfaces

### Student tools

- `start_assessment`
- `next_prompt`
- `submit_response`
- `record_confidence`
- `submit_reflection`
- `upload_artifact`
- `end_assessment`

### Instructor tools

- `create_assessment`
- `publish_install_link`
- `list_sessions`
- `get_student_report`
- `get_class_report`
- `export_results`

### Resources and prompts

- `slam://instructions/{assessmentId}`
- `slam://time-remaining/{sessionId}`
- `reflection-coach`

## MCPB package

The bridge package lives at [apps/slam-agent/manifest.template.json](/Users/mrascoff/Documents/Codex/apps/slam-agent/manifest.template.json) and is built into [apps/slam-agent/dist/slam-agent.mcpb](/Users/mrascoff/Documents/Codex/apps/slam-agent/dist/slam-agent.mcpb).

This implementation follows the current MCPB naming and packaging model. If you still think of this as DXT, treat MCPB as the renamed successor format.

## Verification

Executed locally:

- `npm install`
- `npm run build`
- `npm test`

Current automated coverage is a core service integration test that exercises assessment creation, install-link publishing, token exchange, guided session submission, and report generation. The cloud services and MCP transports compile successfully, and the `.mcpb` bundle is produced during build.

## Notes on production hardening

The current implementation still uses a file-backed metadata store and local queue, but student artifact blobs can now be externalized to S3 through the built-in artifact-store abstraction. The remaining service boundaries map cleanly to the intended production replacements:

- Postgres for assessment/session/report data
- S3-compatible storage for artifacts and transcripts
- Redis-backed jobs instead of the local queue array
- stronger auth, tenant governance, and deployment-specific URLs
