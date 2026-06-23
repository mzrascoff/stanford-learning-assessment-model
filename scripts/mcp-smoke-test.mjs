// End-to-end MCP smoke test: drives the remote SLAM MCP server with a real MCP
// SDK client over Streamable HTTP, exercising auth + a tool round-trip that
// proxies through to the REST API.
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const mcpUrl = process.env.SLAM_MCP_URL ?? "http://localhost:4100/mcp";
const token = process.env.SLAM_DEV_INSTRUCTOR_TOKEN ?? "slam-dev-instructor-token";

function parsePayload(result) {
  const text = result?.content?.find((part) => part.type === "text")?.text ?? "";
  const jsonStart = text.indexOf("\n");
  return JSON.parse(text.slice(jsonStart + 1));
}

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } }
  });
  const client = new Client({ name: "slam-smoke-test", version: "0.0.0" });

  await client.connect(transport);
  console.log("✓ connected and initialized MCP session");

  const { tools } = await client.listTools();
  const toolNames = tools.map((tool) => tool.name).sort();
  console.log(`✓ listed ${tools.length} tools: ${toolNames.join(", ")}`);
  assert.ok(toolNames.includes("create_assessment"), "expected create_assessment tool");
  assert.ok(toolNames.includes("list_sessions"), "expected list_sessions tool");

  const created = await client.callTool({
    name: "create_assessment",
    arguments: {
      courseId: "course-demo",
      title: "MCP smoke-test assessment",
      durationMinutes: 20,
      deliveryMode: "guided",
      feedbackVisibility: "instructor_and_student",
      rubricDimensions: [],
      promptSequence: []
    }
  });
  const assessment = parsePayload(created);
  assert.ok(assessment.id, "create_assessment should return an assessment id");
  assert.equal(assessment.title, "MCP smoke-test assessment");
  console.log(`✓ create_assessment round-trip ok (id=${assessment.id})`);

  const sessionsResult = await client.callTool({
    name: "list_sessions",
    arguments: { assessmentId: assessment.id }
  });
  const sessions = parsePayload(sessionsResult);
  assert.ok(Array.isArray(sessions), "list_sessions should return an array");
  assert.equal(sessions.length, 0, "a brand new assessment has no sessions");
  console.log(`✓ list_sessions round-trip ok (${sessions.length} sessions)`);

  // Negative check: an unauthenticated session must be refused at init.
  const anonTransport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const anonClient = new Client({ name: "slam-smoke-anon", version: "0.0.0" });
  await assert.rejects(() => anonClient.connect(anonTransport), /401|Bearer token required/i);
  console.log("✓ unauthenticated MCP init correctly rejected (401)");

  await client.close();
  console.log("\nALL MCP SMOKE TESTS PASSED");
}

main().catch((error) => {
  console.error("\nMCP SMOKE TEST FAILED:", error?.message ?? error);
  process.exit(1);
});
