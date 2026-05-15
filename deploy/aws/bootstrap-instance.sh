#!/usr/bin/env bash
set -euxo pipefail

: "${DEPLOY_BUCKET:?DEPLOY_BUCKET is required}"
: "${DEPLOY_KEY:?DEPLOY_KEY is required}"
: "${RUNTIME_BUCKET:?RUNTIME_BUCKET is required}"
: "${REGION:?REGION is required}"
: "${DEV_TOKEN:?DEV_TOKEN is required}"

dnf install -y nginx unzip tar gzip
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs
mkdir -p /opt/slam /etc/slam /var/lib/slam/data
aws s3 cp "s3://${DEPLOY_BUCKET}/${DEPLOY_KEY}" /opt/slam/slam-deploy.zip --region "$REGION"
rm -rf /opt/slam/app
unzip -o /opt/slam/slam-deploy.zip -d /opt/slam/app
cd /opt/slam/app
npm ci --omit=dev

TOKEN=$(curl -fsSL -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
PUBLIC_IPV4=$(curl -fsSL -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)

cat >/etc/slam/slam.env <<ENV
SLAM_API_PORT=4000
SLAM_MCP_PORT=4100
SLAM_PUBLIC_BASE_URL=http://$PUBLIC_IPV4
SLAM_PUBLIC_API_BASE_URL=http://$PUBLIC_IPV4/api
SLAM_INTERNAL_API_BASE_URL=http://127.0.0.1:4000/api
SLAM_DATA_DIR=/var/lib/slam/data
SLAM_SYNC_EVALUATION=false
SLAM_DEV_INSTRUCTOR_TOKEN=$DEV_TOKEN
SLAM_ARTIFACT_STORAGE=s3
SLAM_ARTIFACT_S3_BUCKET=$RUNTIME_BUCKET
SLAM_ARTIFACT_S3_KEY_PREFIX=student-artifacts
ENV

cat >/etc/systemd/system/slam-api.service <<'UNIT'
[Unit]
Description=SLAM API
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/slam/slam.env
WorkingDirectory=/opt/slam/app
ExecStart=/usr/bin/node /opt/slam/app/apps/api/dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/systemd/system/slam-mcp.service <<'UNIT'
[Unit]
Description=SLAM MCP Server
After=network.target slam-api.service

[Service]
Type=simple
EnvironmentFile=/etc/slam/slam.env
WorkingDirectory=/opt/slam/app
ExecStart=/usr/bin/node /opt/slam/app/apps/mcp-server/dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/systemd/system/slam-worker.service <<'UNIT'
[Unit]
Description=SLAM Worker
After=network.target slam-api.service

[Service]
Type=simple
EnvironmentFile=/etc/slam/slam.env
WorkingDirectory=/opt/slam/app
ExecStart=/usr/bin/node /opt/slam/app/apps/worker/dist/worker.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/nginx/conf.d/slam.conf <<'NGINX'
server {
  listen 80 default_server;
  server_name _;

  location /mcp {
    proxy_pass http://127.0.0.1:4100/mcp;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_request_buffering off;
    chunked_transfer_encoding on;
  }

  location /mcp-health {
    proxy_pass http://127.0.0.1:4100/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
NGINX

rm -f /etc/nginx/conf.d/default.conf || true
systemctl daemon-reload
systemctl enable --now slam-api.service slam-mcp.service slam-worker.service nginx
