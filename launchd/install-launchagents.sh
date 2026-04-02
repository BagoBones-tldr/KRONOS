#!/bin/zsh
set -euo pipefail

ROOT="/Users/edwards/Developer/project-kronos"
AGENT_DIR="$HOME/Library/LaunchAgents"

mkdir -p "$AGENT_DIR"

cp "$ROOT/launchd/com.projectkronos.telegram-commands.plist" "$AGENT_DIR/"
cp "$ROOT/launchd/com.projectkronos.pre-event-alerts.plist" "$AGENT_DIR/"

launchctl bootout "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.telegram-commands.plist" 2>/dev/null || true
launchctl bootout "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.pre-event-alerts.plist" 2>/dev/null || true

pkill -f telegram-commands.js 2>/dev/null || true
pkill -f pre-event-alerts.js 2>/dev/null || true

launchctl bootstrap "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.telegram-commands.plist"
launchctl bootstrap "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.pre-event-alerts.plist"

echo "Installed and started Project KRONOS launch agents."
