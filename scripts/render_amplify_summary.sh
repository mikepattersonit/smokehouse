#!/usr/bin/env bash
set -euo pipefail
SRC="cloud-inventory/amplify"
OUT="docs/amplify.md"
mkdir -p docs
: > "$OUT"
echo "# Amplify Inventory (summary)\n" >> "$OUT"
echo "_Generated from \`$SRC\` on $(date -u +%Y-%m-%dT%H:%M:%SZ). Raw JSON is gitignored._\n" >> "$OUT"

if [ -f "$SRC/apps.json" ]; then
  jq -r '
    .apps[] |
    "- **App**: \(.appId)  \n  **Name**: \(.name)  \n  **Region**: \(.region)  \n  **Repo**: \(.repository // "n/a")"
  ' "$SRC/apps.json" >> "$OUT"
  echo -e "\n" >> "$OUT"

  for app in $(jq -r '.apps[].appId' "$SRC/apps.json"); do
    echo "## App $app branches" >> "$OUT"
    if [ -f "$SRC/app-${app}-branches.json" ]; then
      jq -r '.branches[] | " - " + .branchName + " (active: " + ( .active|tostring ) + ", stage: " + ( .stage // "n/a" ) + ")"' \
        "$SRC/app-${app}-branches.json" >> "$OUT"
    else
      echo " - (no branches file)" >> "$OUT"
    fi
    echo -e "\n" >> "$OUT"
  done
else
  echo "(no apps.json found)" >> "$OUT"
fi

echo "Wrote $OUT"
