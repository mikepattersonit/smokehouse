#!/usr/bin/env bash
set -euo pipefail
SRC="cloud-inventory"
OUT="docs/data-model.md"
mkdir -p docs
: > "$OUT"

echo "# DynamoDB Data Model" >> "$OUT"
echo "" >> "$OUT"
echo "_Generated from local inventory in \`$SRC\` on $(date -u +%Y-%m-%dT%H:%M:%SZ)._ " >> "$OUT"
echo "" >> "$OUT"

# Find all describe files
for f in "$SRC"/ddb-*-describe.json; do
  [ -f "$f" ] || continue
  T=$(jq -r '.Table.TableName' "$f")
  echo "## Table: \`$T\`" >> "$OUT"
  echo "" >> "$OUT"

  # Keys
  PK=$(jq -r '.Table.KeySchema[] | select(.KeyType=="HASH").AttributeName' "$f")
  SK=$(jq -r '.Table.KeySchema[]? | select(.KeyType=="RANGE").AttributeName' "$f")
  if [ -n "$SK" ]; then
    echo "- **Primary key:** \`$PK\` (PK), \`$SK\` (SK)" >> "$OUT"
  else
    echo "- **Primary key:** \`$PK\` (PK)" >> "$OUT"
  fi

  # Attr defs
  echo "- **Attributes:**" >> "$OUT"
  jq -r '.Table.AttributeDefinitions[] | "  - `\(.AttributeName)` (\(.AttributeType))"' "$f" >> "$OUT"

  # GSIs (if any)
  GSI_COUNT=$(jq -r '.Table.GlobalSecondaryIndexes | length // 0' "$f")
  if [ "$GSI_COUNT" != "0" ]; then
    echo "- **GSIs:**" >> "$OUT"
    jq -r '.Table.GlobalSecondaryIndexes[] |
      "  - \(.IndexName): " +
      ( .KeySchema | map( .AttributeName + " (" + .KeyType + ")" ) | join(", ") )' "$f" >> "$OUT"
  fi

  # TTL (if enabled)
  TTL_FILE="$SRC/ddb-${T}-ttl.json"
  if [ -f "$TTL_FILE" ]; then
    jq -r '
      if .TimeToLiveDescription.TimeToLiveStatus=="ENABLED"
      then "- **TTL:** enabled on `" + .TimeToLiveDescription.AttributeName + "`"
      else "- **TTL:** not enabled"
      end' "$TTL_FILE" >> "$OUT"
  else
    echo "- **TTL:** unknown (not inventoried)" >> "$OUT"
  fi

  echo "" >> "$OUT"

  # Sample items (from sample file)
  SAMP="$SRC/ddb-${T}-sample.json"
  if [ -f "$SAMP" ]; then
    echo "<details><summary>Sample items (first 3)</summary>" >> "$OUT"
    echo "" >> "$OUT"
    jq -r '
      .Items[0:3] //
      []
    ' "$SAMP" >> "$OUT"
    echo "" >> "$OUT"
    echo "</details>" >> "$OUT"
    echo "" >> "$OUT"
  fi
done

echo "_End of doc._" >> "$OUT"
echo "Wrote $OUT"
