#!/usr/bin/env bash
set -euo pipefail
REGION="${REGION:-us-east-2}"
OUT="cloud-inventory"
mkdir -p "$OUT"

echo "== Identity =="
aws sts get-caller-identity > "$OUT/sts-get-caller-identity.json"

echo "== IoT Core =="
aws iot list-things      --region "$REGION" > "$OUT/iot-things.json"
aws iot list-topic-rules --region "$REGION" > "$OUT/iot-rules.json"

echo "== DynamoDB =="
aws dynamodb list-tables --region "$REGION" > "$OUT/ddb-tables.json"
for T in $(jq -r '.TableNames[]' "$OUT/ddb-tables.json"); do
  aws dynamodb describe-table --table-name "$T" --region "$REGION" > "$OUT/ddb-${T}-describe.json"
  aws dynamodb scan --table-name "$T" --max-items 5 --region "$REGION" > "$OUT/ddb-${T}-sample.json" || true
done

echo "== Lambda (sanitized: no env vars) =="
aws lambda list-functions --region "$REGION" \
  | jq 'del(.Functions[].Environment)' \
  > "$OUT/lambda-functions.json"

for F in $(jq -r '.Functions[].FunctionName' "$OUT/lambda-functions.json"); do
  aws lambda get-function-configuration --function-name "$F" --region "$REGION" \
    | jq 'del(.Environment)' \
    > "$OUT/lambda-${F}-config.json"
done

echo "== API Gateway v2 (HTTP) =="
aws apigatewayv2 get-apis --region "$REGION" > "$OUT/apigw2-apis.json"
for A in $(jq -r '.Items[].ApiId' "$OUT/apigw2-apis.json"); do
  aws apigatewayv2 get-routes       --api-id "$A" --region "$REGION" > "$OUT/apigw2-${A}-routes.json"
  aws apigatewayv2 get-stages       --api-id "$A" --region "$REGION" > "$OUT/apigw2-${A}-stages.json"
  aws apigatewayv2 get-integrations --api-id "$A" --region "$REGION" > "$OUT/apigw2-${A}-integrations.json"
done

echo "== Amplify =="
aws amplify list-apps --region "$REGION" > "$OUT/amplify-apps.json"

echo "== SNS =="
aws sns list-topics --region "$REGION" > "$OUT/sns-topics.json"

echo "== CloudWatch Logs (Lambda groups only) =="
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/ --region "$REGION" > "$OUT/cw-lambda-log-groups.json"

echo "Done. Outputs in $OUT/"
