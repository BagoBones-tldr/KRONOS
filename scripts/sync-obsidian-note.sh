#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$ROOT/KRONOS_LOG.md"
OBSIDIAN_DIR="${KRONOS_OBSIDIAN_DIR:-$HOME/Documents/Obsidian Vault}"
KRONOS_NOTES_DIR="${KRONOS_OBSIDIAN_NOTES_DIR:-$OBSIDIAN_DIR/KRONOS Notes}"
NOTE_FILE="${KRONOS_NOTES_DASHBOARD:-$KRONOS_NOTES_DIR/Project KRONOS.md}"
TASK_NOTE_FILE="${KRONOS_TASK_NOTE:-$KRONOS_NOTES_DIR/KRONOS Tasks.md}"
TASK_STATE_FILE="$(cd "$ROOT" && node -e "const { resolveStoragePath } = require('./storage'); const { STORAGE_PATHS } = require('./storage-layout'); process.stdout.write(resolveStoragePath(STORAGE_PATHS.taskState));")"
COMMIT_MSG_FILE="${1:-}"

mkdir -p "$KRONOS_NOTES_DIR"

SUMMARY="Manual sync"
if [[ -n "$COMMIT_MSG_FILE" && -f "$COMMIT_MSG_FILE" ]]; then
  SUMMARY="$(sed -n '1{/^#/d;/^$/d;p;}' "$COMMIT_MSG_FILE" | head -n 1 | tr -d '\r')"
  [[ -z "$SUMMARY" ]] && SUMMARY="No summary provided"
fi

TIMESTAMP="$(TZ=America/Chicago date '+%Y-%m-%d %I:%M:%S %p %Z')"
BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
STAGED_FILES="$(git -C "$ROOT" diff --cached --name-only --diff-filter=ACMR)"

extract_section() {
  local heading="$1"
  awk -v heading="$heading" '
    $0 == heading { found=1; next }
    /^## / && found { exit }
    found { print }
  ' "$LOG_FILE"
}

CURRENT_STATE_SECTION="$(extract_section '## 🚀 Current KRONOS State')"
AUTOMATED_SECTION="$(extract_section '## 🤖 Automated Updates')"

RECENT_SUMMARIES="$(printf '%s\n' "$AUTOMATED_SECTION" | awk '
  /^### / { timestamp=$0; sub(/^### /, "", timestamp); next }
  /^- Summary: / {
    summary=$0
    sub(/^- Summary: `?/, "", summary)
    sub(/`$/, "", summary)
    entries[++count] = "- " timestamp " — " summary
  }
  END {
    start = count - 4
    if (start < 1) start = 1
    for (i = start; i <= count; i += 1) print entries[i]
  }
')"

CURRENT_CAPABILITIES="$(printf '%s\n' "$CURRENT_STATE_SECTION" | awk '
  /^- / { print "- " substr($0, 3) }
')"

LATEST_FILES="$(if [[ -n "$STAGED_FILES" ]]; then
  while IFS= read -r file; do
    [[ -n "$file" ]] && echo "- \`$file\`"
  done <<< "$STAGED_FILES"
else
  echo "- No staged files"
fi)"

{
  echo "---"
  echo "project: KRONOS"
  echo "last_synced: \"$TIMESTAMP\""
  echo "branch: \"$BRANCH\""
  echo "latest_summary: \"$SUMMARY\""
  echo "---"
  echo
  echo "# Project KRONOS"
  echo
  echo "## Status"
  echo
  echo "- Last synced: $TIMESTAMP"
  echo "- Branch: $BRANCH"
  echo "- Latest commit: $SUMMARY"
  echo
  echo "## Capabilities"
  echo
  if [[ -n "$CURRENT_CAPABILITIES" ]]; then
    echo "$CURRENT_CAPABILITIES"
  else
    echo "- Capability snapshot unavailable"
  fi
  echo
  echo "## Recent Commits"
  echo
  if [[ -n "$RECENT_SUMMARIES" ]]; then
    echo "$RECENT_SUMMARIES"
  else
    echo "- No recent commits recorded"
  fi
  echo
  echo "## Last Change Set"
  echo
  echo "$LATEST_FILES"
} > "$NOTE_FILE"

TASK_NOTE_CONTENT="$(node - "$TASK_STATE_FILE" "$TIMESTAMP" <<'NODE'
const fs = require('fs');

const taskStatePath = process.argv[2];
const timestamp = process.argv[3];

let tasks = [];
try {
  const raw = fs.readFileSync(taskStatePath, 'utf8');
  const parsed = JSON.parse(raw);
  tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const openTasks = tasks.filter(task => !task.completedAt);
const today = new Date();
today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

function formatTask(task) {
  const classLabel = task.className ? ` for ${task.className}` : '';
  const dueLabel = formatDue(task.dueDate);
  return dueLabel ? `- ${task.description}${classLabel} (${dueLabel})` : `- ${task.description}${classLabel}`;
}

function formatDue(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.valueOf())) return '';
  const hasExplicitTime = !(date.getHours() === 0 && date.getMinutes() === 0);
  const timeLabel = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return hasExplicitTime ? `due ${date.toDateString()} at ${timeLabel}` : `due ${date.toDateString()}`;
}

function sameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

const dueToday = [], dueTomorrow = [], upcoming = [], noDueDate = [];

for (const task of openTasks) {
  if (!task.dueDate) { noDueDate.push(task); continue; }
  const dueDate = new Date(task.dueDate);
  if (Number.isNaN(dueDate.valueOf())) { noDueDate.push(task); continue; }
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  if (sameDay(dueDay, today)) dueToday.push(task);
  else if (sameDay(dueDay, tomorrow)) dueTomorrow.push(task);
  else upcoming.push(task);
}

const sections = [];
sections.push('---');
sections.push('project: KRONOS');
sections.push(`last_synced: "${timestamp}"`);
sections.push('view: tasks');
sections.push('---');
sections.push('');
sections.push('# KRONOS Tasks');
sections.push('');
sections.push(`${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}.`);
sections.push('');

function pushSection(title, entries, emptyText) {
  sections.push(`## ${title}`);
  sections.push('');
  if (!entries.length) sections.push(`- ${emptyText}`);
  else for (const task of entries) sections.push(formatTask(task));
  sections.push('');
}

pushSection('Due Today', dueToday, 'Nothing due today.');
pushSection('Due Tomorrow', dueTomorrow, 'Nothing due tomorrow.');
pushSection('Upcoming', upcoming, 'No upcoming tasks.');
pushSection('No Due Date', noDueDate, 'No undated tasks.');

process.stdout.write(sections.join('\n'));
NODE
)"

printf '%s\n' "$TASK_NOTE_CONTENT" > "$TASK_NOTE_FILE"
