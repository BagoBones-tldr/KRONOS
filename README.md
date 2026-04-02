# Project KRONOS

This project is the working Node.js version of Project KRONOS, a personal assistant for calendar briefings, Telegram commands, and reactive alerts.

Deferred note for future updates:
- If KRONOS ever needs to run outside the logged-in user session, revisit a server-ready deployment or daemon-safe architecture instead of extending the current user-session LaunchAgent model.

## Core scripts

- `daily-clean.js`: Sends the daily schedule briefing to Telegram
- `telegram-commands.js`: Runs the Telegram command listener for `/today`, `/tomorrow`, `/next`, `/events`, `/free`, `/busy`, `/weather`, `/week`, `/whenis`, `/conflicts`, `/status`, and `/help`
- `pre-event-alerts.js`: Checks for upcoming events and sends reminder alerts

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
