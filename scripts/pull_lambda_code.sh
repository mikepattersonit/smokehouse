#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-east-2}"
OUT_DIR="lambdas"
LIST_FILE="cloud-inventory/lambda-functions.json"

if [ ! -f "$LIST_FILE" ]; then
  echo "Missing $LIST_FILE. Run the cloud inventory first." >&2
  exit 1
fi

mapfile -t FUNCS < <(jq -r '.Functions[].FunctionName' "$LIST_FILE")
echo "Found ${#FUNCS[@]} Lambda functions."

for F in "${FUNCS[@]}"; do
  echo "==> Exporting $F"
  URL=$(aws lambda get-function --function-name "$F" --region "$REGION" --query 'Code.Location' --output text)
  DEST="$OUT_DIR/$F"
  TMPZIP="$(mktemp -u)/code.zip"
  mkdir -p "$(dirname "$TMPZIP")" "$DEST"
  curl -sSL "$URL" -o "$TMPZIP"
  # Unzip into a temp dir to avoid littering DEST
  TMPDIR="$(mktemp -d)"
  unzip -q "$TMPZIP" -d "$TMPDIR"
  # Move contents into DEST (create a minimal README if none)
  shopt -s dotglob
  if [ -z "$(ls -A "$TMPDIR")" ]; then
    echo "(!) Zip for $F was empty?" >&2
  else
    mkdir -p "$DEST"
    mv "$TMPDIR"/* "$DEST"/
  fi
  shopt -u dotglob
  # Clean heavy/vendor stuff
  rm -rf "$DEST/node_modules" "$DEST/.venv" "$DEST/__pycache__" 2>/dev/null || true

  # Add README with context if missing
  if [ ! -f "$DEST/README.md" ]; then
    RUNTIME=$(aws lambda get-function-configuration --function-name "$F" --region "$REGION" --query 'Runtime' --output text)
    HANDLER=$(aws lambda get-function-configuration --function-name "$F" --region "$REGION" --query 'Handler' --output text)
    cat > "$DEST/README.md" <<RMD
# $F

- **Runtime:** \`$RUNTIME\`
- **Handler:** \`$HANDLER\`
- **Note:** Environment variables are *not* exported. Configure via AWS Console/SSM/Secrets.
- **Deploy:** (to be added later via CI/CD)

RMD
  fi

  # Hint: detect Node vs Python and add a .gitignore per function
  if [ -f "$DEST/package.json" ]; then
    echo -e "node_modules/\n" > "$DEST/.gitignore"
  elif compgen -G "$DEST/*.py" >/dev/null; then
    echo -e ".venv/\n__pycache__/\n" > "$DEST/.gitignore"
  fi

  rm -f "$TMPZIP"
  rm -rf "$TMPDIR"
done

echo "Done. Lambdas exported under $OUT_DIR/"
