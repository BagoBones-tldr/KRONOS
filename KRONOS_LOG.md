# 🧠 KRONOS Development Log

---

## 📅 2026-04-16

### HTTP Chat Endpoint Added
- Summary: `Added Express HTTP server to KRONOS for direct chat from external clients`
- Branch: `main`
- Files:
  - `http-server.js` (new)
- Notes:
  - New `POST /chat` endpoint accepts `{ message }` and returns `{ response }` using the existing Anthropic + `ai-policy.js` personality layer — KRONOS responds identically to Telegram
  - Port configurable via `HTTP_PORT` env var (default 3001)
  - Auth via `x-kronos-key` header matched against `KRONOS_HTTP_KEY` in `.env` — requests with wrong or missing key rejected with 401
  - Runs alongside Telegram bot independently — neither interferes with the other
  - Groundwork for desktop widget and any future local clients

### KRONOS Desktop Widget (Phase 2)
- Summary: `Built Electron menubar widget with Claude and KRONOS chat modes`
- Repo: `~/Developer/kronos-widget` (separate project)
- Notes:
  - Electron app lives in the macOS menubar as a 🪐 emoji icon — no dock presence
  - `Cmd+Shift+K` global hotkey toggles the widget open/closed from anywhere
  - Two modes switchable via toggle: **Claude** (direct Anthropic API) and **KRONOS** (HTTP endpoint from Phase 1)
  - Claude mode tracks full in-memory conversation history across turns; resets on close
  - KRONOS mode proxies messages through `POST /chat` with `x-kronos-key` auth header
  - Config via `~/Developer/kronos-widget/.env` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `KRONOS_URL`, `KRONOS_KEY`)
  - `launchd` agent (`com.kronoswidget`) installed at `~/Library/LaunchAgents/` — auto-starts on login, `KeepAlive: true`, no manual launch needed

---

## 📅 2026-04-05

- KRONOS System Prompt Overhaul:
  - Built `buildKronosSystemPrompt()` in `ai-policy.js` — a full identity layer covering purpose, voice, emoji palette, signature phrases, source-of-truth hierarchy, guardrails, and format rules
  - Wired it into `requestAnthropicText()` via the Anthropic `system:` parameter (previously crammed into the user message)
  - Cleaned up `buildBriefingPrompt`, `buildFocusPrompt`, and `buildConversationPrompt` — each now carries only task-specific instructions; identity and guardrails no longer duplicated across all three
  - Personality (voice, phrases, emoji palette) now applies consistently to briefings and focus cues, not just conversation

- Fixed Syntax Error (Curly Quotes):
  - Write tool introduced Unicode smart quotes as JS string delimiters — caused `SyntaxError: Invalid or unexpected token` at startup
  - Stripped all curly single quotes (`\u2018`/`\u2019`) from `ai-service.js` and replaced with ASCII straight quotes

- Instant Response Architecture:
  - Switched `telegram-commands.js` from run-and-exit to a persistent long-polling loop (`getUpdates` with `timeout: 25`)
  - Telegram now delivers messages to KRONOS in milliseconds instead of up to 2 seconds
  - Added `sendChatAction('typing')` — fires immediately on message receipt so the user sees KRONOS is working before the AI call completes
  - Updated `launchd/com.projectkronos.telegram-commands.plist`: replaced `StartInterval: 2` with `KeepAlive: true` to match the new persistent process model

---

## 📅 Today

- Validated the Local vs Cloud split:
  - Railway is reliably handling the morning briefing
  - Local `launchd` is still the primary command/interaction layer

- Fixed Morning Delivery Timing:
  - Replaced fixed UTC cron assumptions with a timezone-aware scheduled gate
  - `daily-clean.js --scheduled` now checks:
    - `BRIEFING_TIMEZONE`
    - `BRIEFING_HOUR`
  - Railway cron now runs hourly and KRONOS decides when it is truly 8:00 AM locally

- Synced Cloud + Local Code More Cleanly:
  - Pushed the current KRONOS codebase to GitHub
  - Redeployed Railway successfully
  - Added a visible cloud build marker to the morning briefing for deployment verification

- Added More Transparency:
  - `/log` now returns a read-only development summary for users
  - `/status` now reports the environment source label so KRONOS can identify where a response came from

- Strengthened Conversational Routing:
  - Tightened natural-language handling for `today` and `tomorrow`
  - Casual conversation like `I am tired today` now stays conversational
  - Deliberate planning prompts like `what's today look like` still route into schedule mode

- Added a Real Task System:
  - KRONOS now stores tasks separately from calendar events
  - Added task commands for adding, listing, completing, and removing tasks
  - Assignment-style phrases now support class names and exact due times
  - Added an Obsidian quick-glance task board for easy viewing

- Added End-of-Day Summaries:
  - `/wrapup` now gives a proper end-of-day closeout
  - Wrap-ups include completed tasks, open tasks, and what is due tomorrow
  - Added a nightly `launchd` worker so KRONOS can send wrap-ups automatically

- Tightened Event Recall + Command Routing:
  - Natural event questions like `show me my tuesday` and `what do i have tomorrow` now resolve to the right date
  - `/events` is now date-aware instead of always defaulting to today
  - Cleaned up slash-command parsing so `/add`, `/remove`, `/task`, `/done`, and `/untask` handle their arguments more reliably
  - Assignment-style task phrases now stay in the task system instead of getting mistaken for calendar events

- Brain Milestone:
  - Wired Anthropic into KRONOS as the first reasoning layer
  - Added `ai-service.js`
  - Daily briefing now supports AI-generated interpretation with deterministic fallback
  - `/focus` now supports an AI-generated focus cue
  - Added a direct Anthropic smoke test to verify the brain independently of Calendar/weather connectivity
  - Confirmed the Anthropic brain is live and working

- Moved KRONOS from:
  - `~/Documents/Playground/caldav-test`
  ➜ to:
  - `~/Developer/project-kronos`

- Reason:
  - `launchd` could not run properly from protected Documents directory

- Updated Execution Model:
  - Switched from `nohup` ➜ `launchd` (LaunchAgents)
  - KRONOS now runs from `~/Developer`
  - Managed by macOS natively

- Telegram Expansion:
  Added commands:
  - `/help`
  - `/next`
  - `/events`
  - `/weather`
  - `/conflicts`
  - `/status`
  - `/busy`
  - `/week`
  - `/whenis <keyword>`
  - `/focus`

- Fixes:
  - HTML parsing issues (`/help`, `/whenis`)
  - Edited message handling
  - Faster polling (5s interval)

- Notes:
  - Future plan to move to server-based architecture (away from logged-in user model)

---

## 🕰️ Earlier Sessions

- Started with:
  - Apple Calendar + 8:00 AM Telegram notification

- Progression:
  - Extracted repo from Docker
  - Moved to local Mac environment
  - Removed hardcoded credentials (security improvement)

- Refactor (V2 Structure):
  - `calendar-service.js`
  - `schedule-analysis.js`
  - `briefing-service.js`
  - shared Telegram layer

- Features Added:
  - Weather integration
  - Telegram command system
  - Recurring event fixes
  - Pre-event reminders (Phase 2)

- Infrastructure:
  - README documentation
  - Project renamed -> KRONOS
  - Background execution:
    - `nohup` -> replaced by `launchd`

---

## 🚀 Current KRONOS State

- Apple Calendar integration
- Daily Telegram briefing
- Weather support
- Telegram command system
- Pre-event reminder alerts
- Conflict detection
- Free/busy time analysis
- Read-only development log access through `/log`
- Anthropic reasoning layer for briefings and focus cues
- `launchd`-managed background execution
- Clean repo + maintainable structure

✅ Active Repo:
`~/Developer/project-kronos`

❌ Deprecated:
`~/Documents/Playground/caldav-test`

---

## 🔮 Where It’s Headed

- Current:
  - Hybrid assistant system
  - Deterministic schedule engine + Anthropic reasoning layer

- Future Vision:
  - Expand the brain beyond briefings/focus
  - Conversational + proactive behavior
  - Personalization engine

- Key Insight:
  - Core infrastructure is now supporting first-generation AI integration successfully

---

## 🤖 Automated Updates
### 2026-04-01 01:50:59 AM CDT
- Summary: `Enable KRONOS log automation`
- Branch: `main`
- Files:
  - `(no staged files detected)`

### 2026-04-01 11:39:29 PM CDT
- Summary: `Sync KRONOS cloud deploy and add cloud check marker`
- Branch: `main`
- Files:
  - `.env.example`
  - `.githooks/commit-msg`
  - `.gitignore`
  - `KRONOS_LOG.md`
  - `README.md`
  - `alert-service.js`
  - `briefing-service.js`
  - `caldav-client.js`
  - `calendar-service.js`
  - `calendar.js`
  - `command-service.js`
  - `daily-clean.js`
  - `daily.js`
  - `env.js`
  - `getchatid.js`
  - `launchd/com.projectkronos.pre-event-alerts.plist`
  - `launchd/com.projectkronos.telegram-commands.plist`
  - `launchd/install-launchagents.sh`
  - `launchd/run-pre-event-alerts.sh`
  - `launchd/run-telegram-commands.sh`
  - `launchd/uninstall-launchagents.sh`
  - `package.json`
  - `pre-event-alerts.js`
  - `schedule-analysis.js`
  - `scripts/append-kronos-log-entry.sh`
  - `telegram-commands.js`
  - `telegram-service.js`
  - `telegram-state.js`
  - `weather-service.js`

### 2026-04-02 12:53:57 AM CDT
- Summary: `Update KRONOS commands and cloud sync marker`
- Branch: `main`
- Files:
  - `KRONOS Mac GitHub pass`
  - `KRONOS Mac GitHub pass.pub`
  - `KRONOS_LOG.md`
  - `exit`
  - `exit.pub`
  - `test.js`
  - `test.js.pub`

### 2026-04-02 01:03:00 AM CDT
- Summary: `Update KRONOS commands and cloud sync marker`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`

### 2026-04-02 01:06:32 AM CDT
- Summary: `Update KRONOS commands and cloud sync marker`
- Branch: `main`
- Files:
  - `.gitignore`
  - `KRONOS_LOG.md`

### 2026-04-02 01:11:18 AM CDT
- Summary: `Finalize KRONOS cleanup before rebase`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`

### 2026-04-02 01:31:22 AM CDT
- Summary: `Make KRONOS morning briefing timezone-aware`
- Branch: `main`
- Files:
  - `.env.example`
  - `README.md`
  - `daily-clean.js`
  - `package.json`
  - `railway.toml`

### 2026-04-02 10:08:21 AM CDT
- Summary: `Activated Anthropic brain layer and verified live AI path`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `.env.example`
  - `ai-service.js`
  - `ai-smoke-test.js`
  - `briefing-service.js`
  - `command-service.js`
  - `daily-clean.js`

### 2026-04-02 12:35:00 PM CDT
- Summary: `Expanded natural language scheduling and event creation flows`
- Branch: `main`
- Files:
  - `.env.example`
  - `calendar-write-service.js`
  - `command-service.js`
  - `schedule-analysis.js`
  - `telegram-commands.js`

### 2026-04-02 01:10:00 PM CDT
- Summary: `Strengthened KRONOS guardrails and conversational policy`
- Branch: `main`
- Files:
  - `README.md`
  - `ai-policy.js`
  - `ai-service.js`
  - `command-service.js`

### 2026-04-02 02:25:00 PM CDT
- Summary: `Added witty voice, emoji styling, boss nickname, and conversation continuity`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `ai-service.js`
  - `command-service.js`
  - `conversation-state.js`
  - `telegram-commands.js`

### 2026-04-04 11:55:00 PM CDT
- Summary: `Expanded KRONOS conversation routing, saved preferences, and conversational prowess`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `ai-policy.js`
  - `ai-service.js`
  - `calendar-service.js`
  - `calendar-write-service.js`
  - `command-service.js`
  - `preference-state.js`
  - `telegram-commands.js`
- Notes:
  - Strengthened follow-up routing so KRONOS handles short contextual replies like "same for tomorrow" more naturally.
  - Added saved preference memory with `/remember` and `/preferences`, plus natural phrases for storing explicit user preferences.
  - Expanded removal support for calendar events with recurring-event protection so repeating series are not touched automatically.
  - Sharpened conversational personality with signature phrases, emoji habits, compliment handling, and more confident back-and-forth behavior.

### 2026-04-04 11:59:00 PM CDT
- Summary: `Stopped casual today/tomorrow mentions from hijacking into full schedule summaries`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `command-service.js`
- Notes:
  - Tightened the natural-language matcher so KRONOS only triggers `/today` or `/tomorrow` for actual planning-style prompts.
  - Confirmed a dry run where `what's today look like` still routes to schedule mode while casual messages mentioning `today` stay conversational.

### 2026-04-06 10:58:00 PM CDT
- Summary: `Added task management, assignment tracking, Obsidian task board, and nightly wrap-ups`
- Branch: `main`
- Files:
  - `.gitignore`
  - `.env.example`
  - `KRONOS_LOG.md`
  - `ai-service.js`
  - `briefing-service.js`
  - `command-service.js`
  - `end-of-day.js`
  - `launchd/com.projectkronos.end-of-day.plist`
  - `launchd/install-launchagents.sh`
  - `launchd/run-end-of-day.sh`
  - `launchd/uninstall-launchagents.sh`
  - `scripts/sync-obsidian-note.sh`
  - `task-state.js`
- Notes:
  - Added a dedicated task system with `/tasks`, `/task`, `/done`, and `/untask`, separate from Apple Calendar.
  - Expanded task phrasing to support assignments with class names and exact due times like "add this assignment essay 2 for psych due friday at 11:59pm".
  - Added an Obsidian `KRONOS Tasks.md` board grouped by due today, due tomorrow, upcoming, and no due date.
  - Added `/wrapup` plus a nightly scheduled wrap-up worker so KRONOS can close the day out automatically.

### 2026-04-06 11:22:00 PM CDT
- Summary: `Patched event recall phrasing and ran a broad command-surface dry run`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `command-service.js`
- Notes:
  - Made `/events` date-aware so natural questions like "show me my tuesday" and "what do i have tomorrow" route to the correct day.
  - Fixed command argument parsing for slash commands so `/add`, `/remove`, `/task`, `/done`, and `/untask` read their input more consistently.
  - Prevented assignment-style task phrases from being mistaken for calendar-event creation.
  - Ran a broad dry run across the command surface to catch routing and phrasing hiccups before they showed up live.

### 2026-04-09 — Storage Architecture Hardened
- Summary: `Structured persistent storage paths and eliminated all hardcoded paths`
- Branch: `main`
- Files:
  - `storage-layout.js`
  - `runtime-paths.js`
- Notes:
  - All persistent state now lives under `KRONOS_STORAGE_PATH` env var — single env var change handles Pi or NAS cutover.
  - `storage-layout.js` defines all structured path definitions in one place.
  - `runtime-paths.js` eliminates every hardcoded path from the codebase.
  - `npm run storage:test` smoke test passing.

### 2026-04-09 — Conversation History Corruption Fixed (Bug 1)
- Summary: `Fixed fake user message injection and system prompt leakage in conversation history`
- Branch: `main`
- Files:
  - `ai-service.js`
  - `conversation-state.js`
  - `ai-policy.js`
- Notes:
  - Root cause: conversation history was being passed as a text block with `User:` / `KRONOS:` labels inside a single message. Claude interpreted the pattern as something to continue and injected fake user lines.
  - Fix: conversation history now passed as proper role-tagged message objects (`role: user` / `role: assistant`).
  - System prompt is correctly passed as the `system` parameter — never inside the messages array.
  - Corrupted history state cleared.
  - Added explicit AI policy rule: never generate, predict, or simulate user messages.
  - Rewrote "Complete every thought" rule to unambiguously mean KRONOS's own sentences only.

### 2026-04-09 — Apple Reminders Integration Fixed (Bug 2)
- Summary: `Built working reminder creation, polling, Telegram ping, and CalDAV mark-complete loop`
- Branch: `main`
- Files:
  - `reminder-service.js`
  - `reminder-alerts.js`
  - `command-service.js`
  - `ai-policy.js`
  - `storage-layout.js`
- Notes:
  - Root cause: iCloud CalDAV rejects all `calendar-query` REPORT requests for VTODO collections — `fetchCalendarObjects` with any comp-filter returns HTTP 500.
  - Fix: switched to PROPFIND (depth:1) to list object hrefs, then `calendar-multiget` to fetch ICS data. This bypasses the broken query path entirely.
  - `reminder-alerts.js` polling loop added — runs every 60 seconds, fetches due VTODOs, sends Telegram ping, marks COMPLETED via CalDAV PUT.
  - Dedup state persisted to `state/reminders.json` with 7-day TTL so fired reminders don't repeat.
  - `markReminderCompleted` now runs before the Telegram ping and before writing fired state — if CalDAV update fails, the reminder stays eligible to fire again next cycle.
  - Expanded `parseReminderRequest` to handle natural phrasings: "set a reminder to X in Y minutes", "set a X reminder for Y minutes from now", and time ranges like "1-2 minutes" (takes first number).
  - Added AI policy rule: KRONOS must never say it has set a reminder or will ping the user — only the command handler can do that; if parsing fails, KRONOS guides the user to the correct syntax instead of hallucinating a confirmation.
  - Null UID guard added — reminders without a UID are skipped to prevent dedup key collisions.

### 2026-04-11 — Bug Sweep and Hardening
- Summary: `Patched six bugs found in a full codebase sweep before Pi deployment`
- Branch: `main`
- Files:
  - `reminder-alerts.js`
  - `reminder-service.js`
  - `telegram-service.js`
  - `caldav-client.js`
  - `storage-layout.js`
  - `command-service.js`
  - `calendar-service.js`
- Notes:
  - **reminder-alerts.js**: CalDAV mark-complete now runs before Telegram send and before writing fired state — if marking fails, reminder stays eligible to fire next poll instead of being silently lost.
  - **reminder-service.js**: Added `vtodo.uid` null guard in `fetchDueReminders` so uid-less VTODOs can't collapse dedup keys.
  - **telegram-service.js**: Added array guard on `getUpdates` return value — if Telegram returns a non-array result, returns `[]` instead of crashing the polling loop.
  - **caldav-client.js**: iCloud CalDAV server URL is now configurable via `CALDAV_SERVER_URL` env var with iCloud as default — required for Pi/NAS portability.
  - **storage-layout.js**: Added `reminderState` to `LEGACY_STORAGE_PATHS` so upgrades from older installs find existing reminder state.
  - **command-service.js**: Errors now log the full error object (not just `.message`) for better stack traces.
  - **calendar-service.js**: Events dropped for invalid start dates are now logged with their title instead of silently disappearing.
### 2026-04-20 09:31:40 PM CDT
- Summary: `Add Claude AI conversation integration and full KRONOS feature set`
- Branch: `main`
- Files:
  - `.dockerignore`
  - `.env.example`
  - `.githooks/commit-msg`
  - `.gitignore`
  - `Dockerfile`
  - `KRONOS_LOG.md`
  - `KRONOS_RECOVERY.md`
  - `RASPBERRY_PI_UPLOAD_INSTRUCTIONS.md`
  - `README.md`
  - `ai-policy.js`
  - `ai-service.js`
  - `ai-smoke-test.js`
  - `alert-service.js`
  - `briefing-service.js`
  - `caldav-client.js`
  - `calendar-service.js`
  - `calendar-write-service.js`
  - `command-service.js`
  - `compose.yml`
  - `conversation-state.js`
  - `daily-clean.js`
  - `debug-reminders.js`
  - `end-of-day.js`
  - `http-server.js`
  - `launchd/com.projectkronos.daily-briefing.plist`
  - `launchd/com.projectkronos.end-of-day.plist`
  - `launchd/com.projectkronos.pre-event-alerts.plist`
  - `launchd/com.projectkronos.telegram-commands.plist`
  - `launchd/install-launchagents.sh`
  - `launchd/run-daily-briefing.sh`
  - `launchd/run-end-of-day.sh`
  - `launchd/run-pre-event-alerts.sh`
  - `launchd/run-telegram-commands.sh`
  - `launchd/uninstall-launchagents.sh`
  - `log-service.js`
  - `package-lock.json`
  - `package.json`
  - `preference-state.js`
  - `reminder-alerts.js`
  - `reminder-service.js`
  - `runtime-paths.js`
  - `schedule-analysis.js`
  - `scripts/append-kronos-log-entry.sh`
  - `scripts/storage-smoke-test.js`
  - `scripts/sync-obsidian-note.sh`
  - `storage-layout.js`
  - `storage.js`
  - `task-state.js`
  - `telegram-commands.js`
  - `telegram-service.js`
  - `telegram-state.js`

### 2026-04-20 09:31:46 PM CDT
- Summary: `Add Claude AI conversation integration and full KRONOS feature set`
- Branch: `main`
- Files:
  - `.dockerignore`
  - `.env.example`
  - `.githooks/commit-msg`
  - `.gitignore`
  - `Dockerfile`
  - `KRONOS_LOG.md`
  - `KRONOS_RECOVERY.md`
  - `RASPBERRY_PI_UPLOAD_INSTRUCTIONS.md`
  - `README.md`
  - `ai-policy.js`
  - `ai-service.js`
  - `ai-smoke-test.js`
  - `alert-service.js`
  - `briefing-service.js`
  - `caldav-client.js`
  - `calendar-service.js`
  - `calendar-write-service.js`
  - `command-service.js`
  - `compose.yml`
  - `conversation-state.js`
  - `daily-clean.js`
  - `debug-reminders.js`
  - `end-of-day.js`
  - `http-server.js`
  - `launchd/com.projectkronos.daily-briefing.plist`
  - `launchd/com.projectkronos.end-of-day.plist`
  - `launchd/com.projectkronos.pre-event-alerts.plist`
  - `launchd/com.projectkronos.telegram-commands.plist`
  - `launchd/install-launchagents.sh`
  - `launchd/run-daily-briefing.sh`
  - `launchd/run-end-of-day.sh`
  - `launchd/run-pre-event-alerts.sh`
  - `launchd/run-telegram-commands.sh`
  - `launchd/uninstall-launchagents.sh`
  - `log-service.js`
  - `package-lock.json`
  - `package.json`
  - `preference-state.js`
  - `reminder-alerts.js`
  - `reminder-service.js`
  - `runtime-paths.js`
  - `schedule-analysis.js`
  - `scripts/append-kronos-log-entry.sh`
  - `scripts/storage-smoke-test.js`
  - `scripts/sync-obsidian-note.sh`
  - `storage-layout.js`
  - `storage.js`
  - `task-state.js`
  - `telegram-commands.js`
  - `telegram-service.js`
  - `telegram-state.js`

### 2026-04-20 09:50:23 PM CDT
- Summary: `checkpoint`
- Branch: `main`
- Files:
  - `.claude/worktrees/funny-antonelli`
  - `.claude/worktrees/sad-dijkstra`
  - `KRONOS_LOG.md`
  - `node_modules/.package-lock.json`
  - `scripts/sync-obsidian-note.sh`
  - `state/alerts.json`
  - `state/conversations.json`
  - `state/end-of-day.json`
  - `state/reminders.json`
  - `state/storage-smoke-test.json`
  - `state/telegram.json`

### 2026-04-20 09:52:48 PM CDT
- Summary: `remove claude worktrees and state from repo`
- Branch: `main`
- Files:
  - `.gitignore`
  - `KRONOS_LOG.md`

### 2026-04-20 10:39:02 PM CDT
- Summary: `checkpoint`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`

### 2026-04-20 10:45:17 PM CDT
- Summary: `checkpoint`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`

### 2026-04-21 05:01:25 PM CDT
- Summary: `checkpoint`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`

### 2026-04-23 12:08:39 PM CDT
- Summary: `Add IP geolocation, Obsidian notes, merge reminder loop, bug sweep, simplify Obsidian format`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `ai-service.js`
  - `command-service.js`
  - `end-of-day.js`
  - `obsidian-service.js`
  - `package.json`
  - `pre-event-alerts.js`
  - `reminder-alerts.js`
  - `scripts/note.js`
  - `scripts/sync-obsidian-note.sh`
  - `weather-service.js`

### 2026-04-23 01:04:47 PM CDT
- Summary: `Add Claude context folder auto-updated on every commit`
- Branch: `main`
- Files:
  - `.githooks/commit-msg`
  - `KRONOS_LOG.md`
  - `scripts/update-claude-context.sh`

### 2026-04-23 02:19:35 PM CDT
- Summary: `Add Pi deploy script with systemd service generation`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `pi/deploy.sh`

### 2026-04-23 02:24:51 PM CDT
- Summary: `Add http-server to launchd and Pi deploy script`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `launchd/com.projectkronos.http-server.plist`
  - `launchd/install-launchagents.sh`
  - `launchd/run-http-server.sh`
  - `launchd/uninstall-launchagents.sh`
  - `pi/deploy.sh`

### 2026-04-23 02:48:21 PM CDT
- Summary: `DRY fixes and stale reference cleanup`
- Branch: `main`
- Files:
  - `.env.example`
  - `KRONOS_LOG.md`
  - `KRONOS_RECOVERY.md`
  - `ai-service.js`
  - `command-service.js`
  - `obsidian-service.js`

### 2026-04-24 04:22:11 PM CDT
- Summary: `Expand KRONOS personality, phrasing diversity, and intent inference`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `ai-policy.js`
  - `command-service.js`

### 2026-04-24 07:56:36 PM CDT
- Summary: `checkpoint`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`

### 2026-04-29 04:52:57 PM CDT
- Summary: `Fix syntax error, alert staleness, and reminder routing`
- Branch: `main`
- Files:
  - `command-service.js`
  - `obsidian-service.js`
  - `reminder-service.js`

### 2026-04-30 10:55:23 AM CDT
- Summary: `Expand natural language event creation coverage`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `command-service.js`

### 2026-05-01 03:54:01 PM CDT
- Summary: `checkpoint`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `command-service.js`

### 2026-05-01 04:03:52 PM CDT
- Summary: `checkpoint`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `pi/deploy.sh`

### 2026-05-03 11:07:59 PM CDT
- Summary: `Fix daily briefing never firing due to StartInterval timing mismatch`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `daily-clean.js`
  - `launchd/com.projectkronos.daily-briefing.plist`

### 2026-05-04 09:08:44 AM CDT
- Summary: `Build conversation depth, AI intent routing, policy hardening, and usage tracking`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `ai-policy.js`
  - `ai-service.js`
  - `command-service.js`
  - `conversation-state.js`
  - `storage-layout.js`
  - `telegram-commands.js`
  - `usage-stats.js`

### 2026-05-04 03:26:28 PM CDT
- Summary: `Fix date-relative NL queries routing to conversational instead of /events`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `command-service.js`

### 2026-05-04 03:27:29 PM CDT
- Summary: `checkpoint`
- Branch: `main`
- Files:
  - `CLAUDE.md`
  - `KRONOS_LOG.md`

### 2026-05-04 03:41:03 PM CDT
- Summary: `Add post-write verification for calendar event creation`
- Branch: `main`
- Files:
  - `KRONOS_LOG.md`
  - `calendar-write-service.js`
  - `command-service.js`

