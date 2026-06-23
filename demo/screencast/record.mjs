// Render the SLAM screencast to a .webm video file, headlessly — no display or
// manual screen capture needed. Self-contained: boots the API against a fresh
// data dir, records the full /demo/ play-through, and tears everything down.
//
//   npm run build
//   npx playwright install chromium   # first time only
//   node demo/screencast/record.mjs [out.webm]
//
// Defaults to demo/screencast/slam-demo.webm.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUT = process.argv[2] ? resolve(process.argv[2]) : join(__dirname, "slam-demo.webm");
const PORT = process.env.SLAM_API_PORT || "4000";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SIZE = { width: 1280, height: 800 };

async function waitForHealth() {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${ORIGIN}/api/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("API did not become healthy");
}

const dataDir = await mkdtemp(join(tmpdir(), "slam-rec-"));
const videoDir = await mkdtemp(join(tmpdir(), "slam-vid-"));
const api = spawn(process.execPath, [join(ROOT, "apps/api/dist/server.js")], {
  env: { ...process.env, SLAM_DATA_DIR: dataDir, SLAM_API_PORT: PORT },
  stdio: "ignore"
});

try {
  await waitForHealth();
  // CI uses the Playwright-managed browser (npx playwright install chromium).
  // SLAM_CHROMIUM_PATH lets you point at an already-cached binary.
  const exe = process.env.SLAM_CHROMIUM_PATH;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: videoDir, size: SIZE } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  console.log("Recording /demo/ … (~3.5 min)");
  await page.goto(`${ORIGIN}/demo/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#status")?.textContent?.includes("Demo complete"),
    undefined,
    { timeout: 280000 }
  );
  await page.waitForTimeout(1200);

  const video = page.video();
  await ctx.close(); // flush + finalize the .webm
  await browser.close();

  const src = video ? await video.path() : join(videoDir, (await readdir(videoDir)).find((f) => f.endsWith(".webm")));
  await rename(src, OUT).catch(async () => {
    await copyFile(src, OUT);
  });

  if (errors.length) console.error("⚠ page errors during recording:", errors);
  console.log(`✓ wrote ${OUT}`);
} finally {
  api.kill();
  await rm(dataDir, { recursive: true, force: true });
  await rm(videoDir, { recursive: true, force: true });
}
