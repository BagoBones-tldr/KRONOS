const { fetchEventsForDate } = require('./calendar-service');
const { buildDailyContext, generateBriefing } = require('./briefing-service');
const { fetchDailyWeather } = require('./weather-service');

async function buildCommandResponse(commandText, now = new Date()) {
  const { command, args } = normalizeCommand(commandText);

  if (command === '/help' || command === '/start' || command === '') {
    return buildHelpResponse();
  }

  if (command === '/today') {
    return buildDailyBriefing(now);
  }

  if (command === '/tomorrow') {
    const tomorrow = addDays(now, 1);
    return buildDailyBriefing(tomorrow);
  }

  if (command === '/free') {
    return buildFreeTimeResponse(now);
  }

  if (command === '/next') {
    return buildNextEventResponse(now);
  }

  if (command === '/weather') {
    return buildWeatherResponse(now);
  }

  if (command === '/events') {
    return buildEventsResponse(now);
  }

  if (command === '/conflicts') {
    return buildConflictsResponse(now);
  }

  if (command === '/status') {
    return buildStatusResponse(now);
  }

  if (command === '/busy') {
    return buildBusyResponse(now);
  }

  if (command === '/focus') {
    return buildFocusResponse(now);
  }

  if (command === '/week') {
    return buildWeekResponse(now);
  }

  if (command === '/whenis') {
    return buildWhenIsResponse(now, args);
  }

  return buildHelpResponse();
}

async function buildDailyBriefing(targetDate) {
  const [events, weather] = await Promise.all([
    fetchEventsForDate(targetDate),
    fetchDailyWeather(targetDate).catch(() => null)
  ]);
  const context = buildDailyContext(events, targetDate, weather);
  return generateBriefing(context);
}

async function buildFreeTimeResponse(targetDate) {
  const events = await fetchEventsForDate(targetDate);
  const context = buildDailyContext(events, targetDate, null);

  if (context.schedule.freeBlocks.length === 0) {
    return `No free blocks found for ${context.dateLabel}.`;
  }

  const lines = [`Free blocks for ${context.dateLabel}:`];
  for (const block of context.schedule.freeBlocks) {
    lines.push(
      `• ${formatTime(block.start)} to ${formatTime(block.end)} ` +
      `(${block.durationMinutes} minutes)`
    );
  }
  return lines.join('\n');
}

async function buildNextEventResponse(targetDate) {
  const events = await fetchEventsForDate(targetDate);
  const context = buildDailyContext(events, targetDate, null);
  const nextEvent = context.schedule.nextEvent;

  if (!nextEvent) {
    return `No more events remain for ${context.dateLabel}.`;
  }

  const lines = [
    `Next event for ${context.dateLabel}:`,
    `<b>${escapeHtml(nextEvent.title)}</b> at ${formatTime(nextEvent.start)}`
  ];

  if (context.schedule.minutesUntilNextEvent !== null) {
    lines.push(`Starts in ${context.schedule.minutesUntilNextEvent} minutes.`);
  }

  if (nextEvent.location) {
    lines.push(`Location: ${escapeHtml(nextEvent.location)}`);
  } else if (nextEvent.description) {
    lines.push(`Details: ${escapeHtml(nextEvent.description)}`);
  }

  return lines.join('\n');
}

async function buildWeatherResponse(targetDate) {
  const weather = await fetchDailyWeather(targetDate).catch(() => null);

  if (!weather) {
    return 'Weather is not configured yet. Add WEATHER_LATITUDE, WEATHER_LONGITUDE, and WEATHER_TIMEZONE to .env.';
  }

  const lines = [`Weather for ${targetDate.toDateString()}:`, formatWeather(weather)];
  return lines.join('\n');
}

async function buildEventsResponse(targetDate) {
  const events = await fetchEventsForDate(targetDate);

  if (events.length === 0) {
    return `No events found for ${targetDate.toDateString()}.`;
  }

  const lines = [`Events for ${targetDate.toDateString()}:`];
  for (const event of events) {
    let line = `• ${formatTime(event.start)} - ${escapeHtml(event.title)}`;
    if (event.location) {
      line += ` (${escapeHtml(event.location)})`;
    } else if (event.description) {
      line += ` (${escapeHtml(event.description)})`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

async function buildConflictsResponse(targetDate) {
  const events = await fetchEventsForDate(targetDate);
  const context = buildDailyContext(events, targetDate, null);

  if (context.schedule.conflicts.length === 0) {
    return `No schedule conflicts found for ${context.dateLabel}.`;
  }

  const lines = [`Conflicts for ${context.dateLabel}:`];
  for (const conflict of context.schedule.conflicts) {
    lines.push(
      `• ${escapeHtml(conflict.firstTitle)} overlaps with ${escapeHtml(conflict.secondTitle)} ` +
      `by ${conflict.overlapMinutes} minutes`
    );
  }

  return lines.join('\n');
}

async function buildStatusResponse(targetDate) {
  const weather = await fetchDailyWeather(targetDate).catch(() => null);
  const weatherConfigured = Boolean(
    process.env.WEATHER_LATITUDE &&
    process.env.WEATHER_LONGITUDE &&
    process.env.WEATHER_TIMEZONE
  );
  const alertsEnabled = Boolean(process.env.ALERT_LEAD_MINUTES || process.env.ALERT_WINDOW_MINUTES);

  let calendarOk = true;
  let eventCount = 0;
  let conflictCount = 0;

  try {
    const events = await fetchEventsForDate(targetDate);
    eventCount = events.length;
    const context = buildDailyContext(events, targetDate, null);
    conflictCount = context.schedule.conflicts.length;
  } catch (_error) {
    calendarOk = false;
  }

  return [
    'KRONOS status:',
    `Calendar access: ${calendarOk ? 'OK' : 'Error'}`,
    `Today event count: ${calendarOk ? eventCount : 'Unavailable'}`,
    `Conflict count: ${calendarOk ? conflictCount : 'Unavailable'}`,
    `Weather config: ${weatherConfigured ? 'Configured' : 'Missing config'}`,
    `Weather fetch: ${weather ? 'OK' : 'Unavailable'}`,
    `Alert config: ${alertsEnabled ? 'Configured' : 'Missing config'}`,
    'Command mode: Deterministic commands active'
  ].join('\n');
}

async function buildBusyResponse(targetDate) {
  const events = await fetchEventsForDate(targetDate);
  const context = buildDailyContext(events, targetDate, null);
  const freeMinutes = context.schedule.freeBlocks.reduce((total, block) => total + block.durationMinutes, 0);
  const openHours = Math.round((freeMinutes / 60) * 10) / 10;
  const busyHours = Math.round((context.schedule.busyMinutes / 60) * 10) / 10;

  return [
    `Busy summary for ${context.dateLabel}:`,
    `Events: ${context.schedule.totalEvents}`,
    `Busy time: ${busyHours} hours`,
    `Open time between events: ${openHours} hours`,
    `Conflicts: ${context.schedule.conflicts.length}`
  ].join('\n');
}

async function buildFocusResponse(targetDate) {
  const [events, weather] = await Promise.all([
    fetchEventsForDate(targetDate),
    fetchDailyWeather(targetDate).catch(() => null)
  ]);
  const context = buildDailyContext(events, targetDate, weather);

  const lines = [`Focus cue for ${context.dateLabel}:`, context.suggestedFocus];

  if (context.schedule.nextEvent && context.schedule.minutesUntilNextEvent !== null) {
    lines.push(
      `Next event: ${escapeHtml(context.schedule.nextEvent.title)} in ${context.schedule.minutesUntilNextEvent} minutes.`
    );
  }

  if (context.schedule.freeBlocks.length > 0) {
    const bestBlock = [...context.schedule.freeBlocks].sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
    lines.push(
      `Best open window: ${formatTime(bestBlock.start)} to ${formatTime(bestBlock.end)} ` +
      `(${bestBlock.durationMinutes} minutes).`
    );
  }

  return lines.join('\n');
}

async function buildWeekResponse(targetDate) {
  const lines = ['Next 7 days:'];

  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(targetDate, offset);
    const events = await fetchEventsForDate(day);
    const label = day.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    if (events.length === 0) {
      lines.push(`• ${label}: no events`);
      continue;
    }

    const firstEvent = events[0];
    lines.push(`• ${label}: ${events.length} event(s), first is ${escapeHtml(firstEvent.title)} at ${formatTime(firstEvent.start)}`);
  }

  return lines.join('\n');
}

async function buildWhenIsResponse(targetDate, args) {
  const query = args.trim();
  if (!query) {
    return 'Usage: /whenis &lt;keyword&gt;';
  }

  const events = await fetchEventsForDate(targetDate);
  const matches = events.filter(event => {
    const haystack = `${event.title} ${event.description} ${event.location}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  if (matches.length === 0) {
    return `No events matched "${escapeHtml(query)}" on ${targetDate.toDateString()}.`;
  }

  const lines = [`Matches for "${escapeHtml(query)}" on ${targetDate.toDateString()}:`];
  for (const event of matches) {
    let line = `• ${escapeHtml(event.title)} at ${formatTime(event.start)}`;
    if (event.location) {
      line += ` (${escapeHtml(event.location)})`;
    } else if (event.description) {
      line += ` (${escapeHtml(event.description)})`;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

function buildHelpResponse() {
  return [
    'Available commands:',
    '/today - Full schedule briefing for today',
    '/tomorrow - Preview tomorrow',
    '/next - Show the next upcoming event',
    '/events - Show today\'s events in order',
    '/free - Open time blocks for today',
    '/busy - Show total busy vs open time today',
    '/focus - Get a quick focus cue for today',
    '/weather - Show today\'s weather',
    '/week - Show a 7-day event snapshot',
    '/whenis &lt;keyword&gt; - Search today\'s events',
    '/conflicts - Show overlapping events for today',
    '/status - Show KRONOS system status',
    '/help - Show this command list'
  ].join('\n');
}

function normalizeCommand(commandText) {
  const raw = (commandText || '').trim().toLowerCase();
  if (!raw) {
    return { command: '', args: '' };
  }

  const [firstToken, ...rest] = raw.split(/\s+/);
  return {
    command: firstToken.split('@')[0],
    args: rest.join(' ')
  };
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatTime(value) {
  return value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatWeather(weather) {
  const segments = [escapeHtml(weather.summary)];
  if (weather.highTempF !== null) {
    segments.push(`high ${weather.highTempF}F`);
  }
  if (weather.lowTempF !== null) {
    segments.push(`low ${weather.lowTempF}F`);
  }
  if (weather.precipitationChance !== null) {
    segments.push(`${weather.precipitationChance}% precip`);
  }
  return segments.join(', ');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  buildCommandResponse
};
