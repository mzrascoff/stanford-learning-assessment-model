#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK_NAME="${SLAM_AWS_STACK_NAME:-slam-ec2}"
REGION="${AWS_REGION:-$(aws configure get region)}"
INSTANCE_TYPE="${SLAM_AWS_INSTANCE_TYPE:-t3.small}"
DEV_TOKEN="${SLAM_DEV_INSTRUCTOR_TOKEN:-slam-dev-instructor-token}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
DEPLOY_BUCKET="${SLAM_DEPLOY_BUCKET:-slam-deploy-$ACCOUNT_ID-$REGION}"
VPC_ID="$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
SUBNET_ID="$(aws ec2 describe-subnets --region "$REGION" --filters Name=vpc-id,Values="$VPC_ID" --query 'Subnets[0].SubnetId' --output text)"

ARTIFACT_PATH="$($ROOT_DIR/deploy/aws/package-artifact.sh)"
ARTIFACT_KEY="artifacts/$(basename "$ARTIFACT_PATH")"

if ! aws s3api head-bucket --bucket "$DEPLOY_BUCKET" >/dev/null 2>&1; then
  aws s3 mb "s3://$DEPLOY_BUCKET" --region "$REGION"
fi

aws s3 cp "$ARTIFACT_PATH" "s3://$DEPLOY_BUCKET/$ARTIFACT_KEY" --region "$REGION"

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$ROOT_DIR/deploy/aws/slam-ec2.yaml" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ArtifactBucket="$DEPLOY_BUCKET" \
    ArtifactKey="$ARTIFACT_KEY" \
    VpcId="$VPC_ID" \
    SubnetId="$SUBNET_ID" \
    InstanceType="$INSTANCE_TYPE" \
    DevInstructorToken="$DEV_TOKEN"

INSTANCE_ID="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' --output text)"
aws ec2 wait instance-status-ok --region "$REGION" --instance-ids "$INSTANCE_ID"

aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table
