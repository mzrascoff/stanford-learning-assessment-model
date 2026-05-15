import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

const manifest = JSON.parse(await readFile(resolve(root, "manifest.template.json"), "utf8"));
manifest.server.mcp_config.env = {
  ...(manifest.server.mcp_config.env ?? {}),
  SLAM_API_BASE_URL: process.env.SLAM_API_BASE_URL ?? "http://localhost:4000/api",
  SLAM_INSTALL_TOKEN: process.env.SLAM_INSTALL_TOKEN ?? ""
};

const entry = await readFile(resolve(root, "dist/server/index.js"), "utf8");
const zip = new AdmZip();
zip.addFile("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));
zip.addFile("server/index.js", Buffer.from(entry, "utf8"));
zip.writeZip(resolve(root, "dist/slam-agent.mcpb"));
console.log("Created apps/slam-agent/dist/slam-agent.mcpb");
