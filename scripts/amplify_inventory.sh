#!/usr/bin/env bash
set -euo pipefail
REGION="${REGION:-us-east-2}"
OUT="cloud-inventory/amplify"
mkdir -p "$OUT"

echo "== Amplify Apps =="
aws amplify list-apps --region "$REGION" > "$OUT/apps.json"

APP_IDS=$(jq -r '.apps[].appId' "$OUT/apps.json")
for APP_ID in $APP_IDS; do
  echo "-- App: $APP_ID"
  aws amplify get-app --app-id "$APP_ID" --region "$REGION" > "$OUT/app-${APP_ID}.json"
  aws amplify list-branches --app-id "$APP_ID" --region "$REGION" > "$OUT/app-${APP_ID}-branches.json"

  # Try to fetch backend envs if present (Amplify Hosting v1)
  aws amplify list-backend-environments --app-id "$APP_ID" --region "$REGION" \
    > "$OUT/app-${APP_ID}-backend-envs.json" 2>/dev/null || true
done

echo "Wrote Amplify inventory to $OUT/ (gitignored)"
