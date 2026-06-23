import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileStore } from "./file-store.js";

test("concurrent transactions across separate store instances do not lose updates", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "slam-lock-"));
  // Two FileStore instances over the same directory stand in for two OS
  // processes (api + worker) that each have their own in-process queue.
  const storeA = new FileStore(dataDir);
  const storeB = new FileStore(dataDir);
  await storeA.ensure();

  const append = (store: FileStore, tag: string) =>
    store.transaction((state) => {
      // Reuse an existing array field to record an ordered set of writes.
      const course = state.courses[0];
      if (!course) {
        throw new Error("seed course is missing");
      }
      course.section = (course.section ?? "") + tag;
    });

  const writes = 40;
  await Promise.all(
    Array.from({ length: writes }, (_unused, index) => append(index % 2 === 0 ? storeA : storeB, "."))
  );

  const finalState = await storeA.read();
  const recorded = (finalState.courses[0]?.section ?? "").replace(/^A/, "").length;
  assert.equal(recorded, writes, `expected ${writes} appends to survive, saw ${recorded}`);

  await rm(dataDir, { recursive: true, force: true });
});
