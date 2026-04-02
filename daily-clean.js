const { loadEnv } = require('./env');
const { fetchTodayEvents } = require('./calendar-service');
const { buildDailyContext, generateBriefing } = require('./briefing-service');
const { sendTelegramMessage, getRequiredEnv } = require('./telegram-service');
const { fetchDailyWeather } = require('./weather-service');

loadEnv();

async function getDailySchedule() {
  const now = new Date();
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
