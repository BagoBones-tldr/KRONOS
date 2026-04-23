const { loadEnv } = require('./env');

const { fetchDueReminders, markReminderCompleted, formatReminderMessage } = require('./reminder-service');
const { getRequiredEnv, sendTelegramMessage } = require('./telegram-service');
const { readJson, writeJson } = require('./storage');
const { STORAGE_PATHS } = require('./storage-layout');

loadEnv();

const FIRED_TTL_DAYS = 7;

async function loadFiredState() {
  const parsed = await readJson(STORAGE_PATHS.reminderState, { fired: {} });
  return parsed?.fired && typeof parsed.fired === 'object' ? parsed : { fired: {} };
}

async function saveFiredState(state) {
  await writeJson(STORAGE_PATHS.reminderState, state);
}

function reminderKey(vtodo) {
  return `${vtodo.uid}|${vtodo.due instanceof Date ? vtodo.due.toISOString() : ''}`;
}

function pruneFiredState(state, now) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - FIRED_TTL_DAYS);
  for (const [key, firedAt] of Object.entries(state.fired)) {
    if (new Date(firedAt) < cutoff) {
      delete state.fired[key];
    }
  }
}

async function sendReminderAlerts() {
  const due = await fetchDueReminders();

  if (due.length === 0) {
    console.log('No reminders due right now.');
    return;
  }

  const chatId = getRequiredEnv('TELEGRAM_CHAT_ID');
  const now = new Date();
  const state = await loadFiredState();
  pruneFiredState(state, now);

  let firedCount = 0;

  for (const { vtodo, calendarObject } of due) {
    const key = reminderKey(vtodo);

    if (state.fired[key]) {
      console.log(`Already fired, skipping: ${vtodo.title}`);
      continue;
    }

    const message = formatReminderMessage(vtodo);
    console.log(`Reminder due: ${vtodo.title}`);

    if (process.env.DRY_RUN === '1') {
      console.log(message);
      continue;
    }

    try {
      await markReminderCompleted(calendarObject);
    } catch (err) {
      console.warn(`Could not mark completed in CalDAV: ${err.message}`);
    }

    await sendTelegramMessage(chatId, message);
    state.fired[key] = now.toISOString();
    firedCount++;

    console.log(`Sent: ${vtodo.title}`);
  }

  if (firedCount > 0 || Object.keys(state.fired).length > 0) {
    await saveFiredState(state);
  }

  if (process.env.DRY_RUN === '1') {
    console.log(`Dry run: ${due.length} reminder(s) would have fired.`);
  }
}

module.exports = { sendReminderAlerts };

if (require.main === module) {
  sendReminderAlerts().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
