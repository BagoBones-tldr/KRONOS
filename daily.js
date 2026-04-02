const { createCalendarClient } = require('./caldav-client');

async function getDailySchedule() {
  const client = await createCalendarClient();
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const calendars = await client.fetchCalendars();
  
  console.log('=== YOUR SCHEDULE FOR TODAY ===');
  console.log('Date:', today.toDateString());
  console.log('================================');

  for (const calendar of calendars) {
    const events = await client.fetchCalendarObjects({
      calendar,
      timeRange: {
        start: today.toISOString(),
        end: tomorrow.toISOString()
      }
    });

    if (events.length > 0) {
      console.log('Calendar:', calendar.displayName);
      events.forEach(event => {
        console.log(' -', event.data);
      });
    }
  }
}

getDailySchedule().catch(console.error);
