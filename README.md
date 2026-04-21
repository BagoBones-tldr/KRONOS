# Project KRONOS

This project is the working Node.js version of Project KRONOS, a personal assistant for calendar briefings, Telegram commands, reactive alerts, Apple Reminders capture, and lightweight personal organization.

Deferred note for future updates:
- If KRONOS ever needs to run outside the logged-in user session, revisit a server-ready deployment or daemon-safe architecture instead of extending the current user-session LaunchAgent model.

## Core scripts

- `daily-clean.js`: Sends the daily schedule briefing to Telegram
- `telegram-commands.js`: Runs the Telegram command listener for schedule, reminder, task, and status commands
- `pre-event-alerts.js`: Checks for upcoming events and sends reminder alerts
- `storage.js`: Centralized JSON/text storage layer for KRONOS runtime state
- `storage-layout.js`: Named storage paths for KRONOS state and future migrations
- `reminder-service.js`: Creates Apple Reminders via CalDAV VTODO collections

## Common commands

Open the project:

```bash
cd /Users/edwards/Developer/project-kronos
```

Preview the daily briefing without sending it:

```bash
DRY_RUN=1 node daily-clean.js
```

Send the daily briefing to Telegram:

```bash
node daily-clean.js
```

Railway/cloud scheduled runs use the local-time gate:

- Railway runs KRONOS hourly
- `daily-clean.js --scheduled` only sends when the configured local briefing hour is reached
- defaults:
  - `BRIEFING_TIMEZONE=America/Chicago`
  - `BRIEFING_HOUR=8`

Start the Telegram command listener:

```bash
node telegram-commands.js
```

Start the Telegram command listener in the background with `nohup`:

```bash
nohup node telegram-commands.js > telegram-commands.log 2>&1 &
```

If the Telegram listener is running in the foreground, stop it with:

```bash
Ctrl + C
```

Check whether the Telegram command listener is running:

```bash
ps aux | grep telegram-commands.js
```

Watch Telegram command listener logs:

```bash
tail -f /Users/edwards/Developer/project-kronos/telegram-commands.log
```

Stop the Telegram command listener:

```bash
pkill -f telegram-commands.js
```

Clean restart for the Telegram command listener:

```bash
pkill -f telegram-commands.js
cd /Users/edwards/Developer/project-kronos
nohup node telegram-commands.js > telegram-commands.log 2>&1 &
```

Bring Project KRONOS back online:

```bash
cd /Users/edwards/Developer/project-kronos
nohup node telegram-commands.js > telegram-commands.log 2>&1 &
nohup sh -c 'cd /Users/edwards/Developer/project-kronos && while true; do node pre-event-alerts.js; sleep 60; done' > pre-event-alerts.log 2>&1 &
```

Preview pre-event alerts without sending them:

```bash
DRY_RUN=1 node pre-event-alerts.js
```

Run pre-event alerts live:

```bash
node pre-event-alerts.js
```

Run pre-event alerts continuously in the foreground:

```bash
while true; do node pre-event-alerts.js; sleep 60; done
```

If the pre-event alert loop is running in the foreground, stop it with:

```bash
Ctrl + C
```

Run pre-event alerts continuously in the background with `nohup`:

```bash
nohup sh -c 'while true; do node pre-event-alerts.js; sleep 60; done' > pre-event-alerts.log 2>&1 &
```

Check whether the pre-event alert loop is running:

```bash
ps aux | grep pre-event-alerts.js
```

Watch pre-event alert logs:

```bash
tail -f /Users/edwards/Developer/project-kronos/pre-event-alerts.log
```

Stop the pre-event alert loop:

```bash
pkill -f pre-event-alerts.js
```

NPM shortcuts:

```bash
npm run commands
npm run alerts
```

## Telegram highlights

KRONOS supports both slash commands and natural phrasing.

Useful examples:

- `/today`, `/tomorrow`, `/events friday`, `/free friday`
- `/add workout tomorrow at 3pm for 1 hour`
- `/remove my 3pm workout tomorrow`
- `/remind submit essay tomorrow at 9am`
- `remind me to call mom in 2 hours`
- `/task finish lab report friday at 11:59pm`
- `/wrapup`

## launchd

Project KRONOS can run through macOS `launchd` instead of `nohup`.

Install and start both LaunchAgents:

```bash
cd /Users/edwards/Developer/project-kronos
./launchd/install-launchagents.sh
```

Unload and remove both LaunchAgents:

```bash
cd /Users/edwards/Developer/project-kronos
./launchd/uninstall-launchagents.sh
```

List KRONOS launch agents:

```bash
launchctl list | grep projectkronos
```

Tail Telegram listener logs:

```bash
tail -f /Users/edwards/Developer/project-kronos/telegram-commands.log
```

Tail pre-event alert logs:

```bash
tail -f /Users/edwards/Developer/project-kronos/pre-event-alerts.log
```

Agent files live in the repo under `launchd/` and get copied into `~/Library/LaunchAgents/` during install.

## Config

Environment variables live in `.env`.

Reference values and required keys are documented in `.env.example`.

Notable config values:

- `DEFAULT_CALENDAR_NAME`: preferred Apple Calendar target for event creation
- `APPLE_REMINDERS_LIST`: preferred Apple Reminders list name for VTODO reminder creation
- `KRONOS_STORAGE_PATH`: root folder for KRONOS state files; change this to redirect runtime storage to a NAS or mounted volume without code changes
- `ALLOW_EDITED_MESSAGES`: set to `1` only if you want KRONOS to respond to edited Telegram messages; default behavior should ignore them
- `BRIEFING_TIMEZONE` / `BRIEFING_HOUR`: local-time daily briefing gate
- `WRAPUP_TIMEZONE` / `WRAPUP_HOUR` / `WRAPUP_MINUTE`: nightly wrap-up schedule

## Storage Layout

KRONOS runtime state is stored through `storage.js` and should be rooted entirely under `KRONOS_STORAGE_PATH`.

Current structured state layout:

- `state/telegram.json`
- `state/conversations.json`
- `state/preferences.json`
- `state/tasks.json`
- `state/alerts.json`
- `state/end-of-day.json`

If `KRONOS_STORAGE_PATH` is unset, KRONOS falls back to the repo directory for local development.

## Container Path

KRONOS now includes a first-pass container deployment path for Raspberry Pi and home-server use:

- `Dockerfile`
- `compose.yml`

Example:

```bash
docker compose up -d --build
```

Quick storage validation:

```bash
npm run storage:test
```

Compose uses:

- `KRONOS_STORAGE_HOST_PATH` for the host-side volume path
- `KRONOS_STORAGE_PATH` for the in-container storage root

That means moving from Pi local disk to a NAS mount should be a volume/config change instead of an app rewrite.

## KRONOS Brain Policy

KRONOS now uses a dedicated AI policy layer in `ai-policy.js`.

The current rule set keeps the brain disciplined:
- deterministic schedule and weather facts remain the source of truth
- AI is used for interpretation, prioritization, and tone
- unsupported claims should be phrased with uncertainty
- invented times, habits, or preferences are not allowed

## KRONOS Log Automation

`KRONOS_LOG.md` now auto-appends a timestamped entry on each local git commit.

What gets recorded:
- commit date and time
- commit summary
- current branch
- staged files included in the commit

Important note:
- this logs at commit time, not on every editor save
- that is intentional, so the log tracks meaningful update milestones instead of every tiny nano edit
