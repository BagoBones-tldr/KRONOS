const { analyzeSchedule } = require('./schedule-analysis');

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
    lines.push(
      `Free time: ${context.schedule.freeBlocks.length} block(s), longest is ${longestBlock.durationMinutes} minutes ` +
      `from ${formatTime(longestBlock.start)} to ${formatTime(longestBlock.end)}.`
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

module.exports = {
  buildDailyContext,
  generateBriefing
};
