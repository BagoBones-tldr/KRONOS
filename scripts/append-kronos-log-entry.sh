#!/bin/zsh
set -euo pipefail

ROOT="/Users/edwards/Developer/project-kronos"
LOG_FILE="$ROOT/KRONOS_LOG.md"
COMMIT_MSG_FILE="${1:-}"

if [[ -z "$COMMIT_MSG_FILE" || ! -f "$COMMIT_MSG_FILE" ]]; then
  echo "Usage: $0 <commit-message-file>" >&2
  exit 1
fi

cd "$ROOT"

SUMMARY="$(sed -n '1{/^#/d;/^$/d;p;}' "$COMMIT_MSG_FILE" | head -n 1 | tr -d '\r')"
if [[ -z "$SUMMARY" ]]; then
  SUMMARY="No summary provided"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TIMESTAMP="$(TZ=America/Chicago date '+%Y-%m-%d %I:%M:%S %p %Z')"
STAGED_FILES="$(git diff --cached --name-only --diff-filter=ACMR)"

if ! grep -q '^## 🤖 Automated Updates' "$LOG_FILE"; then
  cat >> "$LOG_FILE" <<'EOF'

## 🤖 Automated Updates

EOF
fi

{
  printf '### %s\n' "$TIMESTAMP"
  printf -- '- Summary: `%s`\n' "$SUMMARY"
  printf -- '- Branch: `%s`\n' "$BRANCH"
  printf -- '- Files:\n'
  if [[ -n "$STAGED_FILES" ]]; then
    while IFS= read -r file; do
      [[ -n "$file" ]] && printf '  - `%s`\n' "$file"
    done <<< "$STAGED_FILES"
  else
    printf '  - `(no staged files detected)`\n'
  fi
  printf '\n'
} >> "$LOG_FILE"

git add "$LOG_FILE"
