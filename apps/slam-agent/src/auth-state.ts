import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ActorContext } from "@slam/core";

export interface AgentState {
  accessToken?: string;
  actor?: ActorContext;
  apiBaseUrl?: string;
  updatedAt?: string;
}

function statePath(): string {
  const root = process.env.SLAM_AGENT_STATE_DIR ? resolve(process.env.SLAM_AGENT_STATE_DIR) : join(homedir(), ".slam-agent");
  return join(root, "state.json");
}

export async function readAgentState(): Promise<AgentState> {
  const path = statePath();
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as AgentState;
  } catch {
    return {};
  }
}

export async function writeAgentState(next: AgentState): Promise<void> {
  const path = statePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ ...next, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}
