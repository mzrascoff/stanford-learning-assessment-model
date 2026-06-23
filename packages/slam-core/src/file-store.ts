import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { DatabaseState } from "./contracts.js";

const initialState = (): DatabaseState => ({
  courses: [
    {
      id: "course-demo",
      tenantId: "tenant-demo",
      title: "SLAM Demo Course",
      section: "A"
    }
  ],
  assessments: [],
  sessions: [],
  sessionEvents: [],
  studentReports: [],
  classReports: [],
  installTokens: [],
  accessTokens: [],
  queueJobs: []
});

// How long a lock file may persist before it is considered abandoned (e.g. the
// holding process crashed). Transactions are short, so this is deliberately
// generous relative to a normal read-modify-write.
const LOCK_STALE_MS = 10_000;

export class FileStore {
  private readonly dbPath: string;
  private readonly lockPath: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir = ".slam-data") {
    this.dbPath = resolve(dataDir, "db.json");
    this.lockPath = `${this.dbPath}.lock`;
  }

  async ensure(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    try {
      await readFile(this.dbPath, "utf8");
    } catch {
      await this.write(initialState());
    }
  }

  async read(): Promise<DatabaseState> {
    await this.ensure();
    const raw = await readFile(this.dbPath, "utf8");
    return JSON.parse(raw) as DatabaseState;
  }

  async write(state: DatabaseState): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    const tempPath = `${this.dbPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, this.dbPath);
  }

  // Atomic create of the lock file is the cross-process mutex: only one process
  // can hold `${db}.lock` at a time. The in-process `queue` already serializes
  // callers within a single process, so contention here is purely cross-process.
  private async acquireLock(): Promise<void> {
    await mkdir(dirname(this.lockPath), { recursive: true });
    for (let attempt = 0; ; attempt += 1) {
      try {
        const handle = await open(this.lockPath, "wx");
        await handle.close();
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
        // The lock is held. Break it if the holder appears to have died.
        try {
          const info = await stat(this.lockPath);
          if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
            await rm(this.lockPath, { force: true });
            continue;
          }
        } catch {
          // Lock vanished between open and stat; retry immediately.
          continue;
        }
        await delay(15 + Math.min(attempt, 20) * 5);
      }
    }
  }

  private async releaseLock(): Promise<void> {
    await rm(this.lockPath, { force: true });
  }

  async transaction<T>(mutator: (state: DatabaseState) => Promise<T> | T): Promise<T> {
    const run = async (): Promise<T> => {
      await this.acquireLock();
      try {
        const state = await this.read();
        const result = await mutator(state);
        await this.write(state);
        return result;
      } finally {
        await this.releaseLock();
      }
    };

    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );

    return result;
  }
}
