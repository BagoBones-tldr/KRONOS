const { analyzeSchedule } = require('./schedule-analysis');
const { generateAiBriefing, generateAiWrapUp } = require('./ai-service');

function buildDailyContext(events, now = new Date(), weather = null) {
  const schedule = analyzeSchedule(events, now);

  return {
    dateLabel: now.toDateString(),
    now,
    events,
    weather,
    schedule,
    suggestedFocus: suggestFocus(schedule)
  };
}

function buildWrapUpContext(events, now = new Date(), tasks = {}) {
  const schedule = analyzeSchedule(events, now);
  const allTasks = Array.isArray(tasks.allTasks) ? tasks.allTasks : [];
  const openTasks = Array.isArray(tasks.openTasks) ? tasks.openTasks : [];
  const completedTasks = Array.isArray(tasks.completedTasks) ? tasks.completedTasks : [];

  return {
    dateLabel: now.toDateString(),
    now,
    events,
    schedule,
    tasks: {
      openToday: filterTasksByDay(openTasks, now),
      dueTomorrow: filterTasksByDay(openTasks, addDays(now, 1)),
      completedToday: filterCompletedTasksByDay(completedTasks, now),
      totalOpen: openTasks.length,
      totalCompletedToday: filterCompletedTasksByDay(completedTasks, now).length,
      allTasks
    }
  };
}

function generateBriefing(context) {
  const lines = [];
  lines.push(`🌅 <b>Good Morning Quintin!</b>`);
  lines.push(`<i>Project KRONOS v2 cloud check</i>`);
  lines.push('');
  lines.push(`📅 <b>Your Schedule for ${context.dateLabel}</b>`);
  lines.push('================================');
  lines.push(`You have ${context.schedule.totalEvents} events today covering ${context.schedule.busyMinutes} busy minutes.`);

  if (context.schedule.nextEvent) {
    const event = context.schedule.nextEvent;
    lines.push(
      `Next up: <b>${escapeHtml(event.title)}</b> at ${formatTime(event.start)} ` +
      `(${context.schedule.minutesUntilNextEvent} minutes away).`
    );
  } else {
    lines.push('There are no more events scheduled for today.');
  }

  if (context.schedule.freeBlocks.length > 0) {
    const longestBlock = [...context.schedule.freeBlocks].sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
    const blockRange = longestBlock.durationMinutes >= 1440
      ? 'all day'
      : `from ${formatTime(longestBlock.start)} to ${formatBlockEndTime(longestBlock.end)}`;
    lines.push(
      `Free time: ${context.schedule.freeBlocks.length} block(s), longest is ${longestBlock.durationMinutes} minutes ${blockRange}.`
    );
  } else {
    lines.push('Free time: no open blocks between scheduled events.');
  }

  if (context.schedule.conflicts.length > 0) {
    const conflict = context.schedule.conflicts[0];
    lines.push(
      `Conflict detected: ${escapeHtml(conflict.firstTitle)} overlaps with ` +
      `${escapeHtml(conflict.secondTitle)} by ${conflict.overlapMinutes} minutes.`
    );
  }

  if (context.weather) {
    lines.push(formatWeatherLine(context.weather));
  }

  if (context.events.length > 0) {
    lines.push('');
    lines.push('<b>Events</b>');
    for (const event of context.events) {
      lines.push(formatEventLine(event));
    }
  }

  lines.push('');
  lines.push(`Suggested focus: ${escapeHtml(context.suggestedFocus)}`);

  return lines.join('\n');
}

async function generateBriefingWithAi(context) {
  try {
    const aiBriefing = await generateAiBriefing(context);
    if (aiBriefing) {
      return aiBriefing;
    }
  } catch (error) {
    console.warn('AI briefing failed:', error.message);
  }

  return generateBriefing(context);
}

function generateWrapUp(context) {
  const lines = [];
  lines.push('🌙 <b>End of Day Wrap-Up</b>');
  lines.push('');
  lines.push(`📘 <b>${context.dateLabel}</b>`);
  lines.push(`Today held ${context.schedule.totalEvents} event(s) covering ${context.schedule.busyMinutes} busy minutes.`);

  if (context.schedule.conflicts.length > 0) {
    lines.push(`You also had ${context.schedule.conflicts.length} scheduling conflict(s) worth a look.`);
  }

  const completedToday = context.tasks.completedToday;
  if (completedToday.length > 0) {
    lines.push('');
    lines.push('<b>Completed Today</b>');
    for (const task of completedToday.slice(0, 5)) {
      lines.push(formatTaskBullet(task));
    }
  } else {
    lines.push('');
    lines.push('No tasks were marked complete today.');
  }

  const openToday = context.tasks.openToday;
  if (openToday.length > 0) {
    lines.push('');
    lines.push('<b>Still Open</b>');
    for (const task of openToday.slice(0, 5)) {
      lines.push(formatTaskBullet(task));
    }
  }

  const dueTomorrow = context.tasks.dueTomorrow;
  if (dueTomorrow.length > 0) {
    lines.push('');
    lines.push('<b>Due Tomorrow</b>');
    for (const task of dueTomorrow.slice(0, 5)) {
      lines.push(formatTaskBullet(task));
    }
  }

  lines.push('');
  lines.push(escapeHtml(suggestWrapUpFocus(context)));
  return lines.join('\n');
}

async function generateWrapUpWithAi(context) {
  try {
    const aiWrapUp = await generateAiWrapUp(context);
    if (aiWrapUp) {
      return aiWrapUp;
    }
  } catch (error) {
    console.warn('AI wrap-up failed:', error.message);
  }

  return generateWrapUp(context);
}

function suggestFocus(schedule) {
  if (schedule.conflicts.length > 0) {
    return 'Review your overlapping events and decide which one should move.';
  }

  const focusBlock = schedule.freeBlocks.find(block => block.durationMinutes >= 60);
  if (focusBlock) {
    return `Protect the block from ${formatTime(focusBlock.start)} to ${formatTime(focusBlock.end)} for focused work.`;
  }

  if (schedule.nextEvent) {
    return `Use the time before ${schedule.nextEvent.title} to prepare and reduce context switching.`;
  }

  return 'Keep the day flexible and use open time for planning, recovery, or a priority task.';
}

function formatEventLine(event) {
  const parts = [`• <b>${escapeHtml(event.title)}</b>`];
  if (event.start) {
    parts.push(`at ${formatTime(event.start)}`);
  }
  if (event.location) {
    parts.push(`(${escapeHtml(event.location)})`);
  } else if (event.description) {
    parts.push(`(${escapeHtml(event.description)})`);
  }
  return parts.join(' ');
}

function formatWeatherLine(weather) {
  const temps = [];
  if (weather.highTempF !== null) {
    temps.push(`high ${weather.highTempF}F`);
  }
  if (weather.lowTempF !== null) {
    temps.push(`low ${weather.lowTempF}F`);
  }

  let line = `Weather: ${escapeHtml(weather.summary)}`;
  if (temps.length > 0) {
    line += `, ${temps.join(', ')}`;
  }
  if (weather.precipitationChance !== null) {
    line += `, ${weather.precipitationChance}% chance of precipitation`;
  }
  line += '.';
  return line;
}

function formatTaskBullet(task) {
  const classLabel = task.className ? ` for ${escapeHtml(task.className)}` : '';
  const dueLabel = formatDueDate(task.dueDate);
  return dueLabel
    ? `• ${escapeHtml(task.description)}${classLabel} (${escapeHtml(dueLabel)})`
    : `• ${escapeHtml(task.description)}${classLabel}`;
}

function formatDueDate(isoString) {
  if (!isoString) {
    return '';
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }

  const hasExplicitTime = !(date.getHours() === 0 && date.getMinutes() === 0);
  const timeLabel = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });

  return hasExplicitTime
    ? `due ${date.toDateString()} at ${timeLabel}`
    : `due ${date.toDateString()}`;
}

function filterTasksByDay(tasks, day) {
  return tasks.filter(task => sameDay(task.dueDate, day));
}

function filterCompletedTasksByDay(tasks, day) {
  return tasks.filter(task => sameDay(task.completedAt, day));
}

function sameDay(value, targetDay) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const target = new Date(targetDay);
  if (Number.isNaN(date.valueOf()) || Number.isNaN(target.valueOf())) {
    return false;
  }

  return date.getFullYear() === target.getFullYear()
    && date.getMonth() === target.getMonth()
    && date.getDate() === target.getDate();
}

function suggestWrapUpFocus(context) {
  if (context.tasks.dueTomorrow.length > 0) {
    return 'Tomorrow has real weight on it. A quick look at those due tasks tonight would be a smart move.';
  }

  if (context.tasks.openToday.length > 0) {
    return 'There are still a few open loops from today. Decide what rolls forward and let the rest go for the night.';
  }

  if (context.tasks.completedToday.length > 0) {
    return 'Solid work today. Close it down clean and let tomorrow start lighter.';
  }

  return 'Quiet finish. Take the win and reset for tomorrow.';
}

function addDays(baseDate, amount) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatTime(value) {
  return value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatBlockEndTime(value) {
  if (value.getHours() === 0 && value.getMinutes() === 0) {
    return 'midnight';
  }
  return formatTime(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  buildDailyContext,
  buildWrapUpContext,
  generateBriefing,
  generateBriefingWithAi,
  generateWrapUp,
  generateWrapUpWithAi
};
