function analyzeSchedule(events, now = new Date()) {
  const orderedEvents = [...events].sort((a, b) => a.start - b.start);
  const nextEvent = orderedEvents.find(event => event.end && event.end > now) || null;
  const freeBlocks = [];
  const conflicts = [];

  for (let index = 0; index < orderedEvents.length - 1; index += 1) {
    const current = orderedEvents[index];
    const next = orderedEvents[index + 1];

    if (current.end && next.start > current.end) {
      freeBlocks.push({
        start: current.end,
        end: next.start,
        durationMinutes: minutesBetween(current.end, next.start)
      });
    }

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

function minutesBetween(start, end) {
  return Math.max(0, Math.round((end - start) / 60000));
}

function minDate(first, second) {
  return first < second ? first : second;
}

module.exports = {
  analyzeSchedule,
  minutesBetween
};
