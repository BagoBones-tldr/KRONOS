const path = require('path');
const { loadEnv } = require('./env');
const { fetchTodayEvents } = require('./calendar-service');
const { buildDailyContext, generateBriefingWithAi } = require('./briefing-service');
const { sendTelegramMessage, getRequiredEnv } = require('./telegram-service');
const { fetchDailyWeather } = require('./weather-service');
const { writeText } = require('./storage');
const { getBriefingsDir } = require('./runtime-paths');

const KNOTES_BRIEFINGS = getBriefingsDir();

function htmlToMarkdown(html) {
  return html
    .replace(/<b>(.*?)<\/b>/gs, '**$1**')
    .replace(/<i>(.*?)<\/i>/gs, '*$1*')
    .replace(/<code>(.*?)<\/code>/gs, '`$1`')
    .replace(/<pre>(.*?)<\/pre>/gs, '```\n$1\n```')
    .replace(/<[^>]+>/g, '');
}

async function saveBriefingToVault(message, date) {
  try {
    const dateStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const filePath = path.join(KNOTES_BRIEFINGS, `${dateStr}.md`);
    const content = `# Daily Briefing — ${dateStr}\n\n${htmlToMarkdown(message)}\n`;
    await writeText(filePath, content);
    console.log(`Briefing saved to Obsidian: briefings/${dateStr}.md`);
  } catch (err) {
    console.warn('Could not save briefing to Obsidian vault:', err.message);
  }
}

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
  const message = await generateBriefingWithAi(context);
  
  console.log(message);
  await saveBriefingToVault(message, now);
  if (process.env.DRY_RUN === '1') {
    console.log('Dry run enabled, skipping Telegram send.');
    return;
  }

  await sendTelegramMessage(getRequiredEnv('TELEGRAM_CHAT_ID'), message);
  console.log('Sent to Telegram!');
}

getDailySchedule().catch(console.error);
