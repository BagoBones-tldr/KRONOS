require('dotenv').config();
const { DAVClient } = require('tsdav');

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    })
  });
}

async function getDailySchedule() {
  const client = new DAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: {
      username: process.env.APPLE_ID,
      password: process.env.APPLE_PASS
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav'
  });

  await client.login();
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const calendars = await client.fetchCalendars();
  
  let message = `🌅 <b>Good Morning Quintin!</b>\n\n`;
  message += `📅 <b>Your Schedule for ${today.toDateString()}</b>\n`;
  message += `================================\n`;

  for (const calendar of calendars) {
    const events = await client.fetchCalendarObjects({
      calendar,
      timeRange: {
        start: today.toISOString(),
        end: tomorrow.toISOString()
      }
    });

    for (const event of events) {
      const data = event.data;
      const summary = data.match(/SUMMARY:(.+)/)?.[1]?.trim() || 'No title';
      const desc = data.match(/DESCRIPTION:(.+)/)?.[1]?.trim() || '';
      const startMatch = data.match(/DTSTART[^:]*:(\d{8}T\d{6})/);
      
      let timeStr = '';
      if (startMatch) {
        const raw = startMatch[1];
        const year = raw.slice(0,4);
        const month = raw.slice(4,6);
        const day = raw.slice(6,8);
        const hour = raw.slice(9,11);
        const min = raw.slice(11,13);
        const date = new Date(`${year}-${month}-${day}T${hour}:${min}:00`);
        timeStr = date.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
      }

      message += `\n📅 <b>${summary}</b>\n`;
      if (timeStr) message += `⏰ ${timeStr}\n`;
      if (desc) message += `📍 ${desc}\n`;
    }
  }

  message += `\nHave a great day! 🚀`;
  
  console.log(message);
  await sendTelegram(message);
  console.log('Sent to Telegram!');
}

getDailySchedule().catch(console.error);
