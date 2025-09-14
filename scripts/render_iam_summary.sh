#!/usr/bin/env bash
set -euo pipefail
SRC="cloud-inventory/iam"
OUT="docs/iam-inventory.md"
mkdir -p docs
: > "$OUT"

echo "# IAM Inventory (read-only summary)" >> "$OUT"
echo "" >> "$OUT"
echo "_Generated from local files in \`$SRC\` on $(date -u +%Y-%m-%dT%H:%M:%SZ). Raw JSON is **not** committed._" >> "$OUT"
echo "" >> "$OUT"

echo "## Lambda → Role mapping" >> "$OUT"
echo "" >> "$OUT"
if [ -f "$SRC/iam-lambda-roles.json" ]; then
  jq -r '
    ["Lambda","RoleName","Runtime","Handler"],
    ( .[] | [
        .FunctionName,
        (.RoleArn | split("/")|last),
        .Runtime,
        .Handler
      ]) | @tsv
  ' "$SRC/iam-lambda-roles.json" \
  | awk 'BEGIN{FS="\t"; printf "| %-30s | %-40s | %-12s | %-30s |\n","Lambda","RoleName","Runtime","Handler";
                printf "|-%-30s-|-%-40s-|-%-12s-|-%-30s-|\n", gensub(/./,"-","g",substr(" ",1,30)), gensub(/./,"-","g",substr(" ",1,40)), gensub(/./,"-","g",substr(" ",1,12)), gensub(/./,"-","g",substr(" ",1,30))}
         {printf "| %-30s | %-40s | %-12s | %-30s |\n",$1,$2,$3,$4}' >> "$OUT"
else
  echo "_No lambda-role mapping found._" >> "$OUT"
fi

echo "" >> "$OUT"
echo "## Roles, attached & inline policies" >> "$OUT"
echo "" >> "$OUT"

for f in "$SRC"/role-*-get-role.json; do
  [ -f "$f" ] || continue
  NAME=$(basename "$f" | sed 's/^role-//; s/-get-role\.json$//')
  ARN=$(jq -r '.Role.Arn' "$f")
  echo "### Role: \`$NAME\`" >> "$OUT"
  echo "" >> "$OUT"
  echo "- ARN: \`$ARN\`" >> "$OUT"

  ATT="$SRC/role-${NAME}-attached.json"
  if [ -f "$ATT" ]; then
    echo "- Attached managed policies:" >> "$OUT"
    jq -r '.AttachedPolicies[]? | "  - \(.PolicyName) (\(.PolicyArn))"' "$ATT" >> "$OUT"
  else
    echo "- Attached managed policies: _none_" >> "$OUT"
  fi

  INN="$SRC/role-${NAME}-inline-names.json"
  if [ -f "$INN" ]; then
    CNT=$(jq -r '.PolicyNames | length' "$INN")
    if [ "$CNT" != "0" ]; then
      echo "- Inline policies:" >> "$OUT"
      jq -r '.PolicyNames[] | "  - \(.)"' "$INN" >> "$OUT"
    else
      echo "- Inline policies: _none_" >> "$OUT"
    fi
  else
    echo "- Inline policies: _none_" >> "$OUT"
  fi
  echo "" >> "$OUT"
done

echo "## IoT" >> "$OUT"
echo "" >> "$OUT"
if [ -f "$SRC/iot-rules-list.json" ]; then
  echo "### Topic rules (names + ARNs)" >> "$OUT"
  jq -r '.rules[]? | "- \(.ruleName) (\(.ruleArn))"' "$SRC/iot-rules-list.json" >> "$OUT"
fi

if [ -f "$SRC/iot-policies.json" ]; then
  echo "" >> "$OUT"
  echo "### IoT policies" >> "$OUT"
  jq -r '.policies[]? | "  - \(.policyName) (\(.policyArn))"' "$SRC/iot-policies.json" >> "$OUT"
fi

echo "" >> "$OUT"
echo "_End of summary._" >> "$OUT"

echo "Wrote $OUT"
