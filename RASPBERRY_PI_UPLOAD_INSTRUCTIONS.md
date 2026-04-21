# Raspberry Pi Upload Instructions

This guide is for moving Project KRONOS from the Mac-based setup onto a Raspberry Pi using the encrypted USB backup.

## What Transfers Cleanly

- The KRONOS codebase
- The KRONOS log/history
- The recovery documentation
- The `.env` file inside the encrypted archive

## What Does Not Transfer Directly

- macOS `launchd` services
- macOS shell alias behavior
- Any Mac-only operational assumptions

On Raspberry Pi, KRONOS should be run with a Linux-native service manager such as `systemd`, `tmux`, or Docker.

## Prerequisites

- Raspberry Pi with Raspberry Pi OS or another Debian-based Linux distro
- Internet access on the Pi
- The KRONOS USB backup drive
- The backup passphrase for the encrypted archive

## Step 1: Mount and Inspect the USB

Plug the USB drive into the Pi and find the mount path:

```bash
ls /media/$USER
```

or:

```bash
ls /mnt
```

Find the `KRONOS_BACKUPS` folder on the drive.

## Step 2: Copy the Backup Locally

Example:

```bash
mkdir -p ~/kronos-restore
cp /media/$USER/USB_DISK/KRONOS_BACKUPS/project-kronos-backup-2026-04-04.tar.gz.enc ~/kronos-restore/
cp /media/$USER/USB_DISK/KRONOS_BACKUPS/project-kronos-backup-2026-04-04.tar.gz.enc.sha256 ~/kronos-restore/
```

Adjust the mount path if needed.

## Step 3: Verify the Archive

```bash
cd ~/kronos-restore
shasum -a 256 -c project-kronos-backup-2026-04-04.tar.gz.enc.sha256
```

You want to see `OK`.

## Step 4: Decrypt the Archive

```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in project-kronos-backup-2026-04-04.tar.gz.enc \
  -out project-kronos-backup-2026-04-04.tar.gz
```

Enter the backup passphrase when prompted.

## Step 5: Extract the Project

```bash
tar -xzf project-kronos-backup-2026-04-04.tar.gz
```

This should create:

```bash
~/kronos-restore/project-kronos
```

## Step 6: Move KRONOS Into Place

Example:

```bash
mkdir -p ~/Developer
mv ~/kronos-restore/project-kronos ~/Developer/project-kronos
cd ~/Developer/project-kronos
```

## Step 7: Install System Dependencies

Update the Pi:

```bash
sudo apt update && sudo apt upgrade -y
```

Install Node.js and useful tools. One simple route:

```bash
sudo apt install -y nodejs npm tmux
```

If you want a newer Node version later, you can switch to NodeSource or `nvm`.

## Step 8: Install KRONOS Dependencies

From the project directory:

```bash
npm install
```

## Step 9: Review the Environment File

KRONOS’s `.env` should already be included inside the encrypted archive, but review it carefully on the Pi:

```bash
nano .env
```

Things to confirm:

- `APPLE_ID`
- `APPLE_PASS`
- `TELEGRAM_TOKEN`
- `TELEGRAM_CHAT_ID`
- `WEATHER_LATITUDE`
- `WEATHER_LONGITUDE`
- `WEATHER_TIMEZONE`
- `BRIEFING_TIMEZONE`
- `BRIEFING_HOUR`
- `ANTHROPIC_KEY` or `ANTHROPIC_API_KEY`
- `DEFAULT_CALENDAR_NAME`
- `KRONOS_INSTANCE_NAME`

Recommended Pi-specific setting:

```env
KRONOS_INSTANCE_NAME=Raspberry Pi
```

## Step 10: Test KRONOS Manually

Test the morning briefing path without sending:

```bash
DRY_RUN=1 node daily-clean.js
```

Test Telegram command polling manually:

```bash
node telegram-commands.js
```

Test pre-event alerts manually:

```bash
DRY_RUN=1 node pre-event-alerts.js
```

Test the brain directly:

```bash
node ai-smoke-test.js
```

## Step 11: Choose How KRONOS Should Stay Running

### Option A: `tmux`

Simple and good for early testing:

```bash
tmux
node telegram-commands.js
```

Open another `tmux` window for alerts:

```bash
while true; do node pre-event-alerts.js; sleep 60; done
```

Detach:

```bash
Ctrl-b d
```

Reattach later:

```bash
tmux a
```

### Option B: `systemd`

Best long-term Linux-native path. `systemd` is the Linux equivalent of macOS `launchd` — same concept, different format.

| macOS | Linux (Pi) |
|-------|------------|
| `.plist` XML files | `.service` unit files |
| `launchctl load` | `systemctl enable` |
| `launchctl start` | `systemctl start` |
| `~/Library/LaunchAgents/` | `/etc/systemd/system/` |
| `install-launchagents.sh` | `systemctl daemon-reload` |

The `.plist` files in `launchd/` do not work on Linux — `launchctl` is macOS-only and does not exist on the Pi. Use the service files below instead.

#### Get the node binary path first

```bash
which node
# e.g. /home/pi/.nvm/versions/node/v20.19.0/bin/node
```

#### Create `/etc/systemd/system/kronos-telegram.service`

```ini
[Unit]
Description=KRONOS Telegram Commands
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Developer/project-kronos
EnvironmentFile=/home/pi/Developer/project-kronos/.env
ExecStart=/home/pi/.nvm/versions/node/v20.x.x/bin/node telegram-commands.js
Restart=always
RestartSec=5
StandardOutput=append:/home/pi/Developer/project-kronos/telegram-commands.log
StandardError=append:/home/pi/Developer/project-kronos/telegram-commands.log

[Install]
WantedBy=multi-user.target
```

#### Create `/etc/systemd/system/kronos-alerts.service`

```ini
[Unit]
Description=KRONOS Pre-Event Alerts
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Developer/project-kronos
EnvironmentFile=/home/pi/Developer/project-kronos/.env
ExecStart=/bin/bash -c 'while true; do node pre-event-alerts.js; sleep 60; done'
Restart=always
RestartSec=5
StandardOutput=append:/home/pi/Developer/project-kronos/pre-event-alerts.log
StandardError=append:/home/pi/Developer/project-kronos/pre-event-alerts.log

[Install]
WantedBy=multi-user.target
```

> Replace the node path in `ExecStart` with the actual output of `which node`.

#### Enable and start both services

```bash
sudo systemctl daemon-reload
sudo systemctl enable kronos-telegram kronos-alerts
sudo systemctl start kronos-telegram kronos-alerts
sudo systemctl status kronos-telegram kronos-alerts
```

#### Useful systemd commands

```bash
sudo systemctl stop kronos-telegram        # stop a service
sudo systemctl restart kronos-telegram     # restart a service
sudo systemctl disable kronos-telegram     # prevent autostart on boot
journalctl -u kronos-telegram -f           # follow logs via journald
```

### Option C: Docker

Best if you want cleaner containerized deployment later, but not required for first setup.

## Recommended First Pi Rollout

For the first Raspberry Pi deployment:

1. restore the repo from USB
2. run manual tests
3. use `tmux` first
4. once stable, convert to `systemd`

That keeps the first deployment simpler and easier to debug.

## Important Notes

- Do not copy the Mac `launchd` files onto Linux expecting them to run.
- Rotate any secrets if they were ever exposed in logs or chat.
- If Telegram commands respond from more than one machine, make sure only one poller is active at a time.
- If you keep Railway for morning briefings, decide clearly which environment owns which responsibilities.

## Suggested Ownership Model On Pi

- Raspberry Pi:
  - Telegram commands
  - pre-event alerts
  - optional daily briefing
- Railway:
  - optional backup/cloud morning briefing only

Avoid running multiple Telegram pollers against the same bot unless intentionally coordinated.

## Future Upgrade Path

Once KRONOS is stable on the Pi, the next improvements would be:

- move from `tmux` to `systemd`
- add a Pi-specific backup routine
- centralize logs
- decide whether Railway is still needed
- eventually make KRONOS a more permanent always-on assistant host
