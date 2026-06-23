# SLAM

Stanford Learning Assessment Model (SLAM) is a cloud-native formative assessment layer for AI workflows. It combines:

- a cloud API for instructor setup, reporting, and signed install-link issuance
- a remote MCP server over Streamable HTTP for direct cloud MCP integration
- a background worker for session evaluation and class report regeneration
- a thin installable `.mcpb` bridge (`slam-agent`) for one-click learner install

SLAM is intentionally formative in this version. Reports surface evidence, uncertainty, strengths, gaps, and next steps. They do not calculate final grades.

## Workspace layout

- `packages/slam-core`: shared contracts, file-backed local store, deterministic evaluator, API client, reusable MCP tool registration
- `apps/api`: instructor console, auto-playing screencast (`/demo/`), REST API, and dynamic `.mcpb` download endpoint
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
6. For the learner side, install the SLAM agent into an MCP client such as Claude Desktop. The console's **Publish link** action issues a single-use install link; downloading it yields a tenant-bound `.mcpb` bundle. Once installed, the learner runs the whole session by chatting with Claude — Claude calls SLAM's MCP tools.
7. Watch the end-to-end walkthrough at [http://localhost:4000/demo/](http://localhost:4000/demo/). It auto-plays the full teacher → learner → reports workflow against the live API, showing the learner side as a Claude chat with inline tool calls.

> The worker and MCP server are optional for the console/learner flow: the API generates reports synchronously by default (`SLAM_SYNC_EVALUATION=true`), so `npm run dev:api` alone is enough to try it.

## Higher-ed assessment demo

For Gates and Anthropic assessment conversations, seed a concrete higher-ed outcomes scenario:

```bash
npm run demo:higher-ed
```

This creates `EDUC 240 Outcomes Evidence Memo`, six believable learner sessions, individual student reports, a class report, and JSON/CSV exports. The walkthrough is at [demo/higher-ed-assessment/WALKTHROUGH.md](demo/higher-ed-assessment/WALKTHROUGH.md), and generated exports are under [demo/higher-ed-assessment/exports](demo/higher-ed-assessment/exports).

## Screencast walkthrough

With the API running, an auto-playing ~2-minute walkthrough of the full teacher → learner → reports workflow is served same-origin at [http://localhost:4000/demo/](http://localhost:4000/demo/). It makes the real API calls live, so every score and citation on screen is genuinely computed. The learner side is shown as a Claude chat with inline MCP tool-use cards — the way students actually use SLAM.

Render it to a video file headlessly — no display or manual screen capture:

```bash
npx playwright install chromium   # first time only
npm run demo:record               # writes demo/screencast/slam-demo.webm
```

See [demo/screencast/README.md](demo/screencast/README.md) for details.

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
- the CloudFormation template is at [deploy/aws/slam-ec2.yaml](deploy/aws/slam-ec2.yaml)
- the EC2 bootstrap installs Node 22 so the AWS SDK runtime matches the app's S3 artifact-store dependency requirements

## What is implemented

### Instructor workflows

- create assessment blueprints with rubric dimensions, anchor examples, prompt sequences, duration, and feedback visibility
- publish a signed install link that downloads a tenant-bound `.mcpb` package
- inspect student sessions, student reports, class reports, and export payloads
- submit artifact-only analyses through the web app or API

### Student workflows

Learners work inside an AI client such as Claude Desktop, where the installed `.mcpb` MCP agent exposes SLAM's tools. The learner simply chats; Claude calls the tools to drive the flow:

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
- `GET /me`
- `GET /starter-dimensions`
- `POST /assessments`
- `POST /assessments/:assessmentId/publish`
- `POST /artifacts/analyze`
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

Errors return standard HTTP status codes — `400` validation, `401` unauthenticated, `403` forbidden, `404` not found — rather than a single catch-all status.

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

The bridge package lives at [apps/slam-agent/manifest.template.json](apps/slam-agent/manifest.template.json) and is built into [apps/slam-agent/dist/slam-agent.mcpb](apps/slam-agent/dist/slam-agent.mcpb).

This implementation follows the current MCPB naming and packaging model. If you still think of this as DXT, treat MCPB as the renamed successor format.

## Verification

Executed locally:

- `npm install`
- `npm run build`
- `npm test`

Core `node --test` coverage exercises the full guided-session flow (assessment creation, install-link publishing, token exchange, submission, report generation), CSV-export escaping, required-field/auth validation, and cross-process store locking. `scripts/mcp-e2e.sh` additionally boots the API + remote MCP server and drives them with a real MCP client. The cloud services and MCP transports compile successfully, and the `.mcpb` bundle is produced during build.

## Notes on production hardening

The current implementation still uses a file-backed metadata store and local queue — now guarded by a cross-process lock so the API, worker, and MCP server can share it safely — but student artifact blobs can now be externalized to S3 through the built-in artifact-store abstraction. The remaining service boundaries map cleanly to the intended production replacements:

- Postgres for assessment/session/report data
- S3-compatible storage for artifacts and transcripts
- Redis-backed jobs instead of the local queue array
- stronger auth, tenant governance, and deployment-specific URLs
