#!/usr/bin/env bash
set -euo pipefail
REGION="${REGION:-us-east-2}"
OUT="cloud-inventory/iot"
mkdir -p "$OUT"

echo "== Endpoints =="
aws iot describe-endpoint --endpoint-type iot:Data-ATS          --region "$REGION" > "$OUT/endpoint-data-ats.json"          || true
aws iot describe-endpoint --endpoint-type iot:CredentialProvider --region "$REGION" > "$OUT/endpoint-cred-provider.json"    || true
aws iot describe-endpoint --endpoint-type iot:Jobs               --region "$REGION" > "$OUT/endpoint-jobs.json"             || true

echo "== Things & Groups =="
aws iot list-things       --region "$REGION" > "$OUT/things.json"
aws iot list-thing-groups --region "$REGION" > "$OUT/thing-groups.json"

# Per thing: describe + principals (certs)
for THING in $(jq -r '.things[].thingName' "$OUT/things.json"); do
  safe="$(printf "%s" "$THING" | sed 's/[^A-Za-z0-9._-]/_/g')"
  aws iot describe-thing --thing-name "$THING" --region "$REGION"           > "$OUT/thing-${safe}.json" || true
  aws iot list-thing-principals --thing-name "$THING" --region "$REGION"    > "$OUT/thing-${safe}-principals.json" || true
done

echo "== Certificates & Policies (from principals) =="
# Collect unique certificate ARNs from all things
jq -r '. | select(.principals?).principals[]?' "$OUT"/thing-*-principals.json 2>/dev/null | sort -u > "$OUT/_all-principal-arns.txt" || true

# For each cert ARN, fetch describe + policies
while read -r CERT_ARN; do
  [ -z "${CERT_ARN:-}" ] && continue
  CID="$(printf "%s" "$CERT_ARN" | awk -F/ '{print $NF}')"
  aws iot describe-certificate --certificate-id "$CID" --region "$REGION" > "$OUT/certificate-${CID}.json" || true
  aws iot list-principal-policies --principal "$CERT_ARN" --region "$REGION" > "$OUT/certificate-${CID}-policies.json" || true
done < "$OUT/_all-principal-arns.txt"

# Also list all IoT policies and fetch docs
aws iot list-policies --region "$REGION" > "$OUT/policies.json"
for PNAME in $(jq -r '.policies[].policyName' "$OUT/policies.json"); do
  safep="$(printf "%s" "$PNAME" | sed 's/[^A-Za-z0-9._-]/_/g')"
  aws iot get-policy --policy-name "$PNAME" --region "$REGION" > "$OUT/policy-${safep}.json" || true
done

echo "== Topic Rules =="
aws iot list-topic-rules --region "$REGION" > "$OUT/rules.json"
for R in $(jq -r '.rules[].ruleName' "$OUT/rules.json"); do
  safer="$(printf "%s" "$R" | sed 's/[^A-Za-z0-9._-]/_/g')"
  aws iot get-topic-rule --rule-name "$R" --region "$REGION" > "$OUT/rule-${safer}.json" || true
done

echo "== Jobs & Role Aliases =="
aws iot list-jobs --region "$REGION" --max-results 50 > "$OUT/jobs.json" || true
aws iot list-job-templates --region "$REGION"        > "$OUT/job-templates.json" || true
aws iot list-role-aliases --region "$REGION"         > "$OUT/role-aliases.json" || true
for A in $(jq -r '.roleAliases[]?' "$OUT/role-aliases.json" 2>/dev/null || true); do
  safea="$(printf "%s" "$A" | sed 's/[^A-Za-z0-9._-]/_/g')"
  aws iot describe-role-alias --role-alias "$A" --region "$REGION" > "$OUT/role-alias-${safea}.json" || true
done

echo "Done. Raw IoT inventory in $OUT/ (gitignored)."
