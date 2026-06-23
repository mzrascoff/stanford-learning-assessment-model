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

The repo ships a headless recorder — no display or manual screen capture
needed. It boots the API against a throwaway data dir, records the full
play-through, and tears everything down:

```bash
npm run build
npx playwright install chromium   # first time only
npm run demo:record               # writes demo/screencast/slam-demo.webm
# or choose a path:  node demo/screencast/record.mjs /tmp/slam-demo.webm
```

Output is a 1280×800 VP8 `.webm`, ~2:15 long (well under 4 minutes). Generated
videos are git-ignored. To transcode to MP4: `ffmpeg -i slam-demo.webm slam-demo.mp4`.

Prefer to capture by hand? The walkthrough is paced for it — on macOS,
`Cmd-Shift-5` and record the browser window.
