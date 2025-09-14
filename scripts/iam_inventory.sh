#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-east-2}"
BASE="cloud-inventory"
OUT="$BASE/iam"
mkdir -p "$OUT"

echo "== Ensure lambda function list exists (sanitized) =="
if [ ! -f "$BASE/lambda-functions.json" ]; then
  aws lambda list-functions --region "$REGION" \
    | jq 'del(.Functions[].Environment)' \
    > "$BASE/lambda-functions.json"
fi

echo "== Fetch per-function configurations =="
mapfile -t FUNCS < <(jq -r '.Functions[].FunctionName' "$BASE/lambda-functions.json")
echo "Found ${#FUNCS[@]} Lambda functions."
for F in "${FUNCS[@]}"; do
  aws lambda get-function-configuration --function-name "$F" --region "$REGION" \
    > "$BASE/lambda-${F}-config.json"
done

# quick validate shape (should print "object" for each)
jq -r 'type' "$BASE"/lambda-*-config.json | sort -u

echo "== Build Lambda → Role mapping =="
jq -n '
  [ inputs
    | {
        FunctionName: (input_filename | capture("lambda-(?<name>.*)-config\\.json").name),
        RoleArn: .Role,
        Runtime: .Runtime,
        Handler: .Handler
      }
  ]
' "$BASE"/lambda-*-config.json > "$OUT/iam-lambda-roles.json"

echo "== Unique IAM roles used by Lambdas =="
mapfile -t ROLE_ARNS < <(jq -r '.[].RoleArn' "$OUT/iam-lambda-roles.json" | sort -u)
printf "%s\n" "${ROLE_ARNS[@]}" > "$OUT/roles.txt" || true
echo "Found ${#ROLE_ARNS[@]} roles"

role_name_from_arn () {
  # arn:aws:iam::123456789012:role/Path/Name -> Name
  echo "$1" | awk -F'/' '{print $NF}'
}

for ARN in "${ROLE_ARNS[@]}"; do
  NAME="$(role_name_from_arn "$ARN")"
  echo "---- $NAME"
  aws iam get-role --role-name "$NAME" > "$OUT/role-${NAME}-get-role.json"
  aws iam list-attached-role-policies --role-name "$NAME" > "$OUT/role-${NAME}-attached.json"
  aws iam list-role-policies --role-name "$NAME" > "$OUT/role-${NAME}-inline-names.json"

  # Inline policies (embedded JSON)
  mapfile -t INLINE_NAMES < <(jq -r '.PolicyNames[]?' "$OUT/role-${NAME}-inline-names.json")
  for P in "${INLINE_NAMES[@]}"; do
    aws iam get-role-policy --role-name "$NAME" --policy-name "$P" \
      > "$OUT/role-${NAME}-inline-${P}.json"
  done

  # Attached managed policies (fetch current document)
  mapfile -t ATTACHED_ARNS < <(jq -r '.AttachedPolicies[].PolicyArn?' "$OUT/role-${NAME}-attached.json")
  for PARN in "${ATTACHED_ARNS[@]}"; do
    SAFEBASE="$(basename "$PARN")"
    aws iam get-policy --policy-arn "$PARN" > "$OUT/role-${NAME}-attached-${SAFEBASE}.json"
    PV=$(jq -r '.Policy.DefaultVersionId' "$OUT/role-${NAME}-attached-${SAFEBASE}.json")
    aws iam get-policy-version --policy-arn "$PARN" --version-id "$PV" \
      > "$OUT/role-${NAME}-attached-${SAFEBASE}-version-${PV}.json"
  done
done

echo "== IoT: topic rules and policies (roleArns often live on actions) =="
aws iot list-topic-rules --region "$REGION" > "$OUT/iot-rules-list.json"
mapfile -t RULE_NAMES < <(jq -r '.rules[].ruleName?' "$OUT/iot-rules-list.json")
for R in "${RULE_NAMES[@]}"; do
  aws iot get-topic-rule --rule-name "$R" --region "$REGION" > "$OUT/iot-rule-${R}.json"
done

aws iot list-policies --region "$REGION" > "$OUT/iot-policies.json"
mapfile -t IOTP < <(jq -r '.policies[].policyName?' "$OUT/iot-policies.json")
for P in "${IOTP[@]}"; do
  aws iot get-policy --policy-name "$P" --region "$REGION" > "$OUT/iot-policy-${P}.json"
done

echo "Done. Raw IAM inventory under $OUT/ (gitignored)."
