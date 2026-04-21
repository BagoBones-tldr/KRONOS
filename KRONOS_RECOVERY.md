# KRONOS Recovery Guide

This bundle is meant to restore Project KRONOS after a laptop loss, drive failure, or clean-machine rebuild.

## Included Backups

- Encrypted project archive:
  - `project-kronos-backup-2026-04-04.tar.gz.enc`
- SHA-256 checksum:
  - `project-kronos-backup-2026-04-04.tar.gz.enc.sha256`
- Installed LaunchAgents:
  - `com.projectkronos.telegram-commands.plist`
  - `com.projectkronos.pre-event-alerts.plist`
- Shell alias snapshot:
  - `zprofile.kronos-backup`

## Restore Steps

1. Verify the encrypted archive:

```bash
shasum -a 256 -c project-kronos-backup-2026-04-04.tar.gz.enc.sha256
```

2. Decrypt the project archive:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in project-kronos-backup-2026-04-04.tar.gz.enc \
  -out project-kronos-backup-2026-04-04.tar.gz
```

3. Extract the project:

```bash
tar -xzf project-kronos-backup-2026-04-04.tar.gz
```

4. Move the repo back into place if desired:

```bash
mv project-kronos ~/Developer/project-kronos
```

5. Restore the KRONOS alias if needed:

```bash
cat zprofile.kronos-backup >> ~/.zprofile
source ~/.zprofile
```

6. Restore LaunchAgents if needed:

```bash
cp com.projectkronos.telegram-commands.plist ~/Library/LaunchAgents/
cp com.projectkronos.pre-event-alerts.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.projectkronos.telegram-commands.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.projectkronos.pre-event-alerts.plist
```

## Cloud Checklist

- Confirm Railway still has the correct env vars:
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

## Notes

- The encrypted archive includes `.env`.
- The archive intentionally excludes `node_modules`, logs, and swap files.
- If secrets were ever exposed in chat or logs, rotate them before trusting the restored environment long-term.
