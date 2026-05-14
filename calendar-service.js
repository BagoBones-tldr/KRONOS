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
  const isRecurringSeries = /^RRULE(?:;[^:]*)?:/m.test(unfolded);
  const recurrenceId = getIcsField(unfolded, 'RECURRENCE-ID') || '';
  const isAllDay = /^DTSTART(?:;[^:]*)?:\d{8}$/m.test(unfolded);

  return {
    title: summary,
    description,
    location,
    start,
    end,
    isAllDay,
    isRecurringSeries,
    recurrenceId
  };
}

function parseIcsDate(data, fieldName) {
  const unfolded = unfoldIcs(data);
  const dateTimeMatch = unfolded.match(new RegExp(`^${fieldName}(?:;[^:]*)?:(\\d{8}T\\d{6}Z?)$`, 'm'));
  if (dateTimeMatch) {
    const raw = dateTimeMatch[1];
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}${raw.endsWith('Z') ? 'Z' : ''}`;
    return new Date(iso);
  }

  const dateOnlyMatch = unfolded.match(new RegExp(`^${fieldName}(?:;[^:]*)?:(\\d{8})$`, 'm'));
  if (!dateOnlyMatch) {
    return null;
  }

  const raw = dateOnlyMatch[1];
  const result = new Date(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    0,
    0,
    0,
    0
  );
  return Number.isNaN(result.valueOf()) ? null : result;
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
    .filter(event => {
      if (!(event.start instanceof Date) || Number.isNaN(event.start.valueOf())) {
        console.warn(`Dropped event with invalid start date: "${event.title}"`);
        return false;
      }
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

module.exports = {
  fetchEventsForDate,
  fetchTodayEvents,
  getTodayRange,
  parseEventData
};
