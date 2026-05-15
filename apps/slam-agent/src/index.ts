import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SlamApiClient, createSlamMcpServer } from "@slam/core";
import { readAgentState, writeAgentState } from "./auth-state.js";

async function bootstrap() {
  const apiBaseUrl = process.env.SLAM_API_BASE_URL ?? "http://localhost:4000/api";
  const installToken = process.env.SLAM_INSTALL_TOKEN;
  const state = await readAgentState();
  let accessToken = state.apiBaseUrl === apiBaseUrl ? state.accessToken : undefined;
  const api = new SlamApiClient({
    baseUrl: apiBaseUrl,
    accessToken
  });

  let actor;

  try {
    actor = await api.whoAmI();
  } catch {
    if (!installToken) {
      throw new Error("SLAM agent is missing an access token and SLAM_INSTALL_TOKEN was not provided in the MCPB bundle.");
    }

    const exchanged = await api.exchangeInstallToken({
      installToken,
      clientName: "SLAM Agent"
    });
    accessToken = exchanged.accessToken;
    api.setAccessToken(accessToken);
    actor = exchanged.actor;
    await writeAgentState({
      accessToken,
      actor,
      apiBaseUrl
    });
  }

  if (!accessToken) {
    throw new Error("SLAM agent could not determine an access token.");
  }

  await writeAgentState({
    accessToken,
    actor,
    apiBaseUrl
  });

  const server = createSlamMcpServer(api, {
    name: "slam-agent",
    version: "0.1.0"
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
