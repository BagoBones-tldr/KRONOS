const { loadEnv } = require('./env');
const { fetchTodayEvents } = require('./calendar-service');
const { buildWrapUpContext, generateWrapUpWithAi } = require('./briefing-service');
const { sendTelegramMessage, getRequiredEnv } = require('./telegram-service');
const { loadTaskState, getOpenTasks, getCompletedTasks } = require('./task-state');
const { readJson, writeJson } = require('./storage');
const { STORAGE_PATHS, LEGACY_STORAGE_PATHS } = require('./storage-layout');
const { appendContext, trimContext } = require('./memory-service');

const STATE_PATH = STORAGE_PATHS.endOfDayState;
const LEGACY_STATE_PATH = LEGACY_STORAGE_PATHS.endOfDayState;

loadEnv();

async function main() {
  const scheduledMode = process.argv.includes('--scheduled');
  const now = new Date();

  if (scheduledMode) {
    if (!shouldSendScheduledWrapUp(now)) {
      console.log('Scheduled wrap-up skipped: outside local wrap-up window.');
      return;
    }

    if (await wasAlreadySentToday(now)) {
      console.log('Scheduled wrap-up skipped: already sent for this local day.');
      return;
    }
  }

  const [events, taskState] = await Promise.all([
    fetchTodayEvents(now),
    loadTaskState()
  ]);

  const context = buildWrapUpContext(events, now, {
    allTasks: taskState.tasks || [],
    openTasks: getOpenTasks(taskState),
    completedTasks: getCompletedTasks(taskState)
  });

  const message = await generateWrapUpWithAi(context);
  console.log(message);

  if (process.env.DRY_RUN === '1') {
    console.log('Dry run enabled, skipping Telegram send.');
    return;
  }

  await sendTelegramMessage(getRequiredEnv('TELEGRAM_CHAT_ID'), message);
  console.log('Sent end-of-day wrap-up to Telegram!');

  trimContext();
  const eventTitles = events.map(e => e.title).filter(Boolean).join(', ');
  appendContext(`Wrap-up sent. Events today: ${eventTitles || 'none'}.`);

  if (scheduledMode) {
    await markSentToday(now);
  }
}

function shouldSendScheduledWrapUp(now = new Date()) {
  const targetTimezone = process.env.WRAPUP_TIMEZONE || 'America/Chicago';
  const targetHour = Number(process.env.WRAPUP_HOUR || 21);
  const targetMinute = Number(process.env.WRAPUP_MINUTE || 0);
  const minuteWindow = Number(process.env.WRAPUP_MINUTE_WINDOW || 15);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(now);

  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? NaN);
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? NaN);

  return hour === targetHour && minute >= targetMinute && minute < targetMinute + minuteWindow;
}

async function wasAlreadySentToday(now = new Date()) {
  const parsed = await readJson(STATE_PATH, null) ?? await readJson(LEGACY_STATE_PATH, null);
  return parsed?.lastSentLocalDate === getLocalDateLabel(now);
}

async function markSentToday(now = new Date()) {
  await writeJson(STATE_PATH, {
    lastSentLocalDate: getLocalDateLabel(now),
    sentAt: now.toISOString()
  });
}

function getLocalDateLabel(now = new Date()) {
  const targetTimezone = process.env.WRAPUP_TIMEZONE || 'America/Chicago';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: targetTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
