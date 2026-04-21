const { loadEnv } = require('./env');
const { generateAiFocus } = require('./ai-service');

loadEnv();

async function run() {
  const context = {
    dateLabel: new Date().toDateString(),
    weather: {
      summary: 'Partly cloudy',
      highTempF: 68,
      lowTempF: 44,
      precipitationChance: 10
    },
    suggestedFocus: 'Protect your longest block for focused work.',
    schedule: {
      totalEvents: 3,
      busyMinutes: 210,
      minutesUntilNextEvent: 45,
      nextEvent: {
        title: 'Design Review',
        start: new Date(Date.now() + 45 * 60000),
        end: new Date(Date.now() + 105 * 60000),
        location: 'Zoom',
        description: 'Project alignment review'
      },
      freeBlocks: [
        {
          start: new Date(Date.now() + 120 * 60000),
          end: new Date(Date.now() + 240 * 60000),
          durationMinutes: 120
        }
      ],
      conflicts: []
    },
    events: [
      {
        title: 'Design Review',
        start: new Date(Date.now() + 45 * 60000),
        end: new Date(Date.now() + 105 * 60000),
        location: 'Zoom',
        description: 'Project alignment review'
      },
      {
        title: 'Workout',
        start: new Date(Date.now() + 300 * 60000),
        end: new Date(Date.now() + 360 * 60000),
        location: 'Gym',
        description: ''
      }
    ]
  };

  try {
    const response = await generateAiFocus(context);

    if (!response) {
      console.log('Anthropic is not configured or returned no response.');
      process.exitCode = 1;
      return;
    }

    console.log('Anthropic brain check passed:\n');
    console.log(response);
  } catch (error) {
    console.error('Anthropic brain check failed:', error.message);
    process.exitCode = 1;
  }
}

run();
