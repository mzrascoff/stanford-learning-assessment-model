#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK_NAME="${SLAM_AWS_STACK_NAME:-slam-ec2}"
REGION="${AWS_REGION:-$(aws configure get region)}"
TOKEN="${SLAM_DEV_INSTRUCTOR_TOKEN:-slam-dev-instructor-token}"

PUBLIC_URL="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`PublicUrl`].OutputValue' --output text)"

for attempt in $(seq 1 30); do
  if curl -fsS "$PUBLIC_URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 10
  if [[ "$attempt" == "30" ]]; then
    echo "Timed out waiting for $PUBLIC_URL/api/health" >&2
    exit 1
  fi
done

API_HEALTH="$(curl -fsS "$PUBLIC_URL/api/health")"
MCP_HEALTH="$(curl -fsS "$PUBLIC_URL/mcp-health")"

ASSESSMENT_JSON="$(curl -fsS -X POST "$PUBLIC_URL/api/assessments" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  --data '{
    "title": "AWS smoke test assessment",
    "courseId": "course-demo",
    "durationMinutes": 15,
    "deliveryMode": "guided",
    "feedbackVisibility": "instructor_and_student",
    "rubricDimensions": [],
    "promptSequence": []
  }')"

ASSESSMENT_ID="$(printf '%s' "$ASSESSMENT_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const json=JSON.parse(d); if(!json.id) process.exit(1); process.stdout.write(json.id);});')"
PUBLISH_JSON="$(curl -fsS -X POST "$PUBLIC_URL/api/assessments/$ASSESSMENT_ID/publish" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  --data '{}')"

printf 'API health: %s\n' "$API_HEALTH"
printf 'MCP health: %s\n' "$MCP_HEALTH"
printf 'Created assessment: %s\n' "$ASSESSMENT_ID"
printf 'Publish response: %s\n' "$PUBLISH_JSON"
