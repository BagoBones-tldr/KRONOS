const fs = require('fs/promises');
const path = require('path');

const { minutesBetween } = require('./schedule-analysis');

const ALERT_STATE_PATH = path.join(__dirname, 'alerts-state.json');

async function findUpcomingAlerts(events, now = new Date(), options = {}) {
  const reminderLeadMinutes = options.reminderLeadMinutes ?? getEnvNumber('ALERT_LEAD_MINUTES', 30);
  const reminderWindowMinutes = options.reminderWindowMinutes ?? getEnvNumber('ALERT_WINDOW_MINUTES', 5);
  const state = await loadAlertState();
  const dueAlerts = [];

  for (const event of events) {
    if (!(event.start instanceof Date) || Number.isNaN(event.start.valueOf())) {
      continue;
    }

    const minutesUntilStart = minutesBetween(now, event.start);
    const isDue = minutesUntilStart <= reminderLeadMinutes && minutesUntilStart >= reminderLeadMinutes - reminderWindowMinutes;
    if (!isDue) {
      continue;
    }

    const eventKey = getEventKey(event);
    if (state.sentAlerts[eventKey]) {
      continue;
    }

    dueAlerts.push({
      event,
      eventKey,
      minutesUntilStart
    });
  }

  return {
    dueAlerts,
    state
  };
}

function formatAlertMessage(alert) {
  const { event, minutesUntilStart } = alert;
  const lines = [
    `⏰ <b>Upcoming event</b>`,
    `<b>${escapeHtml(event.title)}</b> starts in ${minutesUntilStart} minutes.`,
    `Start time: ${formatTime(event.start)}`
  ];

  if (event.location) {
    lines.push(`Location: ${escapeHtml(event.location)}`);
  } else if (event.description) {
    lines.push(`Details: ${escapeHtml(event.description)}`);
  }

  return lines.join('\n');
}

async function markAlertsSent(alerts, state, now = new Date()) {
  const nextState = state || { sentAlerts: {} };
  pruneOldAlerts(nextState, now);

  for (const alert of alerts) {
    nextState.sentAlerts[alert.eventKey] = now.toISOString();
  }

  await fs.writeFile(ALERT_STATE_PATH, JSON.stringify(nextState, null, 2));
}

async function loadAlertState() {
  try {
    const raw = await fs.readFile(ALERT_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.sentAlerts || typeof parsed.sentAlerts !== 'object') {
      return { sentAlerts: {} };
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { sentAlerts: {} };
    }
    throw error;
  }
}

function pruneOldAlerts(state, now) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 2);

  for (const [eventKey, sentAt] of Object.entries(state.sentAlerts)) {
    const sentAtDate = new Date(sentAt);
    if (Number.isNaN(sentAtDate.valueOf()) || sentAtDate < cutoff) {
      delete state.sentAlerts[eventKey];
    }
  }
}

function getEventKey(event) {
  return [
    event.calendarName || '',
    event.title || '',
    event.start instanceof Date ? event.start.toISOString() : '',
    event.location || ''
  ].join('|');
}

function formatTime(value) {
  return value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getEnvNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  findUpcomingAlerts,
  formatAlertMessage,
  markAlertsSent
};
