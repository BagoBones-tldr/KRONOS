#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTEXT_DIR="$ROOT/.claude/context"
COMMIT_MSG_FILE="${1:-}"

mkdir -p "$CONTEXT_DIR"

TIMESTAMP="$(TZ=America/Chicago date '+%Y-%m-%d %I:%M:%S %p %Z')"
BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"

SUMMARY="Manual sync"
if [[ -n "$COMMIT_MSG_FILE" && -f "$COMMIT_MSG_FILE" ]]; then
  SUMMARY="$(sed -n '1{/^#/d;/^$/d;p;}' "$COMMIT_MSG_FILE" | head -n 1 | tr -d '\r')"
  [[ -z "$SUMMARY" ]] && SUMMARY="No summary provided"
fi

RECENT_COMMITS="$(git -C "$ROOT" log --oneline -8 2>/dev/null || echo 'unavailable')"

# ── state.md ──────────────────────────────────────────────────────────────────
{
  echo "# KRONOS State"
  echo "Last updated: $TIMESTAMP"
  echo "Branch: $BRANCH | Latest commit: $SUMMARY"
  echo
  echo "## Services (macOS launchd)"
  echo "- telegram-commands.js — long-poll Telegram listener, KeepAlive"
  echo "- pre-event-alerts.js — 60s interval; runs calendar alerts + Apple Reminders in parallel"
  echo "- daily-briefing — scheduled at BRIEFING_HOUR (default 8am America/Chicago)"
  echo "- end-of-day — scheduled at WRAPUP_HOUR (default 9pm America/Chicago)"
  echo
  echo "## Capabilities"
  echo "- Apple Calendar (read + write via CalDAV)"
  echo "- Apple Reminders (create, poll, ping, mark complete via CalDAV)"
  echo "- Daily Telegram briefing"
  echo "- Weather — IP geolocation auto-detect via ipapi.co (no hardcoded coords)"
  echo "- Full Telegram command system"
  echo "- Pre-event alerts + reminder alerts merged into one loop"
  echo "- Conflict detection, free/busy analysis"
  echo "- Task system (/task, /tasks, /done, /untask)"
  echo "- Saved preferences (/remember, /preferences)"
  echo "- Obsidian journal logging (/note via Telegram or npm run note)"
  echo "- End-of-day wrap-ups (/wrapup)"
  echo "- Anthropic reasoning layer (claude-sonnet-4-6)"
  echo "- HTTP chat endpoint (POST /chat, port 3001)"
  echo "- Desktop menubar widget (kronos-widget, Electron, deferred rebuild)"
  echo
  echo "## Key .env Variables"
  echo "- APPLE_ID, APPLE_PASS — iCloud CalDAV auth"
  echo "- TELEGRAM_TOKEN, TELEGRAM_CHAT_ID — Telegram bot"
  echo "- ANTHROPIC_KEY — Anthropic API (also checked as ANTHROPIC_API_KEY)"
  echo "- DEFAULT_CALENDAR_NAME — preferred write calendar (default: Home)"
  echo "- APPLE_REMINDERS_LIST — preferred reminders list"
  echo "- BRIEFING_TIMEZONE, BRIEFING_HOUR — daily briefing schedule"
  echo "- WRAPUP_TIMEZONE, WRAPUP_HOUR — end-of-day schedule"
  echo "- KRONOS_STORAGE_PATH — override state dir (for Pi/NAS)"
  echo "- KRONOS_OBSIDIAN_DIR — override Obsidian vault path (unset = Mac default)"
  echo "- KRONOS_INSTANCE_NAME — label shown in status responses"
  echo "- HTTP_PORT, KRONOS_HTTP_KEY — HTTP server config"
  echo "- NOTE: WEATHER_LATITUDE/LONGITUDE/TIMEZONE removed — weather is now auto-detected"
  echo
  echo "## Pi Deployment Status"
  echo "- Hardware incoming"
  echo "- Deploy via: git clone from GitHub (USB backup is from April 4, outdated)"
  echo "- Use systemd on Pi (not launchd)"
  echo "- /note command non-functional on Pi without KRONOS_OBSIDIAN_DIR set"
  echo "- Weather auto-detect works on Pi natively"
} > "$CONTEXT_DIR/state.md"

# ── architecture.md ───────────────────────────────────────────────────────────
{
  echo "# KRONOS Architecture"
  echo "Last updated: $TIMESTAMP"
  echo
  echo "## Entry Points"
  echo "- daily-clean.js — morning briefing (--scheduled flag gates on BRIEFING_HOUR)"
  echo "- telegram-commands.js — long-poll Telegram loop"
  echo "- pre-event-alerts.js — runs calendar alerts + sendReminderAlerts() in parallel"
  echo "- end-of-day.js — wrap-up briefing (--scheduled flag gates on WRAPUP_HOUR)"
  echo "- reminder-alerts.js — standalone runner OR imported by pre-event-alerts.js"
  echo "- http-server.js — Express POST /chat endpoint (must be manually restarted on code change)"
  echo
  echo "## Service Layer"
  echo "- calendar-service.js / caldav-client.js — CalDAV fetch + ICS parsing"
  echo "- calendar-write-service.js — CalDAV event create/delete"
  echo "- reminder-service.js — Apple Reminders via CalDAV (PROPFIND + multiget workaround)"
  echo "- ai-service.js — Anthropic SDK, two-pass briefing generation, conversation fallback"
  echo "- ai-policy.js — system prompt and policy constraints for all AI calls"
  echo "- briefing-service.js — daily briefing and wrap-up formatting"
  echo "- alert-service.js — pre-event alert logic and state"
  echo "- weather-service.js — Open-Meteo fetch; IP geolocation via ipapi.co when coords not set"
  echo "- obsidian-service.js — appends timestamped entries to KRONOS Notes/dev-journal/YYYY-MM-DD.md"
  echo "- telegram-service.js — Telegram Bot API wrapper"
  echo "- command-service.js — full command dispatch, NLP routing, all /command handlers"
  echo "- log-service.js — reads KRONOS_LOG.md for /log command"
  echo "- schedule-analysis.js — free block detection, conflict detection, busy time"
  echo
  echo "## State / Storage"
  echo "- storage.js + storage-layout.js — all state paths; KRONOS_STORAGE_PATH overrides root"
  echo "- runtime-paths.js — Obsidian vault paths; KRONOS_OBSIDIAN_DIR overrides root"
  echo "- state/ — telegram.json, conversations.json, preferences.json, tasks.json,"
  echo "           alerts.json, end-of-day.json, reminders.json"
  echo
  echo "## Obsidian Integration"
  echo "- Vault: ~/Documents/Obsidian Vault/"
  echo "- KRONOS Notes/Project KRONOS.md — auto-generated on git commit"
  echo "- KRONOS Notes/KRONOS Tasks.md — auto-generated on git commit"
  echo "- KRONOS Notes/Dev. Journal.md — manually maintained per session"
  echo "- KRONOS Notes/dev-journal/YYYY-MM-DD.md — /note command output"
  echo "- KRONOS Notes/briefings/YYYY-MM-DD.md — daily briefing saves"
  echo "- KRONOS Notes/archive/ — KRONOS_RECOVERY.md, Pi upload instructions"
  echo
  echo "## launchd Agents (macOS)"
  echo "- com.projectkronos.telegram-commands"
  echo "- com.projectkronos.pre-event-alerts (60s interval)"
  echo "- com.projectkronos.daily-briefing"
  echo "- com.projectkronos.end-of-day"
  echo "- com.kronoswidget (kronos-widget Electron app)"
} > "$CONTEXT_DIR/architecture.md"

# ── sessions.md ───────────────────────────────────────────────────────────────
SESSIONS_FILE="$CONTEXT_DIR/sessions.md"

if [[ ! -f "$SESSIONS_FILE" ]]; then
  echo "# KRONOS Session Log" > "$SESSIONS_FILE"
  echo "" >> "$SESSIONS_FILE"
fi

# Prepend new entry if this was triggered by a commit (not a manual sync)
if [[ -n "$COMMIT_MSG_FILE" && -f "$COMMIT_MSG_FILE" && "$SUMMARY" != "Manual sync" ]]; then
  EXISTING="$(cat "$SESSIONS_FILE")"
  {
    echo "# KRONOS Session Log"
    echo ""
    echo "## $TIMESTAMP"
    echo "- Branch: $BRANCH"
    echo "- Commit: $SUMMARY"
    echo ""
    echo "$EXISTING" | tail -n +2
  } > "$SESSIONS_FILE"
fi

# ── recent commits appended to state ──────────────────────────────────────────
{
  echo ""
  echo "## Recent Commits"
  echo "$RECENT_COMMITS" | while IFS= read -r line; do echo "- $line"; done
} >> "$CONTEXT_DIR/state.md"
