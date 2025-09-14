#!/usr/bin/env bash
set -euo pipefail
REGION="${REGION:-us-east-2}"
OUT="cloud-inventory/amplify"
INFRA_OUT="infra/amplify/buildspecs"
mkdir -p "$OUT" "$INFRA_OUT"

echo "== Amplify Apps =="
aws amplify list-apps --region "$REGION" > "$OUT/apps.json"
APP_IDS=$(jq -r '.apps[].appId' "$OUT/apps.json")

for APP_ID in $APP_IDS; do
  echo "-- App: $APP_ID"
  aws amplify get-app --app-id "$APP_ID" --region "$REGION" > "$OUT/app-${APP_ID}.json"
  aws amplify list-branches --app-id "$APP_ID" --region "$REGION" > "$OUT/app-${APP_ID}-branches.json"
  aws amplify list-domain-associations --app-id "$APP_ID" --region "$REGION" > "$OUT/app-${APP_ID}-domains.json"
  aws amplify list-webhooks --app-id "$APP_ID" --region "$REGION" > "$OUT/app-${APP_ID}-webhooks.json"

  # Export buildSpec (if present) into repo (sanitized by nature—no secrets in YAML)
  BUILD_SPEC=$(jq -r '.app.buildSpec // empty' "$OUT/app-${APP_ID}.json")
  if [ -n "$BUILD_SPEC" ]; then
    printf "%s\n" "$BUILD_SPEC" > "$INFRA_OUT/app-${APP_ID}.yml"
  fi

  # App-level env var keys (keys only, no values) -> example file (gitignored)
  jq -r '.app.environmentVariables | keys_unsorted[]?' "$OUT/app-${APP_ID}.json" \
    | awk '{print "export " $0 "=<set-in-amplify>"}' > "$OUT/app-${APP_ID}-env.example" || true

  # Branch-level env var keys -> example files (gitignored)
  jq -r '.branches[] | {branchName, env: (.environmentVariables // {})} | @base64' "$OUT/app-${APP_ID}-branches.json" \
  | while read -r row; do
      obj=$(echo "$row" | base64 -d)
      branch=$(echo "$obj" | jq -r '.branchName')
      echo "# Branch ${branch}" > "$OUT/app-${APP_ID}-branch-${branch}-env.example"
      echo "$obj" | jq -r '.env | keys_unsorted[]?' \
        | awk '{print "export " $0 "=<set-in-amplify>"}' >> "$OUT/app-${APP_ID}-branch-${branch}-env.example"
    done
done

echo "Done. Raw JSON in $OUT/ (gitignored). Buildspecs (if any) in $INFRA_OUT/."
