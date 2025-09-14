#!/usr/bin/env bash
set -euo pipefail

# 1) Strengthen .gitignore
grep -qxF '.artifacts/' .gitignore || echo '.artifacts/' >> .gitignore
grep -qxF 'cloud-inventory/' .gitignore || echo 'cloud-inventory/' >> .gitignore

# 2) Stop tracking already-committed artifacts
git rm -r --cached .artifacts || true
git rm -r --cached cloud-inventory || true

# 3) Commit the clean-up
git add .gitignore
git commit -m "chore(repo): ignore local artifacts and inventories; untrack committed artifacts" || true
