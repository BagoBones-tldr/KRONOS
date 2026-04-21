function analyzeSchedule(events, now = new Date()) {
  const orderedEvents = [...events].sort((a, b) => a.start - b.start);
  const nextEvent = orderedEvents.find(event => event.end && event.end > now) || null;
  const freeBlocks = buildFreeBlocks(orderedEvents, now);
  const conflicts = [];

  for (let index = 0; index < orderedEvents.length - 1; index += 1) {
    const current = orderedEvents[index];
    const next = orderedEvents[index + 1];

    if (current.end && next.start < current.end) {
      conflicts.push({
        firstTitle: current.title,
        secondTitle: next.title,
        overlapMinutes: minutesBetween(next.start, minDate(current.end, next.end || current.end))
      });
    }
  }

  const busyMinutes = orderedEvents.reduce((total, event) => {
    if (!event.end) {
      return total;
    }
    return total + minutesBetween(event.start, event.end);
  }, 0);

  return {
    totalEvents: orderedEvents.length,
    busyMinutes,
    nextEvent,
    minutesUntilNextEvent: nextEvent ? Math.max(0, minutesBetween(now, nextEvent.start)) : null,
    freeBlocks,
    conflicts
  };
}

function buildFreeBlocks(events, referenceDate) {
  const dayStart = new Date(referenceDate);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  if (events.length === 0) {
    return [{
      start: dayStart,
      end: dayEnd,
      durationMinutes: minutesBetween(dayStart, dayEnd)
    }];
  }

  const freeBlocks = [];
  let cursor = dayStart;

  for (const event of events) {
    if (!(event.start instanceof Date) || Number.isNaN(event.start.valueOf())) {
      continue;
    }

    const eventStart = maxDate(cursor, event.start);
    if (eventStart > cursor) {
      freeBlocks.push({
        start: cursor,
        end: eventStart,
        durationMinutes: minutesBetween(cursor, eventStart)
      });
    }

    if (event.end instanceof Date && !Number.isNaN(event.end.valueOf())) {
      cursor = maxDate(cursor, minDate(event.end, dayEnd));
    } else {
      cursor = maxDate(cursor, minDate(event.start, dayEnd));
    }
  }

  if (dayEnd > cursor) {
    freeBlocks.push({
      start: cursor,
      end: dayEnd,
      durationMinutes: minutesBetween(cursor, dayEnd)
    });
  }

  return freeBlocks.filter(block => block.durationMinutes > 0);
}

function minutesBetween(start, end) {
  return Math.max(0, Math.round((end - start) / 60000));
}

function minDate(first, second) {
  return first < second ? first : second;
}

function maxDate(first, second) {
  return first > second ? first : second;
}

module.exports = {
  analyzeSchedule,
  minutesBetween
};
