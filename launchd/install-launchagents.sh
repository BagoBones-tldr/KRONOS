#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="$HOME/Library/LaunchAgents"
HOME_DIR="$HOME"

mkdir -p "$AGENT_DIR"

render_plist() {
  local source="$1"
  local target="$2"
  sed \
    -e "s|__KRONOS_ROOT__|$ROOT|g" \
    -e "s|__KRONOS_HOME__|$HOME_DIR|g" \
    "$source" > "$target"
}

render_plist "$ROOT/launchd/com.projectkronos.telegram-commands.plist" "$AGENT_DIR/com.projectkronos.telegram-commands.plist"
render_plist "$ROOT/launchd/com.projectkronos.pre-event-alerts.plist" "$AGENT_DIR/com.projectkronos.pre-event-alerts.plist"
render_plist "$ROOT/launchd/com.projectkronos.end-of-day.plist" "$AGENT_DIR/com.projectkronos.end-of-day.plist"
render_plist "$ROOT/launchd/com.projectkronos.daily-briefing.plist" "$AGENT_DIR/com.projectkronos.daily-briefing.plist"
render_plist "$ROOT/launchd/com.projectkronos.http-server.plist" "$AGENT_DIR/com.projectkronos.http-server.plist"

launchctl bootout "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.telegram-commands.plist" 2>/dev/null || true
launchctl bootout "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.pre-event-alerts.plist" 2>/dev/null || true
launchctl bootout "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.end-of-day.plist" 2>/dev/null || true
launchctl bootout "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.daily-briefing.plist" 2>/dev/null || true
launchctl bootout "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.http-server.plist" 2>/dev/null || true

pkill -f telegram-commands.js 2>/dev/null || true
pkill -f pre-event-alerts.js 2>/dev/null || true
pkill -f end-of-day.js 2>/dev/null || true
pkill -f daily-clean.js 2>/dev/null || true
pkill -f http-server.js 2>/dev/null || true

launchctl bootstrap "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.telegram-commands.plist"
launchctl bootstrap "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.pre-event-alerts.plist"
launchctl bootstrap "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.end-of-day.plist"
launchctl bootstrap "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.daily-briefing.plist"
launchctl bootstrap "gui/$(id -u)" "$AGENT_DIR/com.projectkronos.http-server.plist"

echo "Installed and started Project KRONOS launch agents."
