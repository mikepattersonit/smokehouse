#!/usr/bin/env bash
set -euo pipefail
SRC="cloud-inventory/ddb"
OUT="docs/dynamodb.md"
mkdir -p docs
: > "$OUT"

echo "# DynamoDB Inventory (summary)" >> "$OUT"
echo "" >> "$OUT"
echo "_Generated from \`$SRC\` on $(date -u +%Y-%m-%dT%H:%M:%SZ). Raw JSON is gitignored._" >> "$OUT"
echo "" >> "$OUT"

if [ ! -f "$SRC/tables.json" ]; then
  echo "> No tables.json found. Run scripts/ddb_inventory.sh first." >> "$OUT"
  exit 0
fi

mapfile -t TABLES < <(jq -r '.TableNames[]' "$SRC/tables.json")
for T in "${TABLES[@]}"; do
  D="$SRC/${T}-describe.json"
  TTL="$SRC/${T}-ttl.json"
  [ -f "$D" ] || continue

  echo "## Table: \`${T}\`" >> "$OUT"

  # Basic
  jq -r '
    .Table as $t |
    "- ItemCount: \($t.ItemCount // 0)" ,
    "- SizeBytes: \($t.TableSizeBytes // 0)" ,
    "- BillingMode: \($t.BillingModeSummary.BillingMode // "PROVISIONED")",
    (if ($t.BillingModeSummary.BillingMode // "PROVISIONED") == "PROVISIONED"
     then "- Provisioned RCUs/WCUs: \($t.ProvisionedThroughput.ReadCapacityUnits) / \($t.ProvisionedThroughput.WriteCapacityUnits)"
     else empty end)
  ' "$D" >> "$OUT"

  # Keys
  echo "- Keys:" >> "$OUT"
  jq -r '
    .Table as $t |
    ($t.KeySchema // []) as $ks |
    ($t.AttributeDefinitions // []) as $ad |
    [
      $ks[]
      | .AttributeName as $n
      | .KeyType as $k
      | ($ad[] | select(.AttributeName==$n) | .AttributeType) as $tpe
      | "  - \($k): \($n) (\($tpe))"
    ] | .[]
  ' "$D" >> "$OUT"

  # GSIs
  GSI_COUNT=$(jq '(.Table.GlobalSecondaryIndexes // []) | length' "$D")
  echo "- GSIs: ${GSI_COUNT}" >> "$OUT"
  if [ "$GSI_COUNT" -gt 0 ]; then
    jq -r '
      .Table.GlobalSecondaryIndexes[] |
      "  - \(.IndexName): " +
      ((.KeySchema[] | "\(.KeyType): \(.AttributeName)") | join(", ")) +
      " | Projection: " + .Projection.ProjectionType
    ' "$D" >> "$OUT"
  fi

  # TTL
  if [ -f "$TTL" ]; then
    jq -r '
      .TimeToLiveDescription as $t |
      "- TTL: " + (($t.TimeToLiveStatus // "DISABLED")) + (if $t.AttributeName then " (attr: " + $t.AttributeName + ")" else "" end)
    ' "$TTL" >> "$OUT"
  fi

  # Sample (brief)
  S="$SRC/${T}-sample.json"
  if [ -f "$S" ]; then
    echo "- Sample attributes (first item):" >> "$OUT"
    jq -r '
      (.Items // [])[0] // {} |
      to_entries | .[].key
    ' "$S" | sed 's/^/  - /' >> "$OUT"
  fi

  echo "" >> "$OUT"
done

# Focus notes for key tables we care about
for T in sensor_data Sessions; do
  D="$SRC/${T}-describe.json"
  [ -f "$D" ] || continue
  echo "### Notes: ${T}" >> "$OUT"
  if [ "$T" = "sensor_data" ]; then
    echo "- Expect PK \`session_id\` (S) and SK \`timestamp\` (S or N). Ensure front-end sends string session_id." >> "$OUT"
  else
    echo "- Currently empty or not yet populated; plan a writer or a /sessions/latest query path." >> "$OUT"
  fi
  echo "" >> "$OUT"
done

echo "Wrote $OUT"
