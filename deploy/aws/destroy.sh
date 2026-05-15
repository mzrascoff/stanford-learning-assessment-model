#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${SLAM_AWS_STACK_NAME:-slam-ec2}"
REGION="${AWS_REGION:-$(aws configure get region)}"

aws cloudformation delete-stack --region "$REGION" --stack-name "$STACK_NAME"
aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$STACK_NAME"
