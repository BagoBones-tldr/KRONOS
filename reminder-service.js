const crypto = require('crypto');
const { createCalendarClient } = require('./caldav-client');
const { filterCalendarsByComponent, prioritizeCollectionsByName } = require('./calendar-write-service');

// Returns all VTODO items from Apple Reminders where DUE <= now and STATUS is not COMPLETED/CANCELLED.
// iCloud CalDAV rejects calendar-query REPORT for Reminders, so we use PROPFIND + multiget instead.
async function fetchDueReminders() {
  const now = new Date();
  const client = await createCalendarClient();
  const calendars = await client.fetchCalendars();
  const reminderLists = prioritizeCollectionsByName(
    filterCalendarsByComponent(calendars, 'VTODO'),
    process.env.APPLE_REMINDERS_LIST
  );

  const due = [];

  for (const reminderList of reminderLists) {
    let objects;
    try {
      objects = await fetchReminderObjects(client, reminderList);
    } catch {
      continue;
    }

    for (const obj of objects) {
      if (!obj.data) continue;
      const vtodo = parseVtodo(obj.data);
      if (!vtodo || !vtodo.uid || !vtodo.due) continue;
      if (vtodo.due > now) continue;
      if (vtodo.status === 'COMPLETED' || vtodo.status === 'CANCELLED') continue;

      due.push({ vtodo, calendarObject: obj });
    }
  }

  return due;
}

// iCloud doesn't support calendar-query REPORT for VTODO collections.
// Instead: PROPFIND (depth:1) to list object hrefs, then calendar-multiget to fetch ICS data.
async function fetchReminderObjects(client, reminderList) {
  const auth = Buffer.from(`${process.env.APPLE_ID}:${process.env.APPLE_PASS}`).toString('base64');

  const res = await fetch(reminderList.url, {
    method: 'PROPFIND',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Depth': '1',
      'Content-Type': 'application/xml; charset=utf-8'
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop><D:getetag/></D:prop>
</D:propfind>`
  });

  if (!res.ok && res.status !== 207) {
    throw new Error(`PROPFIND failed: ${res.status}`);
  }

  const xml = await res.text();
  const hrefs = [...xml.matchAll(/<(?:[^:>]*:)?href[^>]*>([^<]+)<\/(?:[^:>]*:)?href>/g)]
    .map(m => m[1].trim())
    .filter(h => h.endsWith('.ics'));

  if (hrefs.length === 0) {
    return [];
  }

  const baseUrl = new URL(reminderList.url);
  const absoluteUrls = hrefs.map(h => h.startsWith('http') ? h : `${baseUrl.origin}${h}`);

  return client.fetchCalendarObjects({
    calendar: reminderList,
    objectUrls: absoluteUrls
  });
}

// Marks a VTODO as COMPLETED by updating the ICS via CalDAV PUT.
async function markReminderCompleted(calendarObject) {
  const client = await createCalendarClient();
  const now = new Date();
  const completedStamp = toIcsUtc(now);

  let ics = unfoldIcs(calendarObject.data);

  // Update or add each field
  ics = setIcsField(ics, 'STATUS', 'COMPLETED');
  ics = setIcsField(ics, 'PERCENT-COMPLETE', '100');
  ics = setIcsField(ics, 'LAST-MODIFIED', completedStamp);
  ics = setIcsField(ics, 'COMPLETED', completedStamp);

  const response = await client.updateCalendarObject({
    calendarObject,
    iCalString: ics
  });

  if (!response.ok) {
    throw new Error(`Failed to mark reminder completed: HTTP ${response.status}`);
  }
}

function formatReminderMessage(vtodo) {
  const lines = [
    `🔔 <b>Reminder</b>`,
    `<b>${escapeHtml(vtodo.title || 'Untitled reminder')}</b>`
  ];
  if (vtodo.description) {
    lines.push(escapeHtml(vtodo.description));
  }
  return lines.join('\n');
}

// ── ICS parsing helpers ────────────────────────────────────────────────────────

// RFC 5545: long lines may be folded with CRLF + whitespace. Unfold before parsing.
function unfoldIcs(icsString) {
  return String(icsString)
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '');
}

function parseVtodo(icsString) {
  const unfolded = unfoldIcs(icsString);
  const match = unfolded.match(/BEGIN:VTODO([\s\S]*?)END:VTODO/);
  if (!match) return null;

  const block = match[1];

  const get = (field) => {
    // Matches FIELD: or FIELD;PARAM=VALUE: — captures the value
    const m = block.match(new RegExp(`^${field}[^:\r\n]*:(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };

  const due = get('DUE');
  const status = get('STATUS') || 'NEEDS-ACTION';
  const summary = get('SUMMARY');
  const description = get('DESCRIPTION');
  const uid = get('UID');

  return {
    uid,
    title: summary ? unescapeIcsText(summary) : null,
    due: due ? parseIcsDate(due) : null,
    status,
    description: description ? unescapeIcsText(description) : null
  };
}

function parseIcsDate(value) {
  const s = String(value).trim();

  // Date only: 20260409
  if (/^\d{8}$/.test(s)) {
    return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
  }

  // DateTime: 20260409T150000Z or 20260409T150000
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    const [, year, month, day, hour, min, sec, z] = m;
    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}${z || ''}`);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  return null;
}

// Sets or adds an ICS property inside VTODO. Replaces existing value or inserts before END:VTODO.
function setIcsField(ics, field, value) {
  const pattern = new RegExp(`^${field}[^:\r\n]*:.+$`, 'm');
  if (pattern.test(ics)) {
    return ics.replace(pattern, `${field}:${value}`);
  }
  return ics.replace(/^END:VTODO/m, `${field}:${value}\r\nEND:VTODO`);
}

function unescapeIcsText(value) {
  return String(value)
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function createReminder({ title, dueDate, notes = '' }) {
  if (!title || !(dueDate instanceof Date) || Number.isNaN(dueDate.valueOf())) {
    throw new Error('Missing required reminder details.');
  }

  const client = await createCalendarClient();
  const calendars = await client.fetchCalendars();
  const reminderLists = prioritizeCollectionsByName(
    filterCalendarsByComponent(calendars, 'VTODO'),
    process.env.APPLE_REMINDERS_LIST
  );

  if (!reminderLists.length) {
    throw new Error('No Apple Reminders list is available through CalDAV.');
  }

  let lastStatus = null;
  const attemptedStatuses = [];

  for (const reminderList of reminderLists) {
    const uid = crypto.randomUUID();
    const filename = `${uid}.ics`;
    const iCalString = buildVtodoReminder({
      uid,
      title,
      dueDate,
      notes
    });

    const response = await client.createCalendarObject({
      calendar: reminderList,
      filename,
      iCalString
    });

    if (response.ok) {
      return {
        listName: reminderList.displayName || 'Reminders',
        title,
        dueDate
      };
    }

    lastStatus = response.status;
    attemptedStatuses.push(`${reminderList.displayName || 'Reminders'}:${response.status}`);

    if (response.status === 401) {
      throw new Error('Reminder create failed with status 401: authentication was rejected.');
    }
  }

  if (lastStatus === 403) {
    throw new Error('Reminder create failed with status 403: no writable Apple Reminders list accepted the reminder. Set APPLE_REMINDERS_LIST in .env to a writable reminders list name.');
  }

  throw new Error(
    `Reminder create failed across all reminder lists. Last status: ${lastStatus || 'unknown'}. Tried: ${attemptedStatuses.join(', ')}`
  );
}

// Returns all pending (NEEDS-ACTION) VTODO items regardless of due date — for listing and cancellation.
async function fetchPendingReminders() {
  const client = await createCalendarClient();
  const calendars = await client.fetchCalendars();
  const reminderLists = prioritizeCollectionsByName(
    filterCalendarsByComponent(calendars, 'VTODO'),
    process.env.APPLE_REMINDERS_LIST
  );

  const pending = [];

  for (const reminderList of reminderLists) {
    let objects;
    try {
      objects = await fetchReminderObjects(client, reminderList);
    } catch {
      continue;
    }

    for (const obj of objects) {
      if (!obj.data) continue;
      const vtodo = parseVtodo(obj.data);
      if (!vtodo || !vtodo.uid) continue;
      if (vtodo.status === 'COMPLETED' || vtodo.status === 'CANCELLED') continue;
      // Only include KRONOS-created reminders (have a DUE date and PRODID from KRONOS)
      if (!vtodo.due) continue;
      pending.push({ vtodo, calendarObject: obj });
    }
  }

  return pending;
}

// Deletes a VTODO from CalDAV by sending a DELETE request to its URL.
async function deleteReminder(calendarObject) {
  const client = await createCalendarClient();
  const response = await client.deleteCalendarObject({ calendarObject });
  if (response && !response.ok && response.status !== 204) {
    throw new Error(`Failed to delete reminder: HTTP ${response.status}`);
  }
}

async function listReminderLists() {
  const client = await createCalendarClient();
  const calendars = await client.fetchCalendars();
  return prioritizeCollectionsByName(
    filterCalendarsByComponent(calendars, 'VTODO'),
    process.env.APPLE_REMINDERS_LIST
  ).map(list => ({
    displayName: list.displayName || 'Reminders',
    url: list.url || ''
  }));
}

function buildVtodoReminder({ uid, title, dueDate, notes }) {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Project KRONOS//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTODO',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `CREATED:${toIcsUtc(now)}`,
    `LAST-MODIFIED:${toIcsUtc(now)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DTSTART:${toIcsUtc(dueDate)}`,
    `DUE:${toIcsUtc(dueDate)}`,
    'STATUS:NEEDS-ACTION',
    'SEQUENCE:0',
    'PRIORITY:0',
    'PERCENT-COMPLETE:0',
    'X-APPLE-SORT-ORDER:0'
  ];

  if (notes) {
    lines.push(`DESCRIPTION:${escapeIcsText(notes)}`);
  }

  lines.push('END:VTODO', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function toIcsUtc(value) {
  const date = new Date(value);
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

module.exports = {
  createReminder,
  listReminderLists,
  fetchDueReminders,
  fetchPendingReminders,
  deleteReminder,
  markReminderCompleted,
  formatReminderMessage
};
