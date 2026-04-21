#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"
exec /opt/homebrew/bin/node end-of-day.js --scheduled
