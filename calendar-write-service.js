const crypto = require('crypto');
const { createCalendarClient } = require('./caldav-client');
const { parseEventData, getTodayRange } = require('./calendar-service');

async function createCalendarEvent({ title, start, end, description = '', location = '' }) {
  if (!title || !(start instanceof Date) || !(end instanceof Date)) {
    throw new Error('Missing required event details.');
  }

  const client = await createCalendarClient();
  const calendars = await client.fetchCalendars();
  const orderedCalendars = prioritizeCalendars(filterCalendarsByComponent(calendars, 'VEVENT'));

  if (!orderedCalendars.length) {
    throw new Error('No writable calendar is available.');
  }

  let lastStatus = null;
  const attemptedStatuses = [];
  for (const calendar of orderedCalendars) {
    const uid = crypto.randomUUID();
    const filename = `${uid}.ics`;
    const iCalString = buildIcsEvent({
      uid,
      title,
      start,
      end,
      description,
      location
    });

    const response = await client.createCalendarObject({
      calendar,
      filename,
      iCalString
    });

    if (response.ok) {
      return {
        calendarName: calendar.displayName || 'Default calendar',
        title,
        start,
        end
      };
    }

    lastStatus = response.status;
    attemptedStatuses.push(`${calendar.displayName || 'Default calendar'}:${response.status}`);

    // Some calendars are visible through CalDAV but not writable. Keep trying
    // until a calendar accepts the event or we run out of options.
    if (response.status === 401) {
      throw new Error('Calendar create failed with status 401: authentication was rejected.');
    }
  }

  if (lastStatus === 403) {
    throw new Error('Calendar create failed with status 403: no writable calendar accepted the event. Set DEFAULT_CALENDAR_NAME in .env to a writable calendar name.');
  }

  throw new Error(
    `Calendar create failed across all calendars. Last status: ${lastStatus || 'unknown'}. Tried: ${attemptedStatuses.join(', ')}`
  );
}

async function removeCalendarEvent({ titleQuery, date, time = null }) {
  if (!titleQuery || !(date instanceof Date)) {
    throw new Error('Missing required event details for removal.');
  }

  const client = await createCalendarClient();
  const calendars = await client.fetchCalendars();
  const orderedCalendars = prioritizeCalendars(calendars);

  if (!orderedCalendars.length) {
    throw new Error('No calendar is available for event removal.');
  }

  const range = getTodayRange(date);
  const matches = [];

  for (const calendar of orderedCalendars) {
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
      if (!parsed.start || Number.isNaN(parsed.start.valueOf())) {
        continue;
      }

      if (!matchesTitle(parsed.title, titleQuery)) {
        continue;
      }

      if (time && !matchesTime(parsed.start, time)) {
        continue;
      }

      if (parsed.isRecurringSeries || parsed.recurrenceId) {
        throw new Error(
          `Recurring event protection: "${parsed.title}" appears to be part of a repeating series. KRONOS will not remove repeating events automatically.`
        );
      }

      matches.push({
        calendar,
        calendarObject,
        parsed
      });
    }
  }

  if (matches.length === 0) {
    throw new Error(`No calendar event matched "${titleQuery}" on ${date.toDateString()}.`);
  }

  if (matches.length > 1) {
    const options = matches
      .slice(0, 3)
      .map(match => `${match.parsed.title} at ${formatTime(match.parsed.start)}`)
      .join('; ');
    throw new Error(
      `Multiple events matched "${titleQuery}" on ${date.toDateString()}. Be more specific with a time. Matches: ${options}`
    );
  }

  const match = matches[0];
  const response = await client.deleteCalendarObject({
    calendarObject: match.calendarObject
  });

  if (!response.ok) {
    throw new Error(`Calendar delete failed with status ${response.status}`);
  }

  return {
    calendarName: match.calendar.displayName || 'Default calendar',
    title: match.parsed.title,
    start: match.parsed.start,
    end: match.parsed.end
  };
}

function prioritizeCalendars(calendars) {
  return prioritizeCollectionsByName(calendars, process.env.DEFAULT_CALENDAR_NAME);
}

function prioritizeCollectionsByName(collections, preferredName) {
  if (!Array.isArray(collections) || collections.length === 0) {
    return [];
  }

  const normalizedPreference = String(preferredName || '').trim().toLowerCase();
  if (normalizedPreference) {
    const match = collections.find(collection => normalizeCalendarName(collection) === normalizedPreference);
    if (match) {
      return [match, ...collections.filter(collection => collection !== match)];
    }
  }

  return [...collections];
}

function filterCalendarsByComponent(calendars, componentName) {
  if (!Array.isArray(calendars) || calendars.length === 0) {
    return [];
  }

  const normalizedComponent = String(componentName || '').trim().toUpperCase();
  if (!normalizedComponent) {
    return [...calendars];
  }

  return calendars.filter(calendar => {
    const components = Array.isArray(calendar?.components) ? calendar.components : [];
    return components.map(component => String(component).toUpperCase()).includes(normalizedComponent);
  });
}

function normalizeCalendarName(calendar) {
  return String(calendar?.displayName || '').trim().toLowerCase();
}

function matchesTitle(eventTitle, query) {
  const normalizedTitle = normalizeTitle(eventTitle);
  const normalizedQuery = normalizeTitle(query);
  return normalizedTitle.includes(normalizedQuery);
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesTime(left, right) {
  return left.getHours() === right.getHours() && left.getMinutes() === right.getMinutes();
}

function formatTime(value) {
  return value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function buildIcsEvent({ uid, title, start, end, description, location }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Project KRONOS//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(title)}`
  ];

  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }

  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function toIcsUtc(value) {
  return value
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

module.exports = {
  createCalendarEvent,
  removeCalendarEvent,
  prioritizeCollectionsByName,
  filterCalendarsByComponent,
  normalizeCalendarName
};
