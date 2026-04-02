const { createCalendarClient } = require('./caldav-client');

function getTodayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function parseEventData(data) {
  const unfolded = unfoldIcs(data);
  const summary = getIcsField(unfolded, 'SUMMARY') || 'No title';
  const description = getIcsField(unfolded, 'DESCRIPTION') || '';
  const location = getIcsField(unfolded, 'LOCATION') || '';
  const start = parseIcsDate(data, 'DTSTART');
  const end = parseIcsDate(data, 'DTEND');

  return {
    title: summary,
    description,
    location,
    start,
    end
  };
}

function parseIcsDate(data, fieldName) {
  const unfolded = unfoldIcs(data);
  const match = unfolded.match(new RegExp(`^${fieldName}(?:;[^:]*)?:(\\d{8}T\\d{6}Z?)$`, 'm'));
  if (!match) {
    return null;
  }

  const raw = match[1];
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}${raw.endsWith('Z') ? 'Z' : ''}`;
  return new Date(iso);
}

function getIcsField(data, fieldName) {
  const match = data.match(new RegExp(`^${fieldName}(?:;[^:]*)?:(.*)$`, 'm'));
  return match?.[1]?.trim() || '';
}

function unfoldIcs(data) {
  return data.replace(/\r?\n[ \t]/g, '');
}

async function fetchTodayEvents(now = new Date()) {
  return fetchEventsForDate(now);
}

async function fetchEventsForDate(targetDate = new Date()) {
  const client = await createCalendarClient();
  const calendars = await client.fetchCalendars();
  const range = getTodayRange(targetDate);
  const normalizedEvents = [];

  for (const calendar of calendars) {
    const calendarObjects = await client.fetchCalendarObjects({
      calendar,
      timeRange: {
        start: range.start.toISOString(),
        end: range.end.toISOString()
      },
      expand: true
    });

    for (const calendarObject of calendarObjects) {
      const parsed = parseEventData(calendarObject.data);
      normalizedEvents.push({
        ...parsed,
        calendarName: calendar.displayName
      });
    }
  }

  return normalizedEvents
    .filter(event => event.start instanceof Date && !Number.isNaN(event.start.valueOf()))
    .sort((a, b) => a.start - b.start);
}

module.exports = {
  fetchEventsForDate,
  fetchTodayEvents,
  getTodayRange,
  parseEventData
};
