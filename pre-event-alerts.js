const { loadEnv } = require('./env');

const { fetchTodayEvents } = require('./calendar-service');
const { findUpcomingAlerts, formatAlertMessage, markAlertsSent } = require('./alert-service');
const { getRequiredEnv, sendTelegramMessage } = require('./telegram-service');
const { sendReminderAlerts } = require('./reminder-alerts');

loadEnv();

async function sendPreEventAlerts() {
  const now = new Date();
  const events = await fetchTodayEvents(now);
  const { dueAlerts, state } = await findUpcomingAlerts(events, now);

  if (dueAlerts.length === 0) {
    console.log('No alerts due right now.');
  } else {
    for (const alert of dueAlerts) {
      const message = formatAlertMessage(alert);
      console.log(message);

      if (process.env.DRY_RUN !== '1') {
        await sendTelegramMessage(getRequiredEnv('TELEGRAM_CHAT_ID'), message);
      }
    }

    if (process.env.DRY_RUN === '1') {
      console.log(`Dry run enabled, skipping Telegram send for ${dueAlerts.length} alert(s).`);
    } else {
      await markAlertsSent(dueAlerts, state, now);
      console.log(`Sent ${dueAlerts.length} pre-event alert(s).`);
    }
  }
}

async function run() {
  await Promise.allSettled([
    sendPreEventAlerts().catch(err => console.error('[pre-event-alerts]', err.message)),
    sendReminderAlerts().catch(err => console.error('[reminder-alerts]', err.message))
  ]);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
