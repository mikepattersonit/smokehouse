#!/usr/bin/env bash
set -euo pipefail
REGION="${AWS_REGION:-us-east-2}"
NAME="openai-py313-legacy"
WORKDIR="$(mktemp -d)"
echo "WORKDIR=$WORKDIR"

# Build a pure-Python layer
mkdir -p "$WORKDIR/python"
python3 -m pip install --upgrade pip >/dev/null
python3 -m pip install -t "$WORKDIR/python" 'openai==0.28.1' >/dev/null

# Zip and publish
( cd "$WORKDIR" && zip -r "${NAME}.zip" python >/dev/null )
LAYER_ARN=$(aws lambda publish-layer-version \
  --layer-name "$NAME" \
  --region "$REGION" \
  --compatible-runtimes python3.13 \
  --zip-file "fileb://$WORKDIR/$NAME.zip" \
  --query 'LayerVersionArn' --output text)
echo "Published: $LAYER_ARN"
