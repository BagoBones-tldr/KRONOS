#!/bin/zsh
set -euo pipefail

AGENT_DIR="$HOME/Library/LaunchAgents"

launchctl bootout "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.telegram-commands.plist" 2>/dev/null || true
launchctl bootout "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.pre-event-alerts.plist" 2>/dev/null || true

rm -f "$AGENT_DIR/com.projectkronos.telegram-commands.plist"
rm -f "$AGENT_DIR/com.projectkronos.pre-event-alerts.plist"

pkill -f telegram-commands.js 2>/dev/null || true
pkill -f pre-event-alerts.js 2>/dev/null || true

echo "Removed Project KRONOS launch agents."
