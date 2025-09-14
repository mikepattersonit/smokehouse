#!/usr/bin/env bash
set -euo pipefail
SRC="cloud-inventory/amplify"
OUT="docs/amplify.md"
mkdir -p docs
: > "$OUT"

echo "# Amplify Inventory (summary)" >> "$OUT"
echo "" >> "$OUT"
echo "_Generated from \`$SRC\` on $(date -u +%Y-%m-%dT%H:%M:%SZ). Raw JSON is gitignored._" >> "$OUT"
echo "" >> "$OUT"

if [ -f "$SRC/apps.json" ]; then
  jq -r '
    .apps[] |
    "## App: \(.appId)\n- **Name**: \(.name)\n- **Region**: \(.region)\n- **Repository**: \(.repository // "n/a")\n- **Default Domain**: \(.defaultDomain // "n/a")\n"
  ' "$SRC/apps.json" >> "$OUT"

  for APP_ID in $(jq -r '.apps[].appId' "$SRC/apps.json"); do
    echo "### Branches (App $APP_ID)" >> "$OUT"
    if [ -f "$SRC/app-${APP_ID}-branches.json" ]; then
      jq -r '
        .branches[]
        | "- " + .branchName
          + " (stage: " + (.stage // "n/a")
          + ", active: " + ((.active // false)|tostring)
          + ", autoBuild: " + ((.enableAutoBuild // false)|tostring)
          + ")"
      ' "$SRC/app-${APP_ID}-branches.json" >> "$OUT"
    else
      echo "- (no branches found)" >> "$OUT"
    fi
    echo "" >> "$OUT"

    echo "### Domains (App $APP_ID)" >> "$OUT"
    if [ -f "$SRC/app-${APP_ID}-domains.json" ]; then
      jq -r '
        .domainAssociations[]?
        | "- " + .domainName + " (status: " + (.domainStatus // "n/a") + ")"
      ' "$SRC/app-${APP_ID}-domains.json" >> "$OUT"
    else
      echo "- (no domains file)" >> "$OUT"
    fi
    echo "" >> "$OUT"

    echo "### Webhooks (App $APP_ID)" >> "$OUT"
    if [ -f "$SRC/app-${APP_ID}-webhooks.json" ]; then
      jq -r '
        .webhooks[]?
        | "- " + .branchName + " (" + .description + ")"
      ' "$SRC/app-${APP_ID}-webhooks.json" >> "$OUT"
    else
      echo "- (no webhooks file)" >> "$OUT"
    fi
    echo "" >> "$OUT"
  done
else
  echo "(no apps.json found)" >> "$OUT"
fi

echo "Wrote $OUT"
