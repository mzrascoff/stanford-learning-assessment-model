#!/usr/bin/env bash
# Boots the SLAM API + remote MCP server, runs the MCP client smoke test
# against them, and tears everything down. Self-contained and idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export SLAM_DATA_DIR="${SLAM_DATA_DIR:-/tmp/slam-e2e-data}"
export SLAM_API_PORT="${SLAM_API_PORT:-4000}"
export SLAM_MCP_PORT="${SLAM_MCP_PORT:-4100}"
export SLAM_DEV_INSTRUCTOR_TOKEN="${SLAM_DEV_INSTRUCTOR_TOKEN:-slam-dev-instructor-token}"
export SLAM_INTERNAL_API_BASE_URL="http://127.0.0.1:${SLAM_API_PORT}/api"
export SLAM_MCP_URL="http://127.0.0.1:${SLAM_MCP_PORT}/mcp"

LOG_DIR="$(mktemp -d)"
API_LOG="$LOG_DIR/api.log"
MCP_LOG="$LOG_DIR/mcp.log"
API_PID=""
MCP_PID=""

cleanup() {
  [[ -n "$MCP_PID" ]] && kill "$MCP_PID" 2>/dev/null || true
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

wait_for() {
  local url="$1" name="$2" tries=50
  for ((i = 1; i <= tries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "✓ $name is up ($url)"
      return 0
    fi
    sleep 0.2
  done
  echo "✗ $name did not become healthy at $url" >&2
  return 1
}

echo "== fresh data dir: $SLAM_DATA_DIR =="
rm -rf "$SLAM_DATA_DIR"

echo "== building workspace =="
npm run build >/dev/null 2>&1
echo "✓ build ok"

echo "== starting API (port $SLAM_API_PORT) =="
node apps/api/dist/server.js >"$API_LOG" 2>&1 &
API_PID=$!
wait_for "http://127.0.0.1:${SLAM_API_PORT}/api/health" "API" || { cat "$API_LOG"; exit 1; }

echo "== starting MCP server (port $SLAM_MCP_PORT) =="
node apps/mcp-server/dist/server.js >"$MCP_LOG" 2>&1 &
MCP_PID=$!
wait_for "http://127.0.0.1:${SLAM_MCP_PORT}/health" "MCP server" || { cat "$MCP_LOG"; exit 1; }

echo "== running MCP client smoke test =="
node scripts/mcp-smoke-test.mjs

echo
echo "== server logs (tail) =="
echo "--- API ---"; tail -n 3 "$API_LOG" || true
echo "--- MCP ---"; tail -n 3 "$MCP_LOG" || true
