#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/dist/aws"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARTIFACT_PATH="$ARTIFACT_DIR/slam-$TIMESTAMP.zip"

mkdir -p "$ARTIFACT_DIR"
cd "$ROOT_DIR"

npm run build >/dev/null

zip -qr "$ARTIFACT_PATH" . \
  -x '.git/*' \
  -x 'node_modules/*' \
  -x '.slam-data/*' \
  -x 'dist/aws/*' \
  -x '**/.DS_Store' \
  -x 'deploy/aws/*.log'

printf '%s\n' "$ARTIFACT_PATH"
