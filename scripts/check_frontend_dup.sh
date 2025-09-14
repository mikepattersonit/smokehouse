#!/usr/bin/env bash
set -euo pipefail

if [ -d front-end ] && [ -f package.json ] && [ -d src ] && [ -d public ]; then
  echo "Found two apps: root and /front-end"
  echo "Diffing package.json names & start scripts:"
  jq -r '.name, .scripts.start?' package.json || true
  jq -r '.name, .scripts.start?' front-end/package.json || true

  echo
  echo "Quick structure diff (ignores node_modules):"
  diff -qr --exclude node_modules front-end/src src || true
  diff -qr --exclude node_modules front-end/public public || true
  echo
  echo "If they’re effectively duplicates and root is the source of truth, you can remove /front-end:"
  echo "  git rm -r front-end && git commit -m 'chore(frontend): drop duplicate /front-end app' && git push"
else
  echo "No duplicate apps detected or one side is missing."
fi
