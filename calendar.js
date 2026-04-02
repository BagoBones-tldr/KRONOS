const { createCalendarClient } = require('./caldav-client');

async function connectToAppleCalendar() {
  const client = await createCalendarClient();
  console.log('Connected to Apple Calendar!');
  
  const calendars = await client.fetchCalendars();
  console.log('Your calendars:');
  calendars.forEach(cal => console.log(' -', cal.displayName));
}

connectToAppleCalendar().catch(console.error);
