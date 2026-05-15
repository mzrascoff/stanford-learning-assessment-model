import { createArtifactStore, FileStore, SlamService } from "@slam/core";

const config = {
  dataDir: process.env.SLAM_DATA_DIR ?? ".slam-data",
  intervalMs: Number(process.env.SLAM_WORKER_INTERVAL_MS ?? 4000),
  publicBaseUrl: process.env.SLAM_PUBLIC_BASE_URL ?? "http://localhost:4000",
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
  syncEvaluation: false,
  devInstructorToken: config.devInstructorToken,
  artifactStore
});
await service.seed();

const runOnce = process.argv.includes("--once");

async function tick() {
  const processed = await service.runPendingJobs(10);
  if (processed > 0) {
    console.log(`SLAM worker processed ${processed} job(s).`);
  }
}

if (runOnce) {
  await tick();
  process.exit(0);
}

console.log(`SLAM worker polling every ${config.intervalMs}ms`);
setInterval(() => {
  tick().catch((error) => {
    console.error(error);
  });
}, config.intervalMs);
