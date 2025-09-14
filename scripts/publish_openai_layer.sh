#!/usr/bin/env bash
set -euo pipefail
REGION="${AWS_REGION:-us-east-2}"
NAME="openai-py313"
WORKDIR="$(mktemp -d)"
echo "WORKDIR=$WORKDIR"

# Build deps inside the Lambda Python 3.13 image (Amazon Linux 2023)
docker run --rm -v "$WORKDIR":/asset public.ecr.aws/lambda/python:3.13 \
  bash -lc 'python -m pip install --upgrade pip >/dev/null && \
            python -m pip install -t /asset/python openai >/dev/null'

# Zip on host
( cd "$WORKDIR" && zip -r "${NAME}.zip" python >/dev/null )

# Publish layer
LAYER_ARN=$(aws lambda publish-layer-version \
  --layer-name "$NAME" \
  --region "$REGION" \
  --compatible-runtimes python3.13 \
  --zip-file "fileb://$WORKDIR/$NAME.zip" \
  --query 'LayerVersionArn' --output text)

echo "Published: $LAYER_ARN"
echo "$LAYER_ARN" > "$WORKDIR/arn.txt"
