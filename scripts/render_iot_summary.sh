#!/usr/bin/env bash
set -euo pipefail
SRC="cloud-inventory/iot"
OUT="docs/iot-inventory.md"
mkdir -p docs
: > "$OUT"

echo "# AWS IoT Inventory (summary)" >> "$OUT"
echo "" >> "$OUT"
echo "_Generated from \`$SRC\` on $(date -u +%Y-%m-%dT%H:%M:%SZ). Raw JSON is gitignored._" >> "$OUT"
echo "" >> "$OUT"

# Endpoints
echo "## Endpoints" >> "$OUT"
for f in "$SRC"/endpoint-*.json; do
  [ -f "$f" ] || continue
  etype="$(basename "$f" | sed 's/endpoint-//; s/.json//')"
  ep=$(jq -r '.endpointAddress // .endpointAddress // empty' "$f")
  [ -n "$ep" ] && echo "- **$etype**: \`$ep\`" >> "$OUT"
done
echo "" >> "$OUT"

# Things table
echo "## Things → Certificates → Policies" >> "$OUT"
echo "" >> "$OUT"
echo "| Thing | CertId(s) & Status | Policies (per Cert) |" >> "$OUT"
echo "|------|---------------------|----------------------|" >> "$OUT"

if [ -f "$SRC/things.json" ]; then
  jq -r '.things[].thingName' "$SRC/things.json" | while read -r THING; do
    safe="$(printf "%s" "$THING" | sed 's/[^A-Za-z0-9._-]/_/g')"
    PFILE="$SRC/thing-${safe}-principals.json"
    if [ -f "$PFILE" ]; then
      # Build cert + status list
      CERT_LINES=$(
        jq -r '.principals[]?' "$PFILE" 2>/dev/null \
        | while read -r CARN; do
            CID="$(printf "%s" "$CARN" | awk -F/ '{print $NF}')"
            CSTAT="$(jq -r '.certificateDescription.status // "unknown"' "$SRC/certificate-${CID}.json" 2>/dev/null || echo unknown)"
            echo "${CID}(${CSTAT})"
          done | paste -sd ',' -
      )
      # Policies
      POL_LINES=$(
        jq -r '.principals[]?' "$PFILE" 2>/dev/null \
        | while read -r CARN; do
            CID="$(printf "%s" "$CARN" | awk -F/ '{print $NF}')"
            jq -r '.policies[]?.policyName' "$SRC/certificate-${CID}-policies.json" 2>/dev/null
          done | sort -u | paste -sd ',' -
      )
      [ -z "$CERT_LINES" ] && CERT_LINES="(none)"
      [ -z "$POL_LINES" ]  && POL_LINES="(none)"
      printf "| %s | %s | %s |\n" "$THING" "$CERT_LINES" "$POL_LINES" >> "$OUT"
    else
      printf "| %s | (no principals) | (n/a) |\n" "$THING" >> "$OUT"
    fi
  done
fi
echo "" >> "$OUT"

# Topic Rules
echo "## Topic Rules" >> "$OUT"
echo "" >> "$OUT"
if [ -f "$SRC/rules.json" ]; then
  for R in $(jq -r '.rules[].ruleName' "$SRC/rules.json"); do
    safer="$(printf "%s" "$R" | sed 's/[^A-Za-z0-9._-]/_/g')"
    F="$SRC/rule-${safer}.json"
    [ -f "$F" ] || continue
    SQL=$(jq -r '.rule.sql // "n/a"' "$F")
    echo "### Rule: \`$R\`" >> "$OUT"
    echo "- **SQL**: \`$SQL\`" >> "$OUT"
    # Summarize actions (DynamoDB/Lambda/SNS/Republish etc.)
    echo "- **Actions**:" >> "$OUT"
    jq -r '
      .rule.actions[] |
      if .dynamoDBv2 then
        "- DynamoDBv2 → table: \(.dynamoDBv2.putItem.tableName // "n/a")"
      elif .dynamoDB then
        "- DynamoDB → table: \(.dynamoDB.tableName // "n/a")"
      elif .lambda then
        "- Lambda → arn: \(.lambda.functionArn // "n/a")"
      elif .sns then
        "- SNS → topic: \(.sns.targetArn // "n/a")"
      elif .republish then
        "- Republish → topic: \(.republish.topic // "n/a")"
      elif .kinesis then
        "- Kinesis → stream: \(.kinesis.streamName // "n/a")"
      else
        "- Other action present"
      end
    ' "$F" >> "$OUT"
    echo "" >> "$OUT"
  done
else
  echo "(no rules.json)" >> "$OUT"
fi

# Jobs
echo "## Jobs" >> "$OUT"
jq -r '
  if .jobs then
    .jobs[] | "- " + .jobId + " (status: " + (.status // "n/a") + ")"
  else "(none)"
  end
' "$SRC/jobs.json" 2>/dev/null >> "$OUT" || echo "(none)" >> "$OUT"
echo "" >> "$OUT"

# Role Aliases
echo "## Role Aliases" >> "$OUT"
if [ -f "$SRC/role-aliases.json" ]; then
  for A in $(jq -r '.roleAliases[]?' "$SRC/role-aliases.json"); do
    safea="$(printf "%s" "$A" | sed 's/[^A-Za-z0-9._-]/_/g')"
    RFILE="$SRC/role-alias-${safea}.json"
    ROLEARN="$(jq -r '.roleAliasDescription.roleArn // "n/a"' "$RFILE" 2>/dev/null || echo n/a)"
    echo "- ${A} → ${ROLEARN}" >> "$OUT"
  done
else
  echo "(none)" >> "$OUT"
fi

echo ""
echo "Wrote $OUT"
