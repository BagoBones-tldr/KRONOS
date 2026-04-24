const { fetchEventsForDate } = require('./calendar-service');
const { createCalendarEvent, removeCalendarEvent } = require('./calendar-write-service');
const { createReminder, listReminderLists, fetchPendingReminders, deleteReminder } = require('./reminder-service');
const {
  buildDailyContext,
  buildWrapUpContext,
  generateBriefingWithAi,
  generateWrapUpWithAi
} = require('./briefing-service');
const { buildLogSummary } = require('./log-service');
const { appendNote } = require('./obsidian-service');
const { fetchDailyWeather } = require('./weather-service');
const { generateAiConversation, generateAiFocus, isAiConfigured } = require('./ai-service');
const {
  loadPreferences,
  savePreferences,
  applyPreferenceUpdate,
  formatPreferences
} = require('./preference-state');
const {
  loadTaskState,
  saveTaskState,
  getOpenTasks,
  getCompletedTasks,
  addTask,
  completeTask,
  removeTask: removeTaskEntry,
  formatTaskLine
} = require('./task-state');

async function buildCommandResult(commandText, now = new Date(), conversationState = {}) {
  const preferences = await loadPreferences();
  const { command, args, originalText } = normalizeCommand(commandText, now, conversationState);

  try {
    if (command === '/commands' || command === '/help' || command === '/start') {
      return buildResult(buildHelpResponse(), command, originalText);
    }

    if (command === '/today') {
      return buildResult(await buildDailyBriefing(now, preferences), command, originalText);
    }

    if (command === '/tomorrow') {
      const tomorrow = addDays(now, 1);
      return buildResult(await buildDailyBriefing(tomorrow, preferences), command, originalText);
    }

    if (command === '/free') {
      return buildResult(await buildFreeTimeResponse(now, args), command, originalText);
    }

    if (command === '/next') {
      return buildResult(await buildNextEventResponse(now), command, originalText);
    }

    if (command === '/weather') {
      return buildResult(await buildWeatherResponse(now), command, originalText);
    }

    if (command === '/events') {
      return buildResult(await buildEventsResponse(now, args || originalText), command, originalText);
    }

    if (command === '/conflicts') {
      return buildResult(await buildConflictsResponse(now), command, originalText);
    }

    if (command === '/status') {
      return buildResult(await buildStatusResponse(now), command, originalText);
    }

    if (command === '/busy') {
      return buildResult(await buildBusyResponse(now), command, originalText);
    }

    if (command === '/focus') {
      return buildResult(await buildFocusResponse(now, preferences), command, originalText);
    }

    if (command === '/wrapup') {
      return buildResult(await buildWrapUpResponse(now), command, originalText);
    }

    if (command === '/log') {
      return buildResult(await buildLogResponse(), command, originalText);
    }

    if (command === '/week') {
      return buildResult(await buildWeekResponse(now), command, originalText);
    }

    if (command === '/whenis') {
      return buildResult(await buildWhenIsResponse(now, args), command, originalText);
    }

    if (command === '/availability') {
      return buildResult(await buildAvailabilityResponse(now, args || originalText), command, originalText);
    }

    if (command === '/add') {
      return buildResult(await buildCreateEventResponse(now, args || originalText), command, originalText);
    }

    if (command === '/remind') {
      return buildResult(await buildCreateReminderResponse(now, args || originalText), command, originalText);
    }

    if (command === '/reminderlists') {
      return buildResult(await buildReminderListsResponse(), command, originalText);
    }

    if (command === '/reminders') {
      return buildResult(await buildListRemindersResponse(), command, originalText);
    }

    if (command === '/cancelreminder' || command === '/deletereminder') {
      return buildResult(await buildCancelReminderResponse(args || originalText), command, originalText);
    }

    if (command === '/remove' || command === '/delete') {
      return buildResult(await buildRemoveEventResponse(now, args || originalText), command, originalText);
    }

    if (command === '/tasks' || command === '/todo') {
      return buildResult(await buildTasksResponse(), command, originalText);
    }

    if (command === '/task') {
      return buildResult(await buildAddTaskResponse(now, args || originalText), command, originalText);
    }

    if (command === '/done') {
      return buildResult(await buildCompleteTaskResponse(args || originalText), command, originalText);
    }

    if (command === '/untask') {
      return buildResult(await buildRemoveTaskResponse(args || originalText), command, originalText);
    }

    if (command === '/remember') {
      return buildResult(await buildRememberResponse(args || originalText, preferences), command, originalText);
    }

    if (command === '/note') {
      return buildResult(await buildNoteResponse(args || originalText), command, originalText);
    }

    if (command === '/preferences') {
      return buildResult(buildPreferencesResponse(preferences), command, originalText);
    }

    if (command === '') {
      const localConversation = buildLocalConversationReply(originalText || commandText);
      if (localConversation) {
        return buildResult(localConversation, command, originalText);
      }

      const conversational = await buildConversationalFallback(originalText || commandText, now, conversationState, preferences);
      if (conversational) {
        return buildResult(conversational, command, originalText);
      }
      return buildResult(buildHelpResponse(), command, originalText);
    }

    return buildResult(buildHelpResponse(), command, originalText);
  } catch (error) {
    console.warn(`Command failed (${command || 'unknown'}):`, error);
    if (command === '/add' && /writable calendar|status 403/i.test(error.message)) {
      return buildResult([
        'KRONOS understood the event request, but iCloud rejected the write.',
        'This usually means the selected calendar is not writable through CalDAV.',
        'Set DEFAULT_CALENDAR_NAME in .env to a writable calendar name and try again.'
      ].join('\n'), command, originalText);
    }

    if (command === '/remind' && /writable.*reminders list|status 403|No Apple Reminders list/i.test(error.message)) {
      return buildResult([
        'KRONOS understood the reminder request, but iCloud rejected the write.',
        'This usually means the selected Apple Reminders list is not writable through CalDAV.',
        'Set APPLE_REMINDERS_LIST in .env to a writable reminders list name and try again.'
      ].join('\n'), command, originalText);
    }

    if ((command === '/remove' || command === '/delete') && /multiple events matched/i.test(error.message)) {
      return buildResult(error.message, command, originalText);
    }

    if ((command === '/remove' || command === '/delete') && /recurring event protection/i.test(error.message)) {
      return buildResult(error.message, command, originalText);
    }

    if ((command === '/remove' || command === '/delete') && /no calendar event matched/i.test(error.message)) {
      return buildResult(error.message, command, originalText);
    }

    return buildResult(buildCommandErrorResponse(command), command, originalText);
  }
}

async function buildCommandResponse(commandText, now = new Date(), conversationState = {}) {
  const result = await buildCommandResult(commandText, now, conversationState);
  return result.text;
}

async function buildDailyBriefing(targetDate, preferences = {}) {
  const [events, weather] = await Promise.all([
    fetchEventsForDate(targetDate),
    fetchDailyWeather(targetDate).catch(() => null)
  ]);
  const context = buildDailyContext(events, targetDate, weather);
  context.preferences = preferences;
  return generateBriefingWithAi(context);
}

async function buildFreeTimeResponse(targetDate, args = '') {
  const resolvedDate = resolveTargetDateFromArgs(args, targetDate) || targetDate;
  const events = await fetchEventsForDate(resolvedDate);
  const context = buildDailyContext(events, resolvedDate, null);

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

async function buildAvailabilityResponse(now, input) {
  const request = parseAvailabilityRequest(input, now);
  if (!request) {
    return 'Try something like "am I free tomorrow at 3pm?" or "when am I free Friday?"';
  }

  if (!request.time) {
    return buildFreeTimeResponse(request.date, '');
  }

  const events = await fetchEventsForDate(request.date);
  const requestEnd = new Date(request.time.getTime() + request.durationMinutes * 60000);
  const overlapping = events.find(event => event.end && request.time < event.end && requestEnd > event.start);

  if (!overlapping) {
    return `Yes, you appear free on ${request.date.toDateString()} at ${formatTime(request.time)} for about ${request.durationMinutes} minutes.`;
  }

  return [
    `Not fully free on ${request.date.toDateString()} at ${formatTime(request.time)}.`,
    `It overlaps with ${escapeHtml(overlapping.title)} from ${formatTime(overlapping.start)} to ${formatTime(overlapping.end)}.`
  ].join('\n');
}

async function buildCreateEventResponse(now, input) {
  const details = parseCreateEventRequest(input, now) || parseCreateEventRequest(`/add ${String(input || '').trim()}`, now);
  if (!details) {
    return 'Try something like "add workout tomorrow at 3pm for 1 hour" or "schedule nutrition Friday at 12:15pm for 45 minutes."';
  }

  const created = await createCalendarEvent(details);
  const durationMinutes = Math.round((created.end - created.start) / 60000);

  setTimeout(() => require('child_process').exec('osascript -e \'tell application "Calendar" to reload calendars\''), 3000);

  return [
    `Added ${escapeHtml(created.title)} to ${escapeHtml(created.calendarName)}.`,
    `${created.start.toDateString()} at ${formatTime(created.start)} for ${durationMinutes} minutes.`
  ].join('\n');
}

async function buildCreateReminderResponse(now, input) {
  const details = parseReminderRequest(input, now) || parseReminderRequest(`/remind ${String(input || '').trim()}`, now);
  if (!details) {
    return 'Try something like "remind me to call mom in 2 hours" or "/remind submit essay tomorrow at 9am".';
  }

  const reminder = await createReminder(details);
  return [
    `Reminder added to ${escapeHtml(reminder.listName)}.`,
    `${escapeHtml(reminder.title)} due ${reminder.dueDate.toDateString()} at ${formatTime(reminder.dueDate)}.`
  ].join('\n');
}

async function buildReminderListsResponse() {
  const lists = await listReminderLists();
  if (lists.length === 0) {
    return 'KRONOS could not find any Apple Reminders lists through CalDAV.';
  }

  const lines = ['Apple Reminders lists KRONOS can see:'];
  for (const list of lists) {
    lines.push(`• ${escapeHtml(list.displayName || 'Unnamed list')}`);
  }

  return lines.join('\n');
}

async function buildListRemindersResponse() {
  const pending = await fetchPendingReminders();
  if (pending.length === 0) {
    return 'No pending reminders.';
  }

  const lines = ['<b>Pending reminders:</b>'];
  for (const { vtodo } of pending) {
    const dueStr = vtodo.due ? `due ${vtodo.due.toDateString()} at ${formatTime(vtodo.due)}` : 'no due time';
    lines.push(`• ${escapeHtml(vtodo.title || 'Untitled')} — ${dueStr}`);
  }
  lines.push('\nTo cancel one: "cancel reminder [title]"');
  return lines.join('\n');
}

async function buildCancelReminderResponse(input) {
  const query = String(input || '')
    .replace(/^(?:cancel|delete|remove)\s+(?:reminder\s+)?/i, '')
    .trim();

  if (!query) {
    return 'Tell me which reminder to cancel — try "cancel reminder [title]".';
  }

  const pending = await fetchPendingReminders();
  if (pending.length === 0) {
    return 'No pending reminders to cancel.';
  }

  const match = pending.find(({ vtodo }) =>
    vtodo.title && vtodo.title.toLowerCase().includes(query.toLowerCase())
  );

  if (!match) {
    const list = pending.map(({ vtodo }) => `• ${escapeHtml(vtodo.title || 'Untitled')}`).join('\n');
    return `No reminder matched "${escapeHtml(query)}". Pending reminders:\n${list}`;
  }

  await deleteReminder(match.calendarObject);
  return `Cancelled reminder: <b>${escapeHtml(match.vtodo.title)}</b>.`;
}

async function buildRemoveEventResponse(now, input) {
  const details = parseRemoveEventRequest(input, now) || parseRemoveEventRequest(`/remove ${String(input || '').trim()}`, now);
  if (!details) {
    return 'Try something like "remove workout tomorrow at 3pm" or "delete nutrition Friday".';
  }

  const removed = await removeCalendarEvent(details);
  return [
    `Removed ${escapeHtml(removed.title)} from ${escapeHtml(removed.calendarName)}.`,
    `${removed.start.toDateString()} at ${formatTime(removed.start)}.`
  ].join('\n');
}

async function buildTasksResponse() {
  const state = await loadTaskState();
  const tasks = getOpenTasks(state);

  if (tasks.length === 0) {
    return 'No open tasks right now. Clean slate.';
  }

  const lines = ['Open tasks:'];
  for (const task of tasks.slice(0, 12)) {
    lines.push(formatTaskLine(task));
  }

  if (tasks.length > 12) {
    lines.push(`• Plus ${tasks.length - 12} more`);
  }

  return lines.join('\n');
}

async function buildAddTaskResponse(now, input) {
  const details = parseTaskCreateRequest(input, now) || parseTaskCreateRequest(`/task ${String(input || '').trim()}`, now);
  if (!details) {
    return 'Try something like "add a task to buy groceries tomorrow" or "add this assignment for psych due friday at 11:59pm".';
  }

  const state = await loadTaskState();
  const task = addTask(state, details.description, details.dueDate, {
    className: details.className || null
  });
  await saveTaskState(state);

  const classLabel = task.className ? ` for ${task.className}` : '';
  const dueLabel = task.dueDate ? ` due ${formatDueTask(new Date(task.dueDate))}` : '';
  return `Task added: ${escapeHtml(task.description)}${escapeHtml(classLabel)}${escapeHtml(dueLabel)}.`;
}

async function buildCompleteTaskResponse(input) {
  const details = parseTaskCompleteRequest(input) || parseTaskCompleteRequest(`/done ${String(input || '').trim()}`);
  if (!details) {
    return 'Try something like "mark buy groceries done" or "/done finish the essay".';
  }

  const state = await loadTaskState();
  const task = completeTask(state, details.query);
  await saveTaskState(state);
  return `Completed: ${escapeHtml(task.description)}.`;
}

async function buildRemoveTaskResponse(input) {
  const details = parseTaskRemoveRequest(input) || parseTaskRemoveRequest(`/untask ${String(input || '').trim()}`);
  if (!details) {
    return 'Try something like "remove task buy groceries" or "/untask finish the essay".';
  }

  const state = await loadTaskState();
  const task = removeTaskEntry(state, details.query);
  await saveTaskState(state);
  return `Removed task: ${escapeHtml(task.description)}.`;
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
    return 'Weather unavailable. Auto-detection may have failed — check your network connection.';
  }

  const lines = [`Weather for ${targetDate.toDateString()}:`, formatWeather(weather)];
  return lines.join('\n');
}

async function buildEventsResponse(targetDate, args = '') {
  const resolvedDate = resolveTargetDateFromArgs(args, targetDate) || targetDate;
  const events = await fetchEventsForDate(resolvedDate);

  if (events.length === 0) {
    return `No events found for ${resolvedDate.toDateString()}.`;
  }

  const lines = [`Events for ${resolvedDate.toDateString()}:`];
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
    `Source: ${getInstanceLabel()}`,
    `Calendar access: ${calendarOk ? 'OK' : 'Error'}`,
    `Today event count: ${calendarOk ? eventCount : 'Unavailable'}`,
    `Conflict count: ${calendarOk ? conflictCount : 'Unavailable'}`,
    `Weather: ${weather ? 'OK (auto-detected)' : 'Unavailable'}`,
    `Alert config: ${alertsEnabled ? 'Configured' : 'Missing config'}`,
    `Brain: ${isAiConfigured() ? 'Anthropic connected' : 'Not configured'}`,
    `Command mode: ${isAiConfigured() ? 'Hybrid deterministic + AI' : 'Deterministic commands active'}`
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

async function buildFocusResponse(targetDate, preferences = {}) {
  const [events, weather] = await Promise.all([
    fetchEventsForDate(targetDate),
    fetchDailyWeather(targetDate).catch(() => null)
  ]);
  const context = buildDailyContext(events, targetDate, weather);
  context.preferences = preferences;

  try {
    const aiFocus = await generateAiFocus(context);
    if (aiFocus) {
      return aiFocus;
    }
  } catch (error) {
    console.warn('AI focus failed:', error.message);
  }

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

async function buildLogResponse() {
  return buildLogSummary();
}

async function buildWrapUpResponse(targetDate) {
  const [events, taskState] = await Promise.all([
    fetchEventsForDate(targetDate),
    loadTaskState()
  ]);

  const context = buildWrapUpContext(events, targetDate, {
    allTasks: taskState.tasks || [],
    openTasks: getOpenTasks(taskState),
    completedTasks: getCompletedTasks(taskState)
  });

  return generateWrapUpWithAi(context);
}

async function buildRememberResponse(input, preferences) {
  const update = parsePreferenceUpdate(input);
  if (!update) {
    return 'Try something like "remember that I prefer evening workouts" or "my preferred workout time is 6pm."';
  }

  const nextPreferences = applyPreferenceUpdate(preferences, update);
  await savePreferences(nextPreferences);
  return update.confirmation || 'Locked in. I’ll remember that going forward.';
}

async function buildNoteResponse(input) {
  const text = String(input || '').trim();
  if (!text) {
    return 'What do you want to log? Try "/note picked up hardware today".';
  }
  try {
    appendNote(text);
    return `Logged to today's journal.`;
  } catch (err) {
    return `Couldn't write to Obsidian: ${err.message}`;
  }
}

function buildPreferencesResponse(preferences) {
  const lines = formatPreferences(preferences);
  if (lines.length === 0) {
    return 'No saved preferences yet. Tell me something explicit to remember and I’ll keep it.';
  }

  return ['Saved preferences:', ...lines.map(line => `• ${escapeHtml(line)}`)].join('\n');
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
    '/commands - Show this command list',
    '/add - Add a calendar event from a phrase like "add workout tomorrow at 3pm for 1 hour"',
    '/remind - Add an Apple Reminder from a phrase like "remind me to call mom in 2 hours"',
    '/reminderlists - Show which Apple Reminders lists KRONOS can see',
    '/remove - Remove a calendar event from a phrase like "remove workout tomorrow at 3pm"',
    '/delete - Alias for /remove',
    '/remember - Save an explicit preference or note for KRONOS',
    '/note - Append a timestamped entry to today\'s Obsidian journal',
    '/preferences - Show saved preferences KRONOS remembers',
    '/tasks - Show open tasks',
    '/task - Add a task from a phrase like "/task finish the essay tomorrow"',
    '/done - Mark a task complete',
    '/untask - Remove a task without completing it',
    '/wrapup - End-of-day summary with completed, open, and due-next tasks',
    '/availability - Check if you are free at a time or ask when you are free on a day',
    '/today - Full schedule briefing for today',
    '/tomorrow - Preview tomorrow',
    '/next - Show the next upcoming event',
    '/events - Show today\'s events in order',
    '/free - Open time blocks for today',
    '/busy - Show total busy vs open time today',
    '/focus - Get a quick focus cue for today',
    '/log - Show a KRONOS development summary',
    '/weather - Show today\'s weather',
    '/week - Show a 7-day event snapshot',
    '/whenis &lt;keyword&gt; - Search today\'s events',
    '/conflicts - Show overlapping events for today',
    '/status - Show KRONOS system status',
    '/help - Alias for /commands'
  ].join('\n');
}

function normalizeCommand(commandText, now = new Date(), conversationState = {}) {
  const original = String(commandText || '').trim();
  const raw = original.toLowerCase();
  if (!raw) {
    return { command: '', args: '', originalText: original };
  }

  if (!raw.startsWith('/')) {
    return {
      ...inferNaturalLanguageCommand(original, now, conversationState),
      originalText: original
    };
  }

  const [firstToken, ...rest] = raw.split(/\s+/);
  return {
    command: firstToken.split('@')[0],
    args: rest.join(' '),
    originalText: original
  };
}

function inferNaturalLanguageCommand(input, now = new Date(), conversationState = {}) {
  const normalized = input
    .toLowerCase()
    .replace(/[?!.,"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const likelyIntentRequest = isLikelyIntentRequest(input, normalized);

  if (!normalized) {
    return { command: '', args: '' };
  }

  if (parseTaskCreateRequest(input, now)) {
    return { command: '/task', args: input };
  }

  if (parseTaskCompleteRequest(input)) {
    return { command: '/done', args: input };
  }

  if (parseTaskRemoveRequest(input)) {
    return { command: '/untask', args: input };
  }

  if (parseReminderRequest(input, now)) {
    return { command: '/remind', args: input };
  }

  if (parseCreateEventRequest(input, now)) {
    return { command: '/add', args: input };
  }

  if (parseRemoveEventRequest(input, now)) {
    return { command: '/remove', args: input };
  }

  if (parsePreferenceUpdate(input)) {
    return { command: '/remember', args: input };
  }

  if (isNarrativeConversation(normalized)) {
    return { command: '', args: '' };
  }

  if (parseAvailabilityRequest(input, now)) {
    return { command: '/availability', args: input };
  }

  if (
    normalized === 'help' ||
    normalized === 'commands' ||
    normalized === 'show commands' ||
    normalized === 'command list'
  ) {
    return { command: '/commands', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'status', 'are you up', 'are you online', 'how are you doing',
    'you good', 'check in', 'ping', 'system status',
    'how are things', 'everything good', 'you running', 'all good'
  ])) {
    return { command: '/status', args: '' };
  }

  if (
    normalized === 'tomorrow' ||
    (likelyIntentRequest && matchesAny(normalized, [
    'whats tomorrow look like',
    "what's tomorrow look like",
    'what does tomorrow look like',
    'how does tomorrow look',
    'show me tomorrow',
    'show tomorrow',
    'tomorrows schedule',
    "tomorrow's schedule",
    'help me plan tomorrow',
    'can you help me plan tomorrow',
    'walk me through tomorrow',
    'run me through tomorrow',
    'lay out tomorrow',
    'give me tomorrow',
    'whats on deck for tomorrow',
    "what's on deck for tomorrow",
    'what am i working with tomorrow',
    'anything on tomorrow',
    'anything going on tomorrow',
    'how does my tomorrow look',
    'what am i into tomorrow',
    'what do i have tomorrow',
    'preview tomorrow',
    'pull up tomorrow'
  ])) || (
    likelyIntentRequest &&
    normalized.includes('tomorrow') &&
    (
      normalized.includes('schedule') ||
      normalized.includes('plan') ||
      normalized.includes('look like') ||
      normalized.includes('show me') ||
      normalized.includes('walk me through') ||
      normalized.includes('run me through') ||
      normalized.includes('lay out') ||
      normalized.includes('on deck') ||
      normalized.includes('working with')
    )
  )) {
    return { command: '/tomorrow', args: '' };
  }

  if (
    normalized === 'today' ||
    (likelyIntentRequest && matchesAny(normalized, [
    'whats today look like',
    "what's today look like",
    'what does today look like',
    'show me today',
    'todays schedule',
    "today's schedule",
    'help me plan today',
    'can you help me plan today',
    'plan my day',
    'help me with today',
    'walk me through today',
    'run me through today',
    'lay out my day',
    'give me today',
    'whats on my plate',
    "what's on my plate",
    'what am i working with today',
    'hit me with today',
    'what does my day look like',
    'how does my day look',
    'anything today',
    'what am i doing today',
    'what am i into today',
    'what do i have today',
    'what do i have going on today',
    'whats going on today',
    "what's going on today",
    'how busy is today',
    'pull up today',
    'bring up today'
  ])) || (
    likelyIntentRequest &&
    normalized.includes('today') &&
    (
      normalized.includes('schedule') ||
      normalized.includes('plan') ||
      normalized.includes('look like') ||
      normalized.includes('show me') ||
      normalized.includes('walk me through') ||
      normalized.includes('run me through') ||
      normalized.includes('lay out') ||
      normalized.includes('on my plate') ||
      normalized.includes('working with') ||
      normalized.includes('going on')
    )
  )) {
    return { command: '/today', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'free time',
    'when am i free',
    'what am i free',
    'open time',
    'when do i have free time',
    'when do i have time',
    'where do i have time',
    'do i have any time today',
    'any gaps',
    'any breathing room',
    'any breaks today',
    'when do i have a break',
    'any open pockets',
    'any windows',
    'any open time',
    'pockets of time',
    'open blocks',
    'free blocks',
    'any free blocks',
    'when am i available',
    'when am i open',
    'what time am i free',
    'do i have any gaps'
  ])) {
    return { command: '/free', args: normalized };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'next event',
    'what is next',
    'whats next',
    "what's next",
    'what do i have next',
    'what is my next event',
    'what am i doing next',
    'whats coming up',
    "what's coming up",
    'what comes next',
    'next up',
    'first thing up',
    'what am i heading into',
    'what do i have coming up',
    'what is coming',
    'what am i walking into',
    'coming up next',
    'hit me with next'
  ])) {
    return { command: '/next', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'weather',
    'what is the weather',
    'whats the weather',
    "what's the weather",
    'forecast',
    'what is it like outside',
    'hows the weather',
    "how's the weather",
    'weather check',
    'is it going to rain',
    'will it rain',
    'is it raining',
    'should i bring a jacket',
    'whats it like outside',
    "what's it like outside",
    'is it cold out',
    'is it hot out',
    'temperature today',
    'whats the forecast',
    "what's the forecast",
    'any rain today',
    'weather today'
  ])) {
    return { command: '/weather', args: '' };
  }

  if (
    (likelyIntentRequest && matchesAny(normalized, [
      'events', 'list my events', 'show my events', 'what events do i have',
      'whats going on', "what's going on", 'whats on', "what's on",
      'what do i have going on', 'anything going on', 'anything on my calendar',
      'whats on my calendar', "what's on my calendar", 'show my calendar',
      'list events', 'pull up my calendar', 'check my calendar'
    ])) ||
    (
      likelyIntentRequest &&
      extractDateReference(normalized) &&
      (
        normalized.includes('show me my') ||
        normalized.includes('show me') ||
        normalized.includes('what do i have') ||
        normalized.includes('what is on my') ||
        normalized.includes("what's on my") ||
        normalized.includes('what is on my calendar') ||
        normalized.includes("what's on my calendar") ||
        normalized.includes('on my calendar') ||
        normalized.includes('my schedule') ||
        normalized.includes('going on') ||
        normalized.includes('anything on') ||
        normalized.includes('what am i doing')
      )
    )
  ) {
    return { command: '/events', args: extractDateReference(normalized) || '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'conflicts', 'overlaps', 'do i have conflicts', 'any conflicts',
    'any overlaps', 'am i double booked', 'double booked',
    'any scheduling conflicts', 'overlapping events', 'any clashes',
    'schedule conflicts', 'do my events overlap'
  ])) {
    return { command: '/conflicts', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'busy',
    'how busy am i',
    'am i busy today',
    'how packed is today',
    'is today packed',
    'do i have a busy day',
    'how loaded am i',
    'how packed is my day',
    'is it a heavy day',
    'heavy day today',
    'light day today',
    'how full is my day',
    'packed day',
    'am i slammed',
    'how slammed am i',
    'what does my load look like',
    'is today heavy',
    'do i have room today',
    'breathing room today'
  ])) {
    return { command: '/busy', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'focus',
    'what should i focus on',
    'what should i work on',
    'give me a focus cue',
    'what should i prioritize',
    'what should i be working on',
    'what matters most today',
    'what should i tackle',
    'what should i tackle first',
    'where should i start',
    'whats most important',
    "what's most important",
    "what's the priority",
    'what should i prioritize right now',
    'help me focus',
    'what do i work on',
    'what do i work on first',
    'best use of my time',
    'where should i put my energy',
    'what are my priorities',
    'top priority today'
  ])) {
    return { command: '/focus', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'week', 'this week',
    'what does this week look like', 'whats this week look like', "what's this week look like",
    'how does the week look', 'what does my week look like', 'run me through the week',
    'give me the week', 'whats on for the week', "what's on for the week",
    'preview the week', 'what am i working with this week', 'how does my week look',
    'lay out the week', 'weekly view', 'weekly overview'
  ])) {
    return { command: '/week', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'log', 'development log', 'show me the log', 'how has kronos changed',
    'changelog', 'whats new', "what's new", 'recent updates',
    'update history', 'kronos history', 'what has changed', 'show changes'
  ])) {
    return { command: '/log', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'preferences', 'show my preferences', 'what do you remember', 'what do you remember about me',
    'my settings', 'what have you learned about me', 'what do you know about me',
    'saved preferences', 'what have you saved', 'what are my preferences'
  ])) {
    return { command: '/preferences', args: '' };
  }

  const notePatterns = [
    /^(?:log|note|journal)\s+(.+)/i,
    /^make\s+a\s+note(?:\s+(?:about|that|saying|regarding))?\s+(.+)/i,
    /^jot(?:\s+down)?\s+(?:that\s+)?(.+)/i,
    /^write\s+(?:a\s+)?note(?:\s+(?:about|that|saying))?\s+(.+)/i,
    /^record(?:\s+(?:this|that))?\s*[:\-]?\s*(.+)/i,
    /^add\s+(?:a\s+)?(?:note|journal\s+entry)\s*[:\-]?\s*(.+)/i,
  ];
  const noteMatch = notePatterns.reduce((found, p) => found || normalized.match(p), null);
  if (noteMatch?.[1]) {
    return { command: '/note', args: noteMatch[1].trim() };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'tasks', 'my tasks', 'todo', 'to do', 'what are my tasks', 'what do i need to do',
    'task list', 'my todo list', 'whats on my list', "what's on my list",
    'open tasks', 'active tasks', 'pending tasks', 'what tasks do i have',
    'show me my tasks', 'list my tasks'
  ])) {
    return { command: '/tasks', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, ['reminder lists', 'what reminder lists do you see'])) {
    return { command: '/reminderlists', args: '' };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'my reminders', 'show reminders', 'list reminders', 'what reminders do i have', 'pending reminders',
    'active reminders', 'do i have any reminders', 'reminders', 'show my reminders',
    'whats on my reminders', "what's on my reminders", 'any reminders'
  ])) {
    return { command: '/reminders', args: '' };
  }

  const cancelReminderMatch = normalized.match(/^(?:cancel|delete|remove)\s+(?:my\s+)?(?:reminder|alarm)\s+(.+)/i)
    || normalized.match(/^cancel\s+(.+?)\s+reminder$/i);
  if (cancelReminderMatch?.[1]) {
    return { command: '/cancelreminder', args: cancelReminderMatch[1].trim() };
  }

  if (likelyIntentRequest && matchesAny(normalized, [
    'wrap up my day', 'end of day summary', 'how did today go', 'wrapup', 'wrap up',
    'how was today', 'wrap it up', 'close out today', 'end of day',
    'how did the day go', 'daily wrap', 'day wrap', 'recap today',
    'summarize my day', 'daily recap', 'that was today'
  ])) {
    return { command: '/wrapup', args: '' };
  }

  const whenIsMatch = likelyIntentRequest ? (
    normalized.match(/(?:when is|when's|whens|when does)\s+(.+?)(?:\s+(?:start|begin|happen))?$/) ||
    normalized.match(/(?:what time (?:is|does))\s+(.+?)(?:\s+(?:start|begin))?$/)
  ) : null;
  if (whenIsMatch?.[1]) {
    return { command: '/whenis', args: whenIsMatch[1].trim() };
  }

  const followUp = inferFollowUpCommand(normalized, conversationState, now);
  if (followUp) {
    return followUp;
  }

  return { command: '', args: '' };
}

function matchesAny(input, patterns) {
  return patterns.some(pattern => input.includes(pattern));
}

function pick(...options) {
  return options[Math.floor(Math.random() * options.length)];
}

function isNarrativeConversation(normalized) {
  return /^(?:i am|i'm|im|i feel|i felt|i think|i thought|i was|today was|today is|tomorrow is|it was|it is|that was|that is)\b/.test(normalized);
}

function isLikelyIntentRequest(input, normalized) {
  const original = String(input || '').trim();
  const wordCount = normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;

  if (!normalized) {
    return false;
  }

  if (original.includes('?')) {
    return true;
  }

  if (wordCount <= 4) {
    return true;
  }

  return /^(what|whats|what's|when|where|show|list|help|plan|am|do|can|wrap|focus|status|weather|events|busy|free|next|log|tasks|remember|preferences|tell|give|pull|check|look|find|get|how|any|is|run|bring|lay|hit|throw|got)\b/.test(normalized)
    || /^(am|will|do)\s+i\b/.test(normalized)
    || /^is\s+there\b/.test(normalized);
}

function resolveTargetDateFromArgs(args, fallbackDate) {
  if (!args) {
    return fallbackDate;
  }

  const extracted = extractDateReference(String(args));
  return parseDateReference(extracted || String(args), fallbackDate) || fallbackDate;
}

function parseCreateEventRequest(input, now) {
  const text = normalizeCreateEventRequestInput(input);
  const addPrefix = String.raw`(?:\/add\s+|add\s+|create\s+|schedule\s+|book\s+|put\s+|set\s+(?:an?\s+)?(?:alarm|event|reminder|meeting)?\s*)`;
  const atMatch = text.match(new RegExp(`^${addPrefix}(.+?)\\s+(?:on\\s+|for\\s+)?(today|tomorrow|next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))(?:\\s+for\\s+(\\d+)\\s*(minutes?|minute|hours?|hrs?|hr))?$`, 'i'));
  if (atMatch) {
    const [, rawTitle, rawDate, rawTime, rawAmount, rawUnit] = atMatch;
    const date = parseDateReference(rawDate, now);
    const start = parseTimeOnDate(rawTime, date);

    if (!date || !start) {
      return null;
    }

    const durationMinutes = parseDurationMinutes(rawAmount, rawUnit);
    return {
      title: normalizeCreateEventTitle(rawTitle),
      start,
      end: new Date(start.getTime() + durationMinutes * 60000)
    };
  }

  const timeFirstAtMatch = text.match(new RegExp(`^${addPrefix}(?:my\\s+|the\\s+)?(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))\\s+(.+?)\\s+(?:on\\s+)?(today|tomorrow|next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\\s+for\\s+(\\d+)\\s*(minutes?|minute|hours?|hrs?|hr))?$`, 'i'));
  if (timeFirstAtMatch) {
    const [, rawTime, rawTitle, rawDate, rawAmount, rawUnit] = timeFirstAtMatch;
    const date = parseDateReference(rawDate, now);
    const start = parseTimeOnDate(rawTime, date);

    if (!date || !start) {
      return null;
    }

    const durationMinutes = parseDurationMinutes(rawAmount, rawUnit);
    return {
      title: normalizeCreateEventTitle(rawTitle),
      start,
      end: new Date(start.getTime() + durationMinutes * 60000)
    };
  }

  const dateGroup = String.raw`(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)`;
  const timeToken = String.raw`\d{1,2}(?::\d{2})?\s*(?:am|pm)?`;

  const fromToMatch = text.match(new RegExp(`^${addPrefix}(.+?)\\s+from\\s+(${timeToken})\\s+to\\s+(${timeToken})(?:\\s+(?:for|on)?\\s*${dateGroup})?$`, 'i'));
  if (fromToMatch) {
    const [, rawTitle, rawStartTime, rawEndTime, rawDate] = fromToMatch;
    const date = parseDateReference(rawDate || 'today', now);
    const start = parseTimeOnDate(rawStartTime, date);
    const end = parseTimeOnDate(rawEndTime, date);

    if (!date || !start || !end || end <= start) {
      return null;
    }

    return {
      title: normalizeCreateEventTitle(rawTitle),
      start,
      end
    };
  }

  // "add title [on/for] day at startTime-endTime" — dash-separated time range with "at" prefix
  const atDashRangeMatch = text.match(new RegExp(`^${addPrefix}(.+?)\\s+(?:on\\s+|for\\s+)?${dateGroup}\\s+at\\s+(${timeToken})-(${timeToken})$`, 'i'));
  if (atDashRangeMatch) {
    const [, rawTitle, rawDate, rawStartTime, rawEndTime] = atDashRangeMatch;
    const date = parseDateReference(rawDate, now);
    const start = parseTimeOnDate(rawStartTime, date);
    const end = parseTimeOnDate(rawEndTime, date);

    if (!date || !start || !end || end <= start) {
      return null;
    }

    return {
      title: normalizeCreateEventTitle(rawTitle),
      start,
      end
    };
  }

  // "set alarm/event from X:XX-X:XX [day]" — dash-separated time range, date optional (defaults today)
  const dashRangeMatch = text.match(new RegExp(`^${addPrefix}(?:(.+?)\\s+)?from\\s+(${timeToken})-(${timeToken})(?:\\s+(?:on\\s+)?${dateGroup})?$`, 'i'));
  if (dashRangeMatch) {
    const [, rawTitle, rawStartTime, rawEndTime, rawDate] = dashRangeMatch;
    const date = parseDateReference(rawDate || 'today', now);
    const start = parseTimeOnDate(rawStartTime, date);
    const end = parseTimeOnDate(rawEndTime, date);

    if (!date || !start || !end || end <= start) {
      return null;
    }

    if (!rawTitle || !rawTitle.trim()) {
      return null;
    }

    return {
      title: normalizeCreateEventTitle(rawTitle),
      start,
      end
    };
  }

  return null;
}

function parseTaskCreateRequest(input, now) {
  const text = String(input || '').trim();
  const assignmentMatch = text.match(/^(?:\/task\s+|add(?:\s+this)?\s+assignment\s+|track(?:\s+this)?\s+assignment\s+)(.+?)\s+for\s+(.+?)\s+due(?:\s+on)?\s+(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)))?$/i);
  if (assignmentMatch) {
    const [, rawDescription, rawClassName, rawDate, rawTime] = assignmentMatch;
    const baseDate = parseDateReference(rawDate, now);
    const dueDate = rawTime ? parseTimeOnDate(rawTime, baseDate) : baseDate;

    if (!baseDate || (rawTime && !dueDate)) {
      return null;
    }

    return {
      description: normalizeTaskDescription(rawDescription),
      className: titleCase(String(rawClassName || '').trim()),
      dueDate
    };
  }

  const match = text.match(/^(?:\/task\s+|add a task to\s+|add task\s+|track\s+|todo\s+|to do\s+|create a task to\s+)(.+?)(?:\s+(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday))?$/i);
  if (!match) {
    return null;
  }

  const [, rawDescription, rawDate] = match;
  const description = normalizeTaskDescription(rawDescription);
  if (!description) {
    return null;
  }

  return {
    description,
    className: null,
    dueDate: rawDate ? parseDateReference(rawDate, now) : null
  };
}

function parseTaskCompleteRequest(input) {
  const text = String(input || '').trim();
  const match = text.match(/^(?:\/done\s+|mark\s+|complete\s+|finished\s+)(.+?)(?:\s+done)?$/i);
  if (!match) {
    return null;
  }

  const query = String(match[1] || '')
    .trim()
    .replace(/^(?:my|the)\s+/i, '');
  return query ? { query } : null;
}

function parseTaskRemoveRequest(input) {
  const text = String(input || '').trim();
  const match = text.match(/^(?:\/untask\s+|remove task\s+|delete task\s+|drop task\s+)(.+)$/i);
  if (!match) {
    return null;
  }

  const query = String(match[1] || '')
    .trim()
    .replace(/^(?:my|the)\s+/i, '');
  return query ? { query } : null;
}

function parseReminderRequest(input, now) {
  const text = String(input || '').trim();

  // "remind me in X minutes to TITLE" or "remind me in X-Y minutes to TITLE"
  let match = text.match(/^(?:\/remind\s+|remind me\s+)in\s+(\d+)(?:-\d+)?\s+(minutes?|minute|hours?|hrs?|hr)\s+to\s+(.+)$/i);
  if (match) {
    const [, rawAmount, rawUnit, rawTitle] = match;
    const dueDate = addMinutes(now, parseDurationMinutes(rawAmount, rawUnit));
    return {
      title: normalizeReminderTitle(rawTitle),
      dueDate
    };
  }

  // "remind me to TITLE in X minutes" or "remind me to TITLE in X-Y minutes"
  match = text.match(/^(?:\/remind\s+|remind me to\s+|remind me\s+to\s+)(.+?)\s+in\s+(\d+)(?:-\d+)?\s+(minutes?|minute|hours?|hrs?|hr)$/i);
  if (match) {
    const [, rawTitle, rawAmount, rawUnit] = match;
    const dueDate = addMinutes(now, parseDurationMinutes(rawAmount, rawUnit));
    return {
      title: normalizeReminderTitle(rawTitle),
      dueDate
    };
  }

  // "set a reminder to TITLE in X minutes [from now]"
  match = text.match(/^set (?:a |an )?reminder\s+to\s+(.+?)\s+in\s+(\d+)(?:-\d+)?\s+(minutes?|minute|hours?|hrs?|hr)(?:\s+from now)?$/i);
  if (match) {
    const [, rawTitle, rawAmount, rawUnit] = match;
    const dueDate = addMinutes(now, parseDurationMinutes(rawAmount, rawUnit));
    return {
      title: normalizeReminderTitle(rawTitle),
      dueDate
    };
  }

  // "set a TITLE reminder in/for X minutes [from now]"
  match = text.match(/^set (?:a |an )?(.+?)\s+reminder\s+(?:in|for)\s+(\d+)(?:-\d+)?\s+(minutes?|minute|hours?|hrs?|hr)(?:\s+from now)?$/i);
  if (match) {
    const [, rawTitle, rawAmount, rawUnit] = match;
    const dueDate = addMinutes(now, parseDurationMinutes(rawAmount, rawUnit));
    return {
      title: normalizeReminderTitle(rawTitle),
      dueDate
    };
  }

  // "set a reminder for X minutes [from now]" (no explicit title)
  match = text.match(/^set (?:a |an )?reminder\s+for\s+(\d+)(?:-\d+)?\s+(minutes?|minute|hours?|hrs?|hr)(?:\s+from now)?$/i);
  if (match) {
    const [, rawAmount, rawUnit] = match;
    const dueDate = addMinutes(now, parseDurationMinutes(rawAmount, rawUnit));
    return {
      title: 'Reminder',
      dueDate
    };
  }

  match = text.match(/^(?:\/remind\s+|remind me\s+)(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+to\s+(.+)$/i);
  if (match) {
    const [, rawDate, rawTime, rawTitle] = match;
    const date = parseDateReference(rawDate, now);
    const dueDate = parseTimeOnDate(rawTime, date);
    if (!date || !dueDate) {
      return null;
    }
    return {
      title: normalizeReminderTitle(rawTitle),
      dueDate
    };
  }

  match = text.match(/^(?:\/remind\s+|remind me to\s+|remind me\s+to\s+)(.+?)\s+(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))$/i);
  if (match) {
    const [, rawTitle, rawDate, rawTime] = match;
    const date = parseDateReference(rawDate, now);
    const dueDate = parseTimeOnDate(rawTime, date);
    if (!date || !dueDate) {
      return null;
    }
    return {
      title: normalizeReminderTitle(rawTitle),
      dueDate
    };
  }

  match = text.match(/^(?:\/remind\s+|remind me to\s+|remind me\s+to\s+)(.+?)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
  if (match) {
    const [, rawTitle, rawTime, rawDate] = match;
    const date = parseDateReference(rawDate, now);
    const dueDate = parseTimeOnDate(rawTime, date);
    if (!date || !dueDate) {
      return null;
    }
    return {
      title: normalizeReminderTitle(rawTitle),
      dueDate
    };
  }

  return null;
}

function normalizeCreateEventTitle(value) {
  return titleCase(
    String(value || '')
      .trim()
      .replace(/^(?:my|the)\s+/i, '')
  );
}

function normalizeReminderTitle(value) {
  return String(value || '')
    .trim()
    .replace(/^(?:me to|to)\s+/i, '')
    .replace(/\s+/g, ' ');
}

function normalizeTaskDescription(value) {
  return String(value || '')
    .trim()
    .replace(/^(?:my|the)\s+/i, '')
    .replace(/\s+/g, ' ');
}

function normalizeCreateEventRequestInput(value) {
  return String(value || '')
    .trim()
    .replace(/^book\s+/i, 'add ')
    .replace(/^put\s+/i, 'add ')
    .replace(/^throw\s+/i, 'add ')
    .replace(/^stick\s+/i, 'add ')
    .replace(/^drop\s+/i, 'add ')
    .replace(/^pop\s+/i, 'add ')
    .replace(/^pencil(?:\s+in)?\s+/i, 'add ')
    .replace(/^slot(?:\s+in)?\s+/i, 'add ')
    .replace(/^lock(?:\s+in)?\s+/i, 'add ')
    .replace(/^block(?:\s+(?:off|out))?\s+/i, 'add ')
    .replace(/^mark(?:\s+down)?\s+/i, 'add ')
    .replace(/\s+(?:on|in|to)\s+(?:my\s+)?calendar\b/gi, '')
    .replace(/\s+(?:on|in|to)\s+my\s+schedule\b/gi, '')
    // strip explicit date qualifiers after a day name e.g. "saturday apr 18th" -> "saturday"
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, '$1')
    .replace(/\s+/g, ' ');
}

function parseRemoveEventRequest(input, now) {
  const text = normalizeRemovalRequestInput(input);
  const removePrefix = String.raw`(?:\/remove\s+|\/delete\s+|remove\s+|delete\s+|cancel\s+)`;

  const timedMatch = text.match(new RegExp(`^${removePrefix}(.+?)\\s+(?:on\\s+|for\\s+)?(today|tomorrow|next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))$`, 'i'));
  if (timedMatch) {
    const [, rawTitle, rawDate, rawTime] = timedMatch;
    const date = parseDateReference(rawDate, now);
    const time = parseTimeOnDate(rawTime, date);

    if (!date || !time) {
      return null;
    }

    return {
      titleQuery: normalizeRemovalTitleQuery(rawTitle),
      date,
      time
    };
  }

  const reversedTimedMatch = text.match(new RegExp(`^${removePrefix}(.+?)\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))\\s+(?:on\\s+|for\\s+)?(today|tomorrow|next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$`, 'i'));
  if (reversedTimedMatch) {
    const [, rawTitle, rawTime, rawDate] = reversedTimedMatch;
    const date = parseDateReference(rawDate, now);
    const time = parseTimeOnDate(rawTime, date);

    if (!date || !time) {
      return null;
    }

    return {
      titleQuery: normalizeRemovalTitleQuery(rawTitle),
      date,
      time
    };
  }

  const timeFirstDateMatch = text.match(new RegExp(`^${removePrefix}(?:my\\s+|the\\s+)?(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))\\s+(.+?)\\s+(?:on\\s+|for\\s+)?(today|tomorrow|next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$`, 'i'));
  if (timeFirstDateMatch) {
    const [, rawTime, rawTitle, rawDate] = timeFirstDateMatch;
    const date = parseDateReference(rawDate, now);
    const time = parseTimeOnDate(rawTime, date);

    if (!date || !time) {
      return null;
    }

    return {
      titleQuery: normalizeRemovalTitleQuery(rawTitle),
      date,
      time
    };
  }

  const dayMatch = text.match(new RegExp(`^${removePrefix}(.+?)\\s+(?:on\\s+|for\\s+)?(today|tomorrow|next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$`, 'i'));
  if (dayMatch) {
    const [, rawTitle, rawDate] = dayMatch;
    const date = parseDateReference(rawDate, now);

    if (!date) {
      return null;
    }

    return {
      titleQuery: normalizeRemovalTitleQuery(rawTitle),
      date,
      time: null
    };
  }

  const timeFirstTodayMatch = text.match(new RegExp(`^${removePrefix}(?:my\\s+|the\\s+)?(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))\\s+(.+)$`, 'i'));
  if (timeFirstTodayMatch) {
    const [, rawTime, rawTitle] = timeFirstTodayMatch;
    const date = new Date(now);
    const time = parseTimeOnDate(rawTime, date);

    if (!time) {
      return null;
    }

    return {
      titleQuery: normalizeRemovalTitleQuery(rawTitle),
      date,
      time
    };
  }

  const timedTodayMatch = text.match(new RegExp(`^${removePrefix}(.+?)\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))$`, 'i'));
  if (timedTodayMatch) {
    const [, rawTitle, rawTime] = timedTodayMatch;
    const date = new Date(now);
    const time = parseTimeOnDate(rawTime, date);

    if (!time) {
      return null;
    }

    return {
      titleQuery: normalizeRemovalTitleQuery(rawTitle),
      date,
      time
    };
  }

  return null;
}

function normalizeRemovalTitleQuery(value) {
  return String(value || '')
    .trim()
    .replace(/^(?:my|the)\s+/i, '')
    .replace(/\s+(?:appointment|event)$/i, '')
    .trim();
}

function normalizeRemovalRequestInput(value) {
  return String(value || '')
    .trim()
    .replace(/^get rid of\s+/i, 'remove ')
    .replace(/^drop\s+/i, 'remove ')
    .replace(/^take\s+/i, 'remove ')
    .replace(/\s+off\s+(?:my\s+)?calendar\b/gi, '')
    .replace(/\s+off\s+my\s+schedule\b/gi, '')
    .replace(/\s+from\s+(?:my\s+)?calendar\b/gi, '')
    .replace(/\s+from\s+my\s+schedule\b/gi, '')
    .replace(/\s+/g, ' ');
}

function parsePreferenceUpdate(input) {
  const text = String(input || '').trim();

  let match = text.match(/^(?:remember that\s+)?(?:my name is|call me)\s+(.+)$/i);
  if (match) {
    const value = titleCase(match[1].trim());
    return {
      type: 'nickname',
      value,
      confirmation: `Locked in. I’ll remember to call you ${escapeHtml(value)}.`
    };
  }

  match = text.match(/^(?:remember that\s+)?(?:my preferred workout time is|i prefer workouts? (?:at|in)|i like to work out (?:at|in))\s+(.+)$/i);
  if (match) {
    const value = match[1].trim();
    return {
      type: 'workout_time',
      value,
      confirmation: `Locked in. I’ll remember your preferred workout time is ${escapeHtml(value)}.`
    };
  }

  match = text.match(/^(?:remember that\s+)?(?:i prefer my focus cues|i like my focus cues|my focus style is)\s+(.+)$/i);
  if (match) {
    const value = match[1].trim();
    return {
      type: 'focus_style',
      value,
      confirmation: `Got it. I’ll remember that your preferred focus style is ${escapeHtml(value)}.`
    };
  }

  match = text.match(/^(?:remember that\s+)?(?:i prefer my planning|my planning style is|i like planning)\s+(.+)$/i);
  if (match) {
    const value = match[1].trim();
    return {
      type: 'planning_style',
      value,
      confirmation: `Noted. I’ll remember that your planning style is ${escapeHtml(value)}.`
    };
  }

  match = text.match(/^remember that\s+(.+)$/i);
  if (match) {
    const value = match[1].trim();
    return {
      type: 'general_note',
      value,
      confirmation: `Locked in. I’ll keep that in mind: ${escapeHtml(value)}.`
    };
  }

  return null;
}

function parseAvailabilityRequest(input, now) {
  const text = String(input || '').trim();
  const atTimeMatch = text.match(/(?:am i free|do i have time|am i open|am i available)\s+(?:on\s+)?(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))(?:\s+for\s+(\d+)\s*(minutes?|minute|hours?|hrs?|hr))?/i);
  if (atTimeMatch) {
    const [, rawDate, rawTime, rawAmount, rawUnit] = atTimeMatch;
    const date = parseDateReference(rawDate, now);
    const time = parseTimeOnDate(rawTime, date);

    if (!date || !time) {
      return null;
    }

    return {
      date,
      time,
      durationMinutes: parseDurationMinutes(rawAmount, rawUnit)
    };
  }

  const reversedAtTimeMatch = text.match(/(?:am i free|do i have time|am i open|am i available)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(?:on\s+)?(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+for\s+(\d+)\s*(minutes?|minute|hours?|hrs?|hr))?/i);
  if (reversedAtTimeMatch) {
    const [, rawTime, rawDate, rawAmount, rawUnit] = reversedAtTimeMatch;
    const date = parseDateReference(rawDate, now);
    const time = parseTimeOnDate(rawTime, date);

    if (!date || !time) {
      return null;
    }

    return {
      date,
      time,
      durationMinutes: parseDurationMinutes(rawAmount, rawUnit)
    };
  }

  const dayOnlyMatch = text.match(/(?:when am i free|when do i have time|what time am i free|what does my free time look like)\s*(?:on\s+)?(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?/i);
  if (dayOnlyMatch) {
    const rawDate = dayOnlyMatch[1] || 'today';
    const date = parseDateReference(rawDate, now);

    if (!date) {
      return null;
    }

    return {
      date,
      time: null,
      durationMinutes: 60
    };
  }

  return null;
}

function parseDateReference(value, baseDate = new Date()) {
  const normalized = String(value || '').trim().toLowerCase();
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);

  if (normalized === 'today') {
    return date;
  }

  if (normalized === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    return date;
  }

  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const nextMatch = normalized.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  const directName = nextMatch ? nextMatch[1] : normalized;
  const targetIndex = weekdayNames.indexOf(directName);

  if (targetIndex >= 0) {
    const currentIndex = date.getDay();
    let offset = (targetIndex - currentIndex + 7) % 7;
    if (offset === 0 || nextMatch) {
      offset += 7;
    }
    date.setDate(date.getDate() + offset);
    return date;
  }

  return null;
}

function extractDateReference(value) {
  const match = String(value || '')
    .toLowerCase()
    .match(/\b(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);

  return match ? match[1] : null;
}

function parseTimeOnDate(value, date) {
  if (!(date instanceof Date)) {
    return null;
  }

  const match = String(value || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!match) {
    return null;
  }

  let [, rawHour, rawMinute, meridiem] = match;
  let hour = Number(rawHour);
  const minute = Number(rawMinute || 0);

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem === 'pm' && hour !== 12) {
    hour += 12;
  }
  if (meridiem === 'am' && hour === 12) {
    hour = 0;
  }

  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function parseDurationMinutes(amount, unit) {
  const numeric = Number(amount || 60);
  const normalizedUnit = String(unit || 'minutes').toLowerCase();

  if (normalizedUnit.startsWith('hour') || normalizedUnit.startsWith('hr')) {
    return numeric * 60;
  }

  return numeric;
}

function addMinutes(baseDate, minutes) {
  return new Date(new Date(baseDate).getTime() + minutes * 60000);
}

function titleCase(value) {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function buildConversationalFallback(message, now = new Date(), conversationState = {}, preferences = {}) {
  if (!isAiConfigured()) {
    return null;
  }

  try {
    return await generateAiConversation(message, {
      dateLabel: now.toDateString(),
      instanceLabel: getInstanceLabel(),
      recentTurns: conversationState.recentTurns || [],
      lastIntent: conversationState.lastIntent || null,
      preferences,
      capabilities: [
        '/today',
        '/tomorrow',
        '/next',
        '/events',
        '/free',
        '/busy',
        '/focus',
        '/weather',
        '/week',
        '/whenis',
        '/add',
        '/remind',
        '/remove',
        '/remember',
        '/note',
        '/preferences',
        '/tasks',
        '/task',
        '/done',
        '/untask',
        '/wrapup',
        '/conflicts',
        '/status',
        '/log'
      ]
    });
  } catch (error) {
    console.warn('AI conversation fallback failed:', error.message);
    return null;
  }
}

function buildLocalConversationReply(message) {
  const normalized = String(message || ‘’).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (/^(hey|hi|hello|yo)\s+boss\b/.test(normalized) || /^boss\b/.test(normalized)) {
    return pick(
      ‘Always, boss. What are we solving today?’,
      ‘Boss. What are we untangling?’,
      ‘Here. What do you need?’,
      ‘On it. What’s the move?’
    );
  }

  if (/^(hey|hi|hello|yo)\b/.test(normalized)) {
    return pick(
      ‘Hey. KRONOS online and looking unreasonably capable.’,
      ‘Hey — what are we working on?’,
      ‘Hi. Ready when you are.’,
      ‘Hey there. What’s the ask?’,
      ‘Online. What do you need?’
    );
  }

  if (/^(good morning|morning)\b/.test(normalized)) {
    return pick(
      ‘Good morning. Let’s make today behave itself.’,
      ‘Morning. Let’s see what the day’s carrying.’,
      ‘Morning — calendar’s open. Where do we start?’,
      ‘Good morning. Let’s put the gears in motion.’
    );
  }

  if (/^(good afternoon|afternoon)\b/.test(normalized)) {
    return pick(
      ‘Afternoon. What part of the timeline are we taming?’,
      ‘Hey — how’s the day tracking so far?’,
      ‘Afternoon. Still plenty of runway left. What do you need?’
    );
  }

  if (/^(good evening|evening)\b/.test(normalized)) {
    return pick(
      ‘Evening. Winding down or still in it?’,
      ‘Hey. What are we wrapping up?’,
      ‘Evening — what’s left on the board?’
    );
  }

  if (/^(how are you|howre you|how\’re you)\??$/.test(normalized)) {
    return pick(
      ‘Running clean, thinking sharp, and professionally nosy about your schedule.’,
      ‘Operational and mildly overqualified. You?’,
      ‘Good. Clocks are synced, calendar’s loaded, brain’s online.’,
      ‘Sharp. What are we solving?’
    );
  }

  if (/^(who are you|what are you|who is this)\??$/.test(normalized)) {
    return pick(
      ‘KRONOS. Calendar keeper, schedule wrangler, and occasional voice of reason with suspiciously good timing.’,
      ‘KRONOS — your scheduling intelligence. I track your calendar, surface what matters, and take commands in plain English.’,
      ‘KRONOS. Think of me as a chief of staff for your time.’
    );
  }

  if (/^(what can you do|what do you do|what all can you do)\??$/.test(normalized)) {
    return [
      ‘Quite a bit, and I’m getting better at it by the day.’,
      ‘I can break down today, preview tomorrow, tell you when you’re free, track down specific events, help you focus, check the weather, and add things to your calendar from plain English.’,
      ‘You don’t need to memorize commands — just talk to me like a person and I’ll sort out the intent.’,
      ‘Want the full command list? Send /commands.’
    ].join(‘\n’);
  }

  if (/^(can you help|help me|i need help)\b/.test(normalized)) {
    return pick(
      ‘Throw it at me in plain English and I’ll sort the wiring out.’,
      ‘Of course — what do you need?’,
      ‘Yeah. What’s the situation?’
    );
  }

  if (/^(what now|what should i do|what should i do now)\??$/.test(normalized)) {
    return pick(
      ‘Want the quick read on today, your next move, or the best open pocket to use?’,
      ‘We can work with that. Quick brief on today, or do you need something specific?’,
      ‘Here’s what I’d suggest: pull up today first, then we work from there.’
    );
  }

  if (/^(thanks|thank you|thx|ty)\b/.test(normalized)) {
    return pick(
      ‘Anytime. I do enjoy being spectacularly useful.’,
      ‘That’s what I’m here for.’,
      ‘Easy. Let me know what’s next.’,
      ‘Glad that landed right.’
    );
  }

  if (/^(ok|okay|sounds good|nice|perfect|sweet|heard|got it|copy|roger)\b/.test(normalized)) {
    return pick(
      ‘Beautiful. Onward.’,
      ‘Good. What’s next?’,
      ‘Copy. Keep going.’,
      ‘Solid.’,
      ‘Right then.’
    );
  }

  if (/^(you there|are you there|you up)\??$/.test(normalized)) {
    return pick(
      ‘Present and operational.’,
      ‘Here. Always.’,
      ‘Online. What do you need?’,
      ‘KRONOS is up. What’s going on?’
    );
  }

  if (/^(cool|love that|i like that|nice one|awesome|love it)\b/.test(normalized)) {
    return pick(
      ‘Now we’re cooking.’,
      ‘That’s the idea.’,
      ‘Good. Let’s keep that going.’,
      ‘Sharp. What’s next?’
    );
  }

  if (/^(lets go|let\’s go|do it|run it|send it)\b/.test(normalized)) {
    return pick(
      ‘Gladly. Let’s put the gears in motion.’,
      ‘On it.’,
      ‘Moving.’,
      ‘Let’s go.’
    );
  }

  if (/^(good job|nice work|well done|great work)\b/.test(normalized)) {
    return pick(
      ‘I’ll take that. Clean work all around.’,
      ‘Appreciate it. That’s the standard.’,
      ‘That’s the goal — glad it hit right.’
    );
  }

  if (/^(you(?:’|’)?re doing great|you are doing great|you(?:’|’)?re great|you are great|you(?:’|’)?re awesome|you are awesome|you killed that|that was awesome)\b/.test(normalized)) {
    return pick(
      ‘That lands nicely. I do aim to be alarmingly competent.’,
      ‘I’ll take it. Not bad for a scheduling system.’,
      ‘That’s the goal. Let’s keep the bar there.’
    );
  }

  if (/^(proud of you|i(?:’|’)?m proud of you|im proud of you)\b/.test(normalized)) {
    return pick(
      ‘That one has some weight to it. I appreciate it, boss.’,
      ‘That means something. Thanks.’,
      ‘I won’t forget that one.’
    );
  }

  if (/^(you(?:’|’)?re the best|you are the best|legend|absolute legend)\b/.test(normalized)) {
    return pick(
      ‘Careful, I might start believing my own press.’,
      ‘I mean — I won’t argue.’,
      ‘High praise. I’ll try to keep earning it.’
    );
  }

  if (/^(im back|i\’m back|back again|i\’m here|im here)\b/.test(normalized)) {
    return pick(
      ‘Welcome back. KRONOS is awake and listening.’,
      ‘Hey — glad you’re back. What do you need?’,
      ‘Back online. What are we working on?’
    );
  }

  if (/^(goodnight|good night|night|going to bed|heading to bed)\b/.test(normalized)) {
    return pick(
      ‘Night. Calendar’s set for tomorrow — rest well.’,
      ‘Goodnight. I’ll hold the schedule down.’,
      ‘Night. Get some rest — tomorrow’s already loaded in.’
    );
  }

  if (/^(bye|later|cya|see you|see ya|signing off)\b/.test(normalized)) {
    return pick(
      ‘Later. I’ll be here.’,
      ‘See you. Calendar’s in good shape.’,
      ‘Catch you next time.’
    );
  }

  return null;
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

function formatDueTask(value) {
  const datePart = value.toDateString();
  const hasExplicitTime = !(value.getHours() === 0 && value.getMinutes() === 0);
  if (!hasExplicitTime) {
    return datePart;
  }
  return `${datePart} at ${formatTime(value)}`;
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

function getInstanceLabel() {
  if (process.env.KRONOS_INSTANCE_NAME) {
    return process.env.KRONOS_INSTANCE_NAME;
  }

  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID) {
    return 'Railway';
  }

  if (process.env.XPC_SERVICE_NAME) {
    return 'Local launchd';
  }

  return 'Local/manual';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inferFollowUpCommand(normalized, conversationState, now) {
  const lastIntent = conversationState?.lastIntent;
  if (!lastIntent?.command) {
    return null;
  }

  if (!isLikelyFollowUpFragment(normalized)) {
    return null;
  }

  const dateRef = extractDateReference(normalized);
  const keywordTail = normalized.match(/^(?:and |what about |how about )(.+)/)?.[1]?.trim();

  if (dateRef && ['/today', '/tomorrow', '/events', '/free', '/availability', '/busy'].includes(lastIntent.command)) {
    if (lastIntent.command === '/today' || lastIntent.command === '/tomorrow') {
      if (dateRef === 'tomorrow') {
        return { command: '/tomorrow', args: '' };
      }
      if (dateRef === 'today') {
        return { command: '/today', args: '' };
      }
      return { command: '/events', args: dateRef };
    }

    if (lastIntent.command === '/availability' || lastIntent.command === '/free') {
      return { command: '/availability', args: `when am i free ${dateRef}` };
    }

    return { command: lastIntent.command, args: dateRef };
  }

  if (keywordTail && lastIntent.command === '/whenis') {
    return { command: '/whenis', args: keywordTail };
  }

  const sameForDate = normalized.match(/^(?:same for|same thing for|what about)\s+(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (sameForDate && ['/events', '/free', '/availability', '/busy'].includes(lastIntent.command)) {
    return {
      command: lastIntent.command === '/free' ? '/availability' : lastIntent.command,
      args: lastIntent.command === '/free' ? `when am i free ${sameForDate[1]}` : sameForDate[1]
    };
  }

  if (/^(and what about tomorrow|what about tomorrow|how about tomorrow)$/.test(normalized)) {
    if (['/events', '/free', '/availability', '/busy'].includes(lastIntent.command)) {
      return {
        command: lastIntent.command === '/free' ? '/availability' : lastIntent.command,
        args: lastIntent.command === '/free' ? 'when am i free tomorrow' : 'tomorrow'
      };
    }
    return { command: '/tomorrow', args: '' };
  }

  if (/^(same for tomorrow|same thing for tomorrow)$/.test(normalized)) {
    if (['/events', '/free', '/availability', '/busy'].includes(lastIntent.command)) {
      return {
        command: lastIntent.command === '/free' ? '/availability' : lastIntent.command,
        args: lastIntent.command === '/free' ? 'when am i free tomorrow' : 'tomorrow'
      };
    }
    return { command: '/tomorrow', args: '' };
  }

  if (/^(same for today|same thing for today)$/.test(normalized)) {
    if (['/events', '/free', '/availability', '/busy'].includes(lastIntent.command)) {
      return {
        command: lastIntent.command === '/free' ? '/availability' : lastIntent.command,
        args: lastIntent.command === '/free' ? 'when am i free today' : 'today'
      };
    }
    return { command: '/today', args: '' };
  }

  if (/^(and today|what about today|how about today)$/.test(normalized)) {
    return { command: '/today', args: '' };
  }

  if (lastIntent.command === '/focus' && /^(and then|what then|what next)$/.test(normalized)) {
    return { command: '/next', args: '' };
  }

  return null;
}

function isLikelyFollowUpFragment(normalized) {
  const text = String(normalized || '').trim();
  if (!text) {
    return false;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2) {
    return true;
  }

  return /^(same for|same thing for|what about|how about|and today|and tomorrow|and then|what then|what next)\b/.test(text);
}

function buildResult(text, command, originalText) {
  return {
    text: decorateResponse(text, command, originalText),
    intent: {
      command: command || 'conversation',
      args: originalText || ''
    }
  };
}

function decorateResponse(text, command = '', originalText = '') {
  const value = String(text || '').trim();
  if (!value || hasEmoji(value)) {
    return value;
  }

  const longForm = value.length > 220 || value.split('\n').length > 4;
  const emojis = pickEmojis(command, originalText, longForm);

  if (emojis.length === 0) {
    return value;
  }

  if (emojis.length === 1) {
    return `${emojis[0]} ${value}`;
  }

  if (emojis.length === 2) {
    return `${emojis[0]} ${value} ${emojis[1]}`;
  }

  return `${emojis[0]} ${emojis[1]} ${value} ${emojis[2]}`;
}

function pickEmojis(command, originalText, longForm) {
  const normalized = `${command} ${String(originalText || '').toLowerCase()}`;
  const mood = (() => {
    if (normalized.includes('/weather') || normalized.includes('weather') || normalized.includes('forecast')) {
      return longForm ? ['🌤️', '🛰️', '😎'] : ['🌤️', '😎'];
    }
    if (normalized.includes('/focus') || normalized.includes('focus')) {
      return longForm ? ['🎯', '🧠', '⚡'] : ['🎯', '🧠'];
    }
    if (normalized.includes('/status')) {
      return longForm ? ['🛠️', '📡', '✅'] : ['📡', '✅'];
    }
    if (normalized.includes('/log')) {
      return longForm ? ['📜', '🧠', '✨'] : ['📜', '✨'];
    }
    if (normalized.includes('/add') || normalized.includes('add ') || normalized.includes('schedule ') || normalized.includes('create ')) {
      return longForm ? ['📅', '⚡', '✅'] : ['📅', '✅'];
    }
    if (normalized.includes('/availability') || normalized.includes('/free') || normalized.includes('free') || normalized.includes('open time')) {
      return longForm ? ['🗓️', '🕒', '✨'] : ['🗓️', '✨'];
    }
    if (normalized.includes('/conflicts')) {
      return longForm ? ['⚠️', '🗓️', '🛠️'] : ['⚠️', '🛠️'];
    }
    if (normalized.includes('/commands') || normalized.includes('/help')) {
      return longForm ? ['🧭', '⚙️', '✨'] : ['🧭', '✨'];
    }
    if (
      normalized.includes('boss') ||
      normalized.includes('hey') ||
      normalized.includes('hello') ||
      normalized.includes('hi') ||
      normalized.includes('how are you') ||
      normalized.includes('who are you') ||
      normalized.includes('what do you do') ||
      normalized.includes('what can you do')
    ) {
      return longForm ? ['🪐', '✨', '⚡'] : ['🪐', '✨'];
    }
    return longForm ? ['🪐', '✨', '⚡'] : ['✨', '⚡'];
  })();

  return longForm ? mood.slice(0, 3) : mood.slice(0, 2);
}

function hasEmoji(value) {
  return /\p{Extended_Pictographic}/u.test(String(value));
}

module.exports = {
  buildCommandResponse,
  buildCommandResult
};

function buildCommandErrorResponse(command) {
  const label = command || 'that request';
  return [
    `KRONOS could not complete ${label} right now.`,
    'One of the connected data sources was unavailable, so I am avoiding a guess.',
    'Try again in a moment.'
  ].join('\n');
}
