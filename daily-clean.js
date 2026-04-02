const { loadEnv } = require('./env');
const { fetchTodayEvents } = require('./calendar-service');
const { buildDailyContext, generateBriefing } = require('./briefing-service');
const { sendTelegramMessage, getRequiredEnv } = require('./telegram-service');
const { fetchDailyWeather } = require('./weather-service');

loadEnv();

function shouldSendScheduledBriefing(now = new Date()) {
  const targetTimezone = process.env.BRIEFING_TIMEZONE || 'America/Chicago';
  const targetHour = Number(process.env.BRIEFING_HOUR || 8);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(now);

  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? NaN);
  return hour === targetHour;
}

async function getDailySchedule() {
  const scheduledMode = process.argv.includes('--scheduled');
  const now = new Date();

  if (scheduledMode && !shouldSendScheduledBriefing(now)) {
    console.log('Scheduled run skipped: outside local briefing hour.');
    return;
  }

  const [events, weather] = await Promise.all([
    fetchTodayEvents(now),
    fetchDailyWeather(now).catch(error => {
      console.warn('Weather fetch failed:', error.message);
      return null;
    })
  ]);
  const context = buildDailyContext(events, now, weather);
  const message = generateBriefing(context);
  
  console.log(message);
  if (process.env.DRY_RUN === '1') {
    console.log('Dry run enabled, skipping Telegram send.');
    return;
  }

  await sendTelegramMessage(getRequiredEnv('TELEGRAM_CHAT_ID'), message);
  console.log('Sent to Telegram!');
}

getDailySchedule().catch(console.error);
