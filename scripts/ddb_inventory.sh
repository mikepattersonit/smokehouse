#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-east-2}"
OUT="cloud-inventory/ddb"
mkdir -p "$OUT"

echo "== Listing tables =="
aws dynamodb list-tables --region "$REGION" > "$OUT/tables.json"

echo "== Describing tables, TTL, and sampling items =="
mapfile -t TABLES < <(jq -r '.TableNames[]' "$OUT/tables.json")
for T in "${TABLES[@]}"; do
  # describe schema/capacity/gsis
  aws dynamodb describe-table --table-name "$T" --region "$REGION" > "$OUT/${T}-describe.json" || true
  # ttl settings
  aws dynamodb describe-time-to-live --table-name "$T" --region "$REGION" > "$OUT/${T}-ttl.json" || true
  # small sample (5 items) — best-effort
  aws dynamodb scan --table-name "$T" --region "$REGION" --max-items 5 > "$OUT/${T}-sample.json" || true
done

echo "Done. Raw DDB inventory in $OUT/ (gitignored)."
