#!/usr/bin/env bash
set -euo pipefail

# ==== Config (edit if your IDs/paths differ) ====
: "${AWS_REGION:=us-east-2}"
: "${AWS_PROFILE:=personal-us-east-2}"

ITEMS_API_ID="${ITEMS_API_ID:-o05rs5z8e1}"             # GET /meatTypes  (existing)
ITEMS_PATH_PRIMARY="/itemTypes"                         # try this first
ITEMS_PATH_FALLBACK="/meatTypes"                        # or fall back to existing route

ASSIGN_API_ID="${ASSIGN_API_ID:-hgrhqnwar6}"           # POST /ManageProbeAssignments (existing)
ASSIGN_PATH="/ManageProbeAssignments"

ITEMS_FN="ItemTypesPy"
ASSIGN_FN="ManageProbeAssignmentsPy"
# ================================================

export AWS_REGION AWS_PROFILE
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

# Ensure functions exist/are active
aws lambda wait function-active --function-name "$ITEMS_FN"
aws lambda wait function-active --function-name "$ASSIGN_FN"

FARN_ITEMS="$(aws lambda get-function --function-name "$ITEMS_FN" --query 'Configuration.FunctionArn' --output text)"
FARN_ASSIGN="$(aws lambda get-function --function-name "$ASSIGN_FN" --query 'Configuration.FunctionArn' --output text)"

# Helper: create an integration for a Lambda function on an API
create_integration () {
  local API_ID="$1" FARN="$2"
  local INTEG_URI="arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/${FARN}/invocations"
  aws apigatewayv2 create-integration \
    --api-id "$API_ID" \
    --integration-type AWS_PROXY \
    --integration-uri "$INTEG_URI" \
    --payload-format-version "2.0" \
    --query IntegrationId --output text
}

# Helper: find an existing route id by path substring (ANY/GET/POST etc)
find_route_id () {
  local API_ID="$1" PATH_SUBSTR="$2"
  aws apigatewayv2 get-routes --api-id "$API_ID" \
    --query "Items[?contains(RouteKey, \`${PATH_SUBSTR}\`)].RouteId" --output text
}

# Helper: create a route if missing (method defaults to ANY)
create_route () {
  local API_ID="$1" PATH="$2" INTEG_ID="$3" METHOD="${4:-ANY}"
  aws apigatewayv2 create-route \
    --api-id "$API_ID" \
    --route-key "${METHOD} ${PATH}" \
    --target "integrations/${INTEG_ID}" \
    --query RouteId --output text
}

# Helper: point a route id to a given integration
point_route () {
  local API_ID="$1" ROUTE_ID="$2" INTEG_ID="$3"
  aws apigatewayv2 update-route \
    --api-id "$API_ID" \
    --route-id "$ROUTE_ID" \
    --target "integrations/${INTEG_ID}" >/dev/null
}

# Helper: add Lambda permission for API to invoke on a path
allow_invoke () {
  local FN="$1" API_ID="$2" PATH="$3"
  local STMT="apigw-$(echo "$API_ID-$PATH-$(date +%s)" | tr '/ ' '__')"
  aws lambda add-permission \
    --function-name "$FN" \
    --statement-id "$STMT" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${AWS_REGION}:${ACCOUNT_ID}:${API_ID}/*/*${PATH}" >/dev/null || true
}

echo "== ItemTypes: wiring ${ITEMS_FN} to API ${ITEMS_API_ID} =="
INTEG_ITEMS="$(create_integration "$ITEMS_API_ID" "$FARN_ITEMS")"
RID_ITEMS="$(find_route_id "$ITEMS_API_ID" "$ITEMS_PATH_PRIMARY")"
if [[ -z "$RID_ITEMS" || "$RID_ITEMS" == "None" ]]; then
  RID_ITEMS="$(find_route_id "$ITEMS_API_ID" "$ITEMS_PATH_FALLBACK" || true)"
  if [[ -z "$RID_ITEMS" || "$RID_ITEMS" == "None" ]]; then
    # create the fallback route if truly missing
    echo "No existing route found; creating GET ${ITEMS_PATH_FALLBACK}"
    RID_ITEMS="$(create_route "$ITEMS_API_ID" "$ITEMS_PATH_FALLBACK" "$INTEG_ITEMS" "GET")"
    PATH_ITEMS="$ITEMS_PATH_FALLBACK"
  else
    PATH_ITEMS="$ITEMS_PATH_FALLBACK"
  fi
else
  PATH_ITEMS="$ITEMS_PATH_PRIMARY"
fi
point_route "$ITEMS_API_ID" "$RID_ITEMS" "$INTEG_ITEMS"
allow_invoke "$ITEMS_FN" "$ITEMS_API_ID" "$PATH_ITEMS"
echo "ItemTypes route now targets ${ITEMS_FN} (routeId=${RID_ITEMS})."

echo "== ManageProbeAssignments: wiring ${ASSIGN_FN} to API ${ASSIGN_API_ID} =="
INTEG_ASSIGN="$(create_integration "$ASSIGN_API_ID" "$FARN_ASSIGN")"
RID_ASSIGN="$(find_route_id "$ASSIGN_API_ID" "$ASSIGN_PATH")"
if [[ -z "$RID_ASSIGN" || "$RID_ASSIGN" == "None" ]]; then
  echo "No existing route found; creating POST ${ASSIGN_PATH}"
  RID_ASSIGN="$(create_route "$ASSIGN_API_ID" "$ASSIGN_PATH" "$INTEG_ASSIGN" "POST")"
fi
point_route "$ASSIGN_API_ID" "$RID_ASSIGN" "$INTEG_ASSIGN"
allow_invoke "$ASSIGN_FN" "$ASSIGN_API_ID" "$ASSIGN_PATH"
echo "Assignments route now targets ${ASSIGN_FN} (routeId=${RID_ASSIGN})."

# Quick smoke tests
echo "== Test: GET item types =="
curl -s "https://${ITEMS_API_ID}.execute-api.${AWS_REGION}.amazonaws.com${PATH_ITEMS}" | jq . || true

echo "== Test: POST manage assignment =="
SID="$(curl -s "https://w6hf0kxlve.execute-api.${AWS_REGION}.amazonaws.com/sessions/latest" | jq -r .session_id)"
curl -s -X POST "https://${ASSIGN_API_ID}.execute-api.${AWS_REGION}.amazonaws.com${ASSIGN_PATH}" \
  -H 'Content-Type: application/json' \
  --data "{\"sessionId\":\"${SID}\",\"probeId\":\"probe1_temp\",\"itemType\":\"brisket\",\"itemWeight\":\"12\",\"minAlert\":null,\"maxAlert\":null,\"mobileNumber\":null}" | jq . || true

echo "Done."
