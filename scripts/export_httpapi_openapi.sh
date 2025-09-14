#!/usr/bin/env bash
set -euo pipefail
REGION="${REGION:-us-east-2}"
SRC="cloud-inventory/apigw2-apis.json"
OUT="apis"
mkdir -p "$OUT"

if [ ! -f "$SRC" ]; then
  echo "Missing $SRC. Run the cloud inventory first." >&2
  exit 1
fi

mapfile -t APIS < <(jq -r '.Items[].ApiId' "$SRC")
echo "Found ${#APIS[@]} HTTP APIs"

for A in "${APIS[@]}"; do
  echo "==> Exporting OpenAPI for API $A"
  if aws apigatewayv2 export-api \
      --api-id "$A" \
      --specification OAS30 \
      --output-type JSON \
      --stage-name '$default' \
      --region "$REGION" \
      "apis/http-${A}-oas30.json"; then
    echo "   -> wrote apis/http-${A}-oas30.json"
  else
    echo "WARN: export-api failed for $A, writing routes+integrations fallback"
    jq -n --arg api_id "$A" \
      --slurpfile routes "cloud-inventory/apigw2-${A}-routes.json" \
      --slurpfile stages "cloud-inventory/apigw2-${A}-stages.json" \
      --slurpfile integrations "cloud-inventory/apigw2-${A}-integrations.json" \
      '{apiId:$api_id, stages:$stages[0].Items, routes:$routes[0].Items, integrations:$integrations[0].Items}' \
      > "apis/http-${A}-routes-integrations.json"
    echo "   -> wrote apis/http-${A}-routes-integrations.json"
  fi
done

echo "Done. Files are in apis/"
