const { loadEnv } = require('./env');
const { createCalendarClient } = require('./caldav-client');
const { filterCalendarsByComponent, prioritizeCollectionsByName } = require('./calendar-write-service');

loadEnv();

async function debugReminders() {
  const now = new Date();
  console.log('Now:', now.toISOString());

  const client = await createCalendarClient();
  const calendars = await client.fetchCalendars();
  const reminderLists = prioritizeCollectionsByName(
    filterCalendarsByComponent(calendars, 'VTODO'),
    process.env.APPLE_REMINDERS_LIST
  );

  console.log(`Found ${reminderLists.length} reminder list(s):`, reminderLists.map(l => l.displayName));

  for (const list of reminderLists) {
    console.log(`\n--- ${list.displayName} (${list.url}) ---`);

    // Raw PROPFIND to list all object hrefs in the collection
    const auth = Buffer.from(`${process.env.APPLE_ID}:${process.env.APPLE_PASS}`).toString('base64');
    const propfindBody = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:getetag/>
    <D:getcontenttype/>
  </D:prop>
</D:propfind>`;

    const res = await fetch(list.url, {
      method: 'PROPFIND',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Depth': '1',
        'Content-Type': 'application/xml; charset=utf-8'
      },
      body: propfindBody
    });

    console.log('PROPFIND status:', res.status);
    const xml = await res.text();
    console.log('PROPFIND response:\n', xml.slice(0, 3000));

    // Extract hrefs from the XML
    const hrefs = [...xml.matchAll(/<(?:[^:>]*:)?href[^>]*>([^<]+)<\/(?:[^:>]*:)?href>/g)]
      .map(m => m[1].trim())
      .filter(h => h.endsWith('.ics'));

    console.log('\nFound .ics hrefs:', hrefs);

    if (hrefs.length > 0) {
      // Build absolute URLs
      const baseUrl = new URL(list.url);
      const absoluteUrls = hrefs.map(h => h.startsWith('http') ? h : `${baseUrl.origin}${h}`);

      // Try multiget via tsdav
      console.log('\nAttempting multiget...');
      try {
        const objects = await client.fetchCalendarObjects({
          calendar: list,
          objectUrls: absoluteUrls
        });
        console.log(`Multiget returned ${objects.length} object(s)`);
        for (const obj of objects) {
          console.log('\nICS data:\n', obj.data);
          const { parseVtodo } = require('./reminder-service');
          // parseVtodo is not exported yet — print raw UID line instead
          const uidMatch = obj.data && obj.data.match(/^UID:(.+)$/m);
          const dueMatch = obj.data && obj.data.match(/^DUE[^:]*:(.+)$/m);
          const statusMatch = obj.data && obj.data.match(/^STATUS:(.+)$/m);
          console.log('  UID:', uidMatch ? uidMatch[1].trim() : 'NOT FOUND');
          console.log('  DUE:', dueMatch ? dueMatch[1].trim() : 'NOT FOUND');
          console.log('  STATUS:', statusMatch ? statusMatch[1].trim() : 'NOT FOUND');
        }
      } catch (err) {
        console.log('Multiget failed:', err.message);
      }
    }
  }
}

debugReminders().catch(console.error);
