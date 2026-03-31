const { DAVClient } = require('tsdav');

async function connectToAppleCalendar() {
  const client = new DAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: {
      username: 'quintinedwards@icloud.com',
      password: 'ntbl-pgxu-dnvx-iant'
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav'
  });

  await client.login();
  console.log('Connected to Apple Calendar!');
  
  const calendars = await client.fetchCalendars();
  console.log('Your calendars:');
  calendars.forEach(cal => console.log(' -', cal.displayName));
}

connectToAppleCalendar().catch(console.error);
