# CLAUDE.md — Project KRONOS

## Read these first on every session

Before doing anything else, read the three auto-generated context files:

```
.claude/context/state.md        — live capabilities, env vars, Pi status, recent commits
.claude/context/architecture.md — full file map and service relationships
.claude/context/sessions.md     — session/commit log
```

These are regenerated on every `git commit` and are the authoritative current snapshot.

---

## Project overview

**Project KRONOS** is a Node.js personal assistant that runs as a set of long-running macOS daemons (launchd) or Linux services (systemd on Pi). It connects Apple Calendar and Apple Reminders via iCloud CalDAV, sends schedule briefings and pre-event alerts over Telegram, and exposes an HTTP chat endpoint.

Runtime: Node.js (CommonJS, no TypeScript). No build step. All modules are `require()`.

---

## Current context (Cane)

I'm Cane. KRONOS is a personal AI assistant: Node.js + Telegram bot interface + Claude API + CalDAV (Apple Calendar/Reminders).

**Infrastructure:**
- **Sentinel** — Dell OptiPlex 7010, Ubuntu Desktop (reinstalled 2026-05-24, swapped from Server for an interactive GUI), unencrypted disk, static IP `192.168.1.11`, SSH key auth, `ufw` firewall. GUI apps via snap: Firefox, VS Code, Telegram Desktop, Bitwarden, Proton Mail, Thunderbird.
- **KRONOS** — repo cloned at `~/Developer/project-kronos/`. GitHub: `BagoBones-tldr/KRONOS`. **Not currently deployed** — `.env` is being rebuilt from Bitwarden at a deliberate pace; no running services yet. Deployment approach (Docker vs. systemd vs. plain `node`) TBD on re-deploy.

**Syncthing (Mac ↔ Sentinel):** Bidirectional Obsidian vault sync. Folder ID `fxtux-q3qld`, mounted at `/home/quintin-edwards/Documents/Obsidian Vault/`. Tower-side ignore patterns applied via REST API (`(?i)SECRETS-TO-BACKUP*`, `(?i).env`, `(?i).env.*`, `(?i)*.env`, `(?i)*credentials*.json`, `(?i)*api-keys*`); same set mirrored on the Mac. Vault layout has KRONOS Notes nested under `Projects/KRONOS Notes/` — `.env` overrides `KRONOS_OBSIDIAN_NOTES_DIR` and `KRONOS_BRIEFINGS_PATH` accordingly.

**Docker:** Not currently installed on Sentinel — wiped in the reinstall. Prior deployment ran KRONOS via Docker Compose v2.24.0 with `DOCKER_BUILDKIT=0` (legacy builder forced because v2's bundled BuildKit silently failed `npm ci`). If Docker is reinstalled, keep that workaround in `~/.bashrc`.

**Tailscale VPN:** Not currently installed on Sentinel — wiped in the reinstall. Prior setup had Sentinel as exit node and Mac connected with IPv6 disabled on Wi-Fi to prevent leaks. Reinstall pending.

**Open:**
- Rebuild Sentinel `.env` from Bitwarden (paced over days to mitigate burnout). `.env.template` already prepared at repo root with Linux paths.
- Re-deploy KRONOS on Sentinel once `.env` is filled. Decide deployment mode (Docker vs. systemd vs. plain `node`) at that point.
- Recurring event support (`/add` creation side first, then series deletion). Natural language patterns like "every Monday at 9am", "weekly", "every weekday". RRULE builder needed in `calendar-write-service.js`; NLP parser update in `command-service.js`.
- ADR-style decision log — extend architecture docs to cover physical infrastructure decisions (Sentinel hardware, Server-vs-Desktop swap, Docker vs systemd, Tailscale setup, storage layout choices). Entries should be portfolio-worthy: written to demonstrate engineering judgment, not just record what was chosen. The ADR scaffolding already exists in the vault at `Projects/homelab/decisions/`.

**Next:** Pi 5 reorder when budget allows (Amazon refund received 2026-05-14, saving up). Reinstall Tailscale on Sentinel after `.env` rebuild so phone/away access works again.

---

## Entry points

| File | Purpose |
|---|---|
| `daily-clean.js` | Morning briefing — fetches today's events + weather, generates AI summary, sends to Telegram, saves to Obsidian. `DRY_RUN=1` to preview. `--scheduled` flag gates send on `BRIEFING_HOUR`. |
| `telegram-commands.js` | Long-poll Telegram loop. Dispatches all `/commands` and conversational fallback via `command-service.js`. Manages per-chat conversation state with rolling summarization. |
| `pre-event-alerts.js` | One-shot runner (looped externally at 60s). Runs calendar pre-event alerts and Apple Reminders alerts in parallel via `Promise.allSettled`. |
| `end-of-day.js` | Evening wrap-up briefing with task summary. `--scheduled` gates on `WRAPUP_HOUR`. Idempotent: tracks `lastSentLocalDate` in state to prevent double-sends. |
| `reminder-alerts.js` | Standalone Apple Reminders due-alert runner. Also imported by `pre-event-alerts.js`. |
| `http-server.js` | Express server on `HTTP_PORT` (default 3001). Single `POST /chat` endpoint authenticated by `X-Kronos-Key` header. Must be manually restarted after code changes. |

---

## Service layer

### Calendar

| File | Role |
|---|---|
| `caldav-client.js` | Creates the `tsdav` DAVClient (iCloud endpoint). Single shared client factory. |
| `calendar-service.js` | CalDAV fetch + ICS parsing. Exports `fetchTodayEvents`, `fetchEventsForDate`, `parseEventData`. Drops events with invalid `DTSTART` and warns to console. |
| `calendar-write-service.js` | CalDAV event create/delete. Tries all VEVENT calendars in priority order; `DEFAULT_CALENDAR_NAME` env var puts the matching calendar first. Returns structured error on 403. |
| `reminder-service.js` | Apple Reminders via CalDAV VTODO. **iCloud rejects calendar-query REPORT on VTODO collections** — workaround is PROPFIND (depth:1) + calendar-multiget. Filters by `DUE <= now` and staleness window (`REMINDER_STALE_HOURS`, default 4h). |

### AI

| File | Role |
|---|---|
| `ai-service.js` | Anthropic SDK integration. Two-pass generation for briefings/focus/wrap-ups: first pass validates time references against actual event times; if invalid, retries with `forbidClockTimes: true`. Conversation fallback uses structured `messages[]` array (never embeds history as text). Exports `generateAiBriefing`, `generateAiFocus`, `generateAiWrapUp`, `generateAiConversation`, `summarizeConversationTurns`. |
| `ai-policy.js` | Exports `buildKronosSystemPrompt()`. Single source of truth for KRONOS identity, voice rules, source-of-truth hierarchy, and what the AI is not allowed to claim. Edit here to change AI behavior globally. |

### Briefing & alerts

| File | Role |
|---|---|
| `briefing-service.js` | Builds context objects (`buildDailyContext`, `buildWrapUpContext`) and calls `ai-service.js` to generate final text. Falls back to deterministic formatting if AI is unavailable. |
| `alert-service.js` | Pre-event alert logic. Fires when event is within `ALERT_LEAD_MINUTES` (default 30) ± `ALERT_WINDOW_MINUTES` (default 5). State-tracked per event key to prevent duplicate sends. |
| `schedule-analysis.js` | Free block detection, conflict detection, busy-time totals, next-event lookup. Pure analysis — no I/O. |
| `weather-service.js` | Open-Meteo fetch. IP geolocation via `ipapi.co` when `WEATHER_LATITUDE`/`WEATHER_LONGITUDE` are not set. Works natively on Pi. |

### Commands & conversation

| File | Role |
|---|---|
| `command-service.js` | Full command dispatch. `buildCommandResult(text, now, conversationState)` is the single entry point for all commands and conversational fallback. Contains NLP routing, all `/command` handler functions, and error messages for known CalDAV failures (403 on write, recurring event protection, ambiguous match). |
| `schedule-analysis.js` | Consumed by command handlers for free/busy/conflict queries. |

### State & storage

| File | Role |
|---|---|
| `storage.js` | All file I/O. `KRONOS_STORAGE_PATH` env var overrides the root (used for Pi NAS deployment). Exports `readJson`, `writeJson`, `readText`, `writeText`. Always resolves paths relative to `KRONOS_STORAGE_PATH` or `__dirname`. |
| `storage-layout.js` | Single source of truth for all state file paths under `state/`. Also exports `LEGACY_STORAGE_PATHS` for backward-compat reads from old root-level JSON files. |
| `runtime-paths.js` | Obsidian vault paths. `KRONOS_OBSIDIAN_DIR` overrides default (`~/Documents/Obsidian Vault`). `KRONOS_BRIEFINGS_PATH` overrides briefings subdir. |
| `conversation-state.js` | Per-chat conversation history. Rolling summarization triggered at `SUMMARIZE_AT` turns. |
| `telegram-state.js` | Persists `nextOffset` for Telegram long-polling. |
| `preference-state.js` | User preferences (`/remember`). Loaded and injected into AI context on every command. |
| `task-state.js` | `/task`, `/done`, `/untask` state. Open + completed tasks included in wrap-up briefings. |
| `usage-stats.js` | Per-command usage counters. Non-critical — failures are swallowed. |

### Integrations

| File | Role |
|---|---|
| `telegram-service.js` | Telegram Bot API wrapper. HTML parse mode for all messages. |
| `obsidian-service.js` | Appends timestamped entries to `KRONOS Notes/dev-journal/YYYY-MM-DD.md`. Non-functional on Pi unless `KRONOS_OBSIDIAN_DIR` is set to a mounted vault. |
| `log-service.js` | Reads `KRONOS_LOG.md` for `/log` command output. |
| `env.js` | `loadEnv()` — idempotent dotenv loader. Called at the top of every entry point. |

---

## State files (under `state/` or `KRONOS_STORAGE_PATH/state/`)

```
state/telegram.json         — Telegram polling offset
state/conversations.json    — per-chat conversation history + summaries
state/preferences.json      — /remember key-value store
state/tasks.json            — task list
state/alerts.json           — sent pre-event alert keys (dedup)
state/end-of-day.json       — last sent wrap-up date (dedup)
state/reminders.json        — sent reminder alert state
state/usage-stats.json      — command frequency counts
```

Legacy root-level JSON files (`telegram-state.json`, etc.) are still read as fallbacks but new writes go to `state/`.

---

## Obsidian integration

Vault root: `~/Documents/Obsidian Vault/` (or `KRONOS_OBSIDIAN_DIR`)

```
KRONOS Notes/KRONOS Tasks.md       — auto-generated on git commit
KRONOS Notes/Project KRONOS.md     — auto-generated on git commit
KRONOS Notes/Dev. Journal.md       — manually maintained per session
KRONOS Notes/dev-journal/YYYY-MM-DD.md  — /note command writes here
KRONOS Notes/briefings/YYYY-MM-DD.md   — daily briefing saves
KRONOS Notes/archive/               — KRONOS_RECOVERY.md, Pi upload docs
```

---

## All env vars

| Variable | Required | Default | Notes |
|---|---|---|---|
| `APPLE_ID` | yes | — | iCloud account email |
| `APPLE_PASS` | yes | — | App-specific password (not iCloud password) |
| `DEFAULT_CALENDAR_NAME` | no | first writable | Calendar used for `/add` writes |
| `APPLE_REMINDERS_LIST` | no | first VTODO | Reminders list used for `/remind` writes |
| `TELEGRAM_TOKEN` | yes | — | Bot token |
| `TELEGRAM_CHAT_ID` | yes | — | Allowed chat ID (single-user bot) |
| `ALLOW_EDITED_MESSAGES` | no | `0` | Set to `1` to process edited messages |
| `ANTHROPIC_API_KEY` | no | — | Also checked as `ANTHROPIC_KEY` |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-6` | Override model for all AI calls |
| `BRIEFING_TIMEZONE` | no | `America/Chicago` | Timezone for briefing schedule gate |
| `BRIEFING_HOUR` | no | `8` | Hour (0–23) to send morning briefing |
| `WRAPUP_TIMEZONE` | no | `America/Chicago` | Timezone for wrap-up schedule gate |
| `WRAPUP_HOUR` | no | `21` | Hour (0–23) to send wrap-up |
| `WRAPUP_MINUTE` | no | `0` | Minute offset for wrap-up window |
| `WRAPUP_MINUTE_WINDOW` | no | `15` | How many minutes the wrap-up window stays open |
| `ALERT_LEAD_MINUTES` | no | `30` | Minutes before event to fire pre-event alert |
| `ALERT_WINDOW_MINUTES` | no | `5` | Alert fires if within `[lead, lead - window]` minutes |
| `REMINDER_STALE_HOURS` | no | `4` | Reminders older than this are skipped |
| `HTTP_PORT` | no | `3001` | Port for HTTP chat endpoint |
| `KRONOS_HTTP_KEY` | no | — | Secret for `X-Kronos-Key` header auth. If unset, all requests accepted (warn logged). |
| `KRONOS_STORAGE_PATH` | no | `__dirname` | Absolute path for state files (Pi/NAS use) |
| `KRONOS_OBSIDIAN_DIR` | no | `~/Documents/Obsidian Vault` | Obsidian vault root |
| `KRONOS_OBSIDIAN_NOTES_DIR` | no | `<vault>/KRONOS Notes` | Override KRONOS Notes subdir |
| `KRONOS_BRIEFINGS_PATH` | no | `<notes>/briefings` | Override briefings subdir |
| `KRONOS_INSTANCE_NAME` | no | — | Label shown in `/status` output (e.g. `pi`) |
| `DRY_RUN` | no | — | Set to `1` to skip all Telegram sends |
| `WEATHER_LATITUDE` | no | auto | Force weather location (usually leave unset) |
| `WEATHER_LONGITUDE` | no | auto | Force weather location (usually leave unset) |
| `WEATHER_TIMEZONE` | no | auto | Force weather timezone (usually leave unset) |

---

## Architecture rules

1. **`loadEnv()` at the top of every entry point** — once only (idempotent). Services never call it; they expect the env to already be loaded.
2. **All file I/O goes through `storage.js`** — never `fs` directly in service files. This ensures `KRONOS_STORAGE_PATH` is respected everywhere.
3. **`ai-policy.js` is the single source of truth for AI behavior** — system prompt, voice rules, and constraint list all live here. Never duplicate prompt instructions elsewhere.
4. **The AI must not claim to have performed write operations** — `isValidConversationalResponse()` in `ai-service.js` filters responses containing fabricated action claims. The forbidden-claims list is the enforcement layer; add to it when new false-claim patterns emerge.
5. **Two-pass AI generation for time references** — briefings and focus cues validate that any clock time the AI mentions exists in the structured event data. If the first pass fails validation, a second pass is made with `forbidClockTimes: true`. Do not skip this validation.
6. **iCloud CalDAV quirks are load-bearing** — the PROPFIND + multiget workaround in `reminder-service.js` exists because iCloud rejects `calendar-query REPORT` for VTODO collections. Do not replace with a standard report query.
7. **State paths come from `storage-layout.js`** — never hardcode `state/` paths in service files. Always import from `storage-layout.js`.
8. **Legacy path fallback pattern** — any new state file should follow the pattern in `end-of-day.js`: try `STORAGE_PATHS.x`, fall back to `LEGACY_STORAGE_PATHS.x`. Writes always go to the new canonical path.
9. **Telegram messages use HTML parse mode** — all output from KRONOS uses `<b>`, `<i>`, `<code>` tags, never Markdown. Do not mix.
10. **`pre-event-alerts.js` is one-shot** — it runs, does its work, and exits. The looping happens in launchd (StartInterval=60) or systemd (`while true; sleep 60`). Do not add a loop inside the script.

---

## Known bug patterns to avoid

**Double-sending alerts**: `alert-service.js` deduplicates by event key (title + start ISO string). If you change how `getEventKey()` generates keys, existing sent alerts in `state/alerts.json` will be forgotten and alerts will re-fire.

**Scheduled briefing not firing**: `daily-clean.js --scheduled` uses `Intl.DateTimeFormat` to check the current local hour in `BRIEFING_TIMEZONE`. If `BRIEFING_HOUR` is set but the launchd/systemd timer isn't running frequently enough (should be every 15 min), the window can be missed. Verify with `launchctl list | grep kronos` or `systemctl list-timers`.

**CalDAV 403 on write**: iCloud marks some calendars visible via CalDAV but not writable. `calendar-write-service.js` tries all VEVENT calendars in order. If all return 403, the error message tells the user to set `DEFAULT_CALENDAR_NAME`. Do not silently swallow this error.

**Recurring event deletion**: `calendar-write-service.js` has a guard that refuses to delete recurring series events. This is intentional — only individual occurrences (`RECURRENCE-ID`) should be deleted. Do not remove this guard.

**Ambiguous event match on `/remove`**: If multiple events match the search string, the command throws with "multiple events matched" and lists them. This is surfaced to the user as a clarification prompt, not an error response. The caller in `command-service.js` handles this pattern.

**AI message array must start with `user` role**: The Anthropic API rejects message arrays that start with an `assistant` turn. `buildConversationMessages()` strips leading assistant turns. If you modify conversation state logic, preserve this invariant.

**Consecutive same-role messages**: The API also rejects consecutive turns with the same role. `buildConversationMessages()` merges them. Don't break this when editing conversation history logic.

**Weather coordinates in .env**: `WEATHER_LATITUDE`, `WEATHER_LONGITUDE`, and `WEATHER_TIMEZONE` are deprecated — weather is now auto-detected via IP. The Pi deploy script warns if these are present. Leave them unset unless forcing a specific location.

---

## Telegram command reference

```
/today         Today's briefing
/tomorrow      Tomorrow's briefing
/week          7-day overview
/events [date] Events on a specific date
/next          Next upcoming event
/free [date]   Free blocks on a date
/busy [date]   Busy time summary
/weather       Current weather
/whenis [name] Find when a named event occurs
/conflicts     Detect scheduling conflicts
/availability  NLP availability query
/status        KRONOS instance status
/focus         AI focus cue for the current schedule
/wrapup        On-demand end-of-day summary
/log           Recent git commit log (KRONOS_LOG.md)
/add [details] Create a calendar event (NLP)
/remove [name] Delete a calendar event
/remind [task] Create an Apple Reminder (NLP)
/reminders     List pending reminders
/reminderlists List available reminder lists
/cancelreminder Cancel a reminder
/task [text]   Add a task
/tasks         List open tasks
/done [text]   Mark task complete
/untask [text] Remove a task
/remember [k=v] Save a preference
/preferences   Show saved preferences
/note [text]   Append to Obsidian dev journal
/help          Full command list
```

---

## Common development commands

```bash
cd ~/Developer/project-kronos

# Preview briefing (no Telegram send)
DRY_RUN=1 node daily-clean.js

# Run a specific command dry
DRY_RUN=1 node -e "require('./env').loadEnv(); require('./command-service').buildCommandResult('/today', new Date()).then(r => console.log(r.text))"

# Start Telegram listener (foreground)
node telegram-commands.js

# Start all background services
nohup node telegram-commands.js > telegram-commands.log 2>&1 &
nohup sh -c 'while true; do node pre-event-alerts.js; sleep 60; done' > pre-event-alerts.log 2>&1 &
nohup node http-server.js > http-server.log 2>&1 &

# npm shortcuts
npm run commands   # telegram-commands.js
npm run alerts     # pre-event-alerts.js
npm run http       # http-server.js
npm run note       # scripts/note.js (CLI note append)

# Check what's running
ps aux | grep -E 'telegram-commands|pre-event-alerts|http-server'

# Stop services
pkill -f telegram-commands.js
pkill -f pre-event-alerts.js
pkill -f http-server.js

# Watch logs
tail -f telegram-commands.log
tail -f pre-event-alerts.log
tail -f daily-briefing.log
tail -f http-server.log

# Smoke-test storage paths
node scripts/storage-smoke-test.js
```

---

## launchd (macOS daemon mode)

Plist files live in `launchd/`. Shell wrappers in `launchd/run-*.sh`.

```bash
# Install and start all agents
./launchd/install-launchagents.sh

# Stop and uninstall
./launchd/uninstall-launchagents.sh

# Verify running
launchctl list | grep projectkronos

# Check a specific agent
launchctl list com.projectkronos.telegram-commands
```

Agents registered:
- `com.projectkronos.telegram-commands` — KeepAlive
- `com.projectkronos.pre-event-alerts` — StartInterval 60s
- `com.projectkronos.daily-briefing` — runs every 15 min, `--scheduled` self-gates on `BRIEFING_HOUR`
- `com.projectkronos.end-of-day` — runs every 15 min, `--scheduled` self-gates on `WRAPUP_HOUR`
- `com.projectkronos.http-server` — KeepAlive

---

## Pi deployment (systemd)

Pi deploy script: `pi/deploy.sh`. Run once after cloning.

```bash
git clone https://github.com/BagoBones-tldr/Calender_Bot ~/Developer/project-kronos
cd ~/Developer/project-kronos
bash pi/deploy.sh
```

The script installs and enables five systemd units:
- `kronos-telegram.service` — KeepAlive, `Restart=always`
- `kronos-alerts.service` — `bash -c 'while true; do node pre-event-alerts.js; sleep 60; done'`
- `kronos-http.service` — KeepAlive, `Restart=always`
- `kronos-daily.service` + `kronos-daily.timer` — fires every 15 min, `--scheduled` self-gates
- `kronos-eod.service` + `kronos-eod.timer` — fires every 15 min, `--scheduled` self-gates

**Pi-specific `.env` additions:**
```
KRONOS_INSTANCE_NAME=pi
KRONOS_STORAGE_PATH=/home/<user>/.kronos-state
# Leave KRONOS_OBSIDIAN_DIR unset — /note is non-functional without a mounted vault
```

**After a `git pull` on Pi:**
```bash
sudo systemctl restart kronos-telegram kronos-alerts kronos-http
```

**Pi service management:**
```bash
sudo systemctl status kronos-telegram
journalctl -u kronos-telegram -f
systemctl list-timers --all
```

**Notes:**
- `/note` command is non-functional on Pi unless `KRONOS_OBSIDIAN_DIR` points to a mounted vault.
- Weather auto-detection works natively on Pi via `ipapi.co`.
- `ANTHROPIC_KEY` (not `ANTHROPIC_API_KEY`) is what the Pi deploy script checks for — both are accepted at runtime.
- State files default to the repo `state/` dir. Set `KRONOS_STORAGE_PATH` to persist state outside the repo (recommended).

---

## HTTP chat endpoint

`POST http://localhost:3001/chat`
Headers: `X-Kronos-Key: <KRONOS_HTTP_KEY>`, `Content-Type: application/json`
Body: `{ "message": "your message here" }`
Response: `{ "response": "...", "intent": { "command": "...", "args": "..." } }`

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/note.js` | CLI shortcut for `/note` — appends to Obsidian dev journal |
| `scripts/storage-smoke-test.js` | Verifies storage read/write at runtime paths |
| `scripts/update-claude-context.sh` | Regenerates `.claude/context/*.md` — runs on every `git commit` via post-commit hook |
| `scripts/append-kronos-log-entry.sh` | Appends to `KRONOS_LOG.md` — also runs on every `git commit` |
| `scripts/sync-obsidian-note.sh` | Syncs project notes to Obsidian vault |

---

## Auto-generated files (do not edit manually)

- `KRONOS_LOG.md` — appended by post-commit hook
- `.claude/context/state.md` — regenerated by post-commit hook
- `.claude/context/architecture.md` — regenerated by post-commit hook
- `.claude/context/sessions.md` — regenerated by post-commit hook
