#!/bin/bash
# Pi deployment script for Project KRONOS.
# Run this once after cloning the repo on the Pi:
#   git clone https://github.com/BagoBones-tldr/Calender_Bot ~/Developer/project-kronos
#   cd ~/Developer/project-kronos
#   bash pi/deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER="$(whoami)"
NODE="$(which node 2>/dev/null || true)"
SERVICE_DIR="/etc/systemd/system"

# ── Text formatting ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
die()  { echo -e "${RED}✗${NC} $1"; exit 1; }
step() { echo -e "\n${YELLOW}▶${NC} $1"; }

echo ""
echo "  Project KRONOS — Pi Deployment"
echo "  Repo: $ROOT"
echo "  User: $USER"
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
step "Checking Node.js"

if [[ -z "$NODE" ]]; then
  die "Node.js not found. Install it first:\n  sudo apt update && sudo apt install -y nodejs npm"
fi

NODE_VERSION="$($NODE --version)"
ok "Node.js found: $NODE_VERSION ($NODE)"

# ── 2. Install dependencies ───────────────────────────────────────────────────
step "Installing npm dependencies"
cd "$ROOT"
npm install
ok "Dependencies installed"

# ── 3. Check .env ─────────────────────────────────────────────────────────────
step "Checking .env"

if [[ ! -f "$ROOT/.env" ]]; then
  die ".env not found. Create it from Bitwarden 'KRONOS Pi .env' before running this script."
fi

REQUIRED_VARS=(APPLE_ID APPLE_PASS TELEGRAM_TOKEN TELEGRAM_CHAT_ID ANTHROPIC_KEY)
MISSING=()

for var in "${REQUIRED_VARS[@]}"; do
  if ! grep -q "^${var}=" "$ROOT/.env" 2>/dev/null; then
    MISSING+=("$var")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  die "Missing required .env variables: ${MISSING[*]}"
fi

ok ".env present and required variables found"

# Check for stale weather coords and warn
if grep -q "^WEATHER_LATITUDE=" "$ROOT/.env" 2>/dev/null; then
  warn "WEATHER_LATITUDE found in .env — this is no longer needed. Weather is now auto-detected. You can remove it."
fi

# ── 4. Write systemd service files ────────────────────────────────────────────
step "Writing systemd service files"

# kronos-telegram.service
# This keeps telegram-commands.js running permanently.
# Restart=always means systemd will relaunch it if it crashes.
# EnvironmentFile loads your .env so the process has access to all secrets.
sudo tee "$SERVICE_DIR/kronos-telegram.service" > /dev/null <<EOF
[Unit]
Description=KRONOS Telegram Commands
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$ROOT
EnvironmentFile=$ROOT/.env
ExecStart=$NODE $ROOT/telegram-commands.js
Restart=always
RestartSec=5
StandardOutput=append:$ROOT/telegram-commands.log
StandardError=append:$ROOT/telegram-commands.log

[Install]
WantedBy=multi-user.target
EOF

ok "Written: kronos-telegram.service"

# kronos-alerts.service
# pre-event-alerts.js is a one-shot script — it runs, checks for alerts, then exits.
# We loop it with a 60-second sleep between runs so it behaves like the Mac launchd
# StartInterval=60 setup. The outer bash -c loop is what keeps it cycling.
sudo tee "$SERVICE_DIR/kronos-alerts.service" > /dev/null <<EOF
[Unit]
Description=KRONOS Pre-Event and Reminder Alerts
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$ROOT
EnvironmentFile=$ROOT/.env
ExecStart=/bin/bash -c 'while true; do $NODE $ROOT/pre-event-alerts.js; sleep 60; done'
Restart=always
RestartSec=5
StandardOutput=append:$ROOT/pre-event-alerts.log
StandardError=append:$ROOT/pre-event-alerts.log

[Install]
WantedBy=multi-user.target
EOF

ok "Written: kronos-alerts.service"

# kronos-daily.service + timer
# daily-clean.js uses --scheduled to self-gate: it checks the current hour against
# BRIEFING_HOUR (from .env) and exits silently if it's not time yet. This mirrors
# the Mac launchd setup, which also runs every 15 minutes with --scheduled.
# Running every 15 minutes means BRIEFING_HOUR from .env is respected — unlike a
# one-shot timer which would require a hardcoded time that ignores the env var.
sudo tee "$SERVICE_DIR/kronos-daily.service" > /dev/null <<EOF
[Unit]
Description=KRONOS Daily Briefing

[Service]
Type=oneshot
User=$USER
WorkingDirectory=$ROOT
EnvironmentFile=$ROOT/.env
ExecStart=$NODE $ROOT/daily-clean.js --scheduled
StandardOutput=append:$ROOT/daily-briefing.log
StandardError=append:$ROOT/daily-briefing.log
EOF

sudo tee "$SERVICE_DIR/kronos-daily.timer" > /dev/null <<EOF
[Unit]
Description=KRONOS Daily Briefing Timer

[Timer]
OnCalendar=*-*-* *:00,15,30,45:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

ok "Written: kronos-daily.service + kronos-daily.timer"

# kronos-eod.service + timer
# end-of-day.js uses --scheduled to self-gate against WRAPUP_HOUR (default 21).
# Same pattern as the daily briefing: runs every 15 minutes, sends only at the
# right hour. Mirrors the Mac launchd end-of-day setup exactly.
sudo tee "$SERVICE_DIR/kronos-eod.service" > /dev/null <<EOF
[Unit]
Description=KRONOS End-of-Day Wrap-Up

[Service]
Type=oneshot
User=$USER
WorkingDirectory=$ROOT
EnvironmentFile=$ROOT/.env
ExecStart=$NODE $ROOT/end-of-day.js --scheduled
StandardOutput=append:$ROOT/end-of-day.log
StandardError=append:$ROOT/end-of-day.log
EOF

sudo tee "$SERVICE_DIR/kronos-eod.timer" > /dev/null <<EOF
[Unit]
Description=KRONOS End-of-Day Wrap-Up Timer

[Timer]
OnCalendar=*-*-* *:00,15,30,45:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

ok "Written: kronos-eod.service + kronos-eod.timer"

# kronos-http.service
# Keeps the HTTP chat endpoint (POST /chat) alive permanently.
# The widget and any local clients use this to talk to KRONOS.
sudo tee "$SERVICE_DIR/kronos-http.service" > /dev/null <<EOF
[Unit]
Description=KRONOS HTTP Chat Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$ROOT
EnvironmentFile=$ROOT/.env
ExecStart=$NODE $ROOT/http-server.js
Restart=always
RestartSec=5
StandardOutput=append:$ROOT/http-server.log
StandardError=append:$ROOT/http-server.log

[Install]
WantedBy=multi-user.target
EOF

ok "Written: kronos-http.service"

# ── 5. Reload systemd and enable services ─────────────────────────────────────
step "Enabling and starting services"

# daemon-reload tells systemd to re-read all service files from disk.
# You must run this any time you create or edit a .service file.
sudo systemctl daemon-reload
ok "systemd reloaded"

sudo systemctl enable kronos-telegram kronos-alerts kronos-http kronos-daily.timer kronos-eod.timer
ok "Services enabled (will start on boot)"

sudo systemctl start kronos-telegram kronos-alerts kronos-http kronos-daily.timer kronos-eod.timer
ok "Services started"

# ── 6. Status report ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  KRONOS is running on your Pi."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

sudo systemctl status kronos-telegram kronos-alerts kronos-http --no-pager --lines=3

echo ""
echo "Useful commands:"
echo "  sudo systemctl status kronos-telegram       # check status"
echo "  sudo systemctl restart kronos-telegram      # restart after code change"
echo "  journalctl -u kronos-telegram -f            # follow logs via systemd"
echo "  tail -f $ROOT/telegram-commands.log         # follow file logs"
echo "  systemctl list-timers --all                 # verify daily + eod timers"
echo ""
echo "To update KRONOS on the Pi:"
echo "  cd $ROOT && git pull && sudo systemctl restart kronos-telegram kronos-alerts kronos-http"
echo ""
echo "Pi-specific .env variables (optional but recommended):"
echo "  KRONOS_INSTANCE_NAME=pi        # labels this instance in /status responses"
echo "  KRONOS_STORAGE_PATH=/home/$USER/.kronos-state   # persist state outside repo"
echo "  KRONOS_OBSIDIAN_DIR=           # leave unset — /note is non-functional on Pi without a vault"
echo ""
