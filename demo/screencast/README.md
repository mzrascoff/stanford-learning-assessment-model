# SLAM Screencast Demo

A self-contained, auto-playing walkthrough (~3:30) of the full SLAM workflow —
**teacher setup → learner session → cited reports** — rendered as timed,
captioned scenes. It runs the **real REST flow live** against a running API, so
every score, evidence quote, and class average on screen is genuinely computed,
not mocked.

## What it shows

| Scene | Interface | What happens (real calls) |
|-------|-----------|---------------------------|
| Setup | Instructor console | `create_assessment` with cognitive + metacognitive rubric dimensions; SLAM scaffolds starter prompts |
| Share | Instructor console | `publish_install_link` mints a single-use, assessment-scoped install token |
| Session | Learner chat (`/student.html`) | `exchange_install_token` → `start_assessment` → `next_prompt` → `submit_response` / `submit_reflection` / `record_confidence` |
| Report | Reports | `complete` runs the evaluator; student report with cited evidence, confidence, next steps |
| Class | Reports | `get_class_report` aggregates + CSV export for program assessment |

The side panel during the session names the **MCP tool** behind each learner
action — the same tools an AI client (e.g. Claude Desktop) calls via the agent.

## Run it

```bash
npm run build
# fresh data dir keeps the demo deterministic
SLAM_DATA_DIR=.slam-demo node apps/api/dist/server.js
```

Then open **http://localhost:4000/demo/** in a browser. It autoplays; use
**Pause** / **Restart** in the lower-third control bar. Each load provisions a
fresh assessment, so you can replay cleanly.

> Serve it via the API (the `/demo/` route) rather than opening the file
> directly — same-origin avoids CORS and lets the live calls through.

## The two interfaces, standalone

- **Teacher:** http://localhost:4000/ — the instructor console (auth token
  `slam-dev-instructor-token`, create/publish/reports).
- **Learner:** http://localhost:4000/student.html — paste an install token (or
  open the published link, which fills it in) to run a real guided session.

## Recording to a video file

The walkthrough is paced for a clean screen recording:

- **macOS:** `Cmd-Shift-5` → record the browser window. Trim to the run.
- **Headless / CI:** drive `http://localhost:4000/demo/` with Playwright's
  `recordVideo` context option to capture a `.webm` without a display.

Target length is ~3:30, comfortably under 4 minutes.
