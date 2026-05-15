import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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

export class FileStore {
  private readonly dbPath: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir = ".slam-data") {
    this.dbPath = resolve(dataDir, "db.json");
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

  async transaction<T>(mutator: (state: DatabaseState) => Promise<T> | T): Promise<T> {
    const run = async (): Promise<T> => {
      const state = await this.read();
      const result = await mutator(state);
      await this.write(state);
      return result;
    };

    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );

    return result;
  }
}
