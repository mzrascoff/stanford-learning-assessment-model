import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { SlamApiClient, createSlamMcpServer } from "@slam/core";

const config = {
  port: Number(process.env.SLAM_MCP_PORT ?? 4100),
  apiBaseUrl:
    process.env.SLAM_INTERNAL_API_BASE_URL ??
    process.env.SLAM_API_BASE_URL ??
    "http://localhost:4000/api"
};

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const transports = new Map<string, StreamableHTTPServerTransport>();

function bearerToken(request: express.Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) {
    return undefined;
  }
  return header.replace(/^Bearer\s+/i, "");
}

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "slam-mcp-server" });
});

app.all("/mcp", async (request, response) => {
  try {
    const sessionId = typeof request.headers["mcp-session-id"] === "string" ? request.headers["mcp-session-id"] : undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (request.method !== "POST" || !isInitializeRequest(request.body)) {
        response.status(400).json({ error: "Initialize request required before using the MCP session." });
        return;
      }

      const token = bearerToken(request);
      if (!token) {
        response.status(401).json({ error: "Bearer token required." });
        return;
      }

      const api = new SlamApiClient({
        baseUrl: config.apiBaseUrl,
        accessToken: token
      });

      const server = createSlamMcpServer(api, {
        name: "slam-cloud-server",
        version: "0.1.0"
      });

      const sessionTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, sessionTransport);
        }
      });

      (sessionTransport as StreamableHTTPServerTransport & { onclose?: () => void; sessionId?: string }).onclose = () => {
        const trackedSessionId = (sessionTransport as StreamableHTTPServerTransport & { sessionId?: string }).sessionId;
        if (trackedSessionId) {
          transports.delete(trackedSessionId);
        }
      };

      await server.connect(sessionTransport);
      transport = sessionTransport;
    }

    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response.status(400).json({ error: message });
  }
});

app.listen(config.port, () => {
  console.log(`SLAM remote MCP server listening on http://localhost:${config.port}/mcp`);
});
