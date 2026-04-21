const Anthropic = require('@anthropic-ai/sdk');
const { buildKronosSystemPrompt, buildKronosPolicyLines } = require('./ai-policy');

let client = null;

function isAiConfigured() {
  return Boolean(getAnthropicApiKey());
}

function getAnthropicClient() {
  if (!isAiConfigured()) {
    return null;
  }

  if (!client) {
    client = new Anthropic({
      apiKey: getAnthropicApiKey()
    });
  }

  return client;
}

function getAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || '';
}

async function generateAiBriefing(context) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return null;
  }

  const firstPass = await requestAnthropicText(buildBriefingPrompt(context), {
    maxTokens: 260,
    temperature: 0.35
  });
  if (isValidAiTimeReference(firstPass, context)) {
    return firstPass || null;
  }

  const safePass = await requestAnthropicText(buildBriefingPrompt(context, {
    forbidClockTimes: true
  }), {
    maxTokens: 260,
    temperature: 0.35
  });
  if (isValidAiTimeReference(safePass, context)) {
    return safePass || null;
  }

  return null;
}

async function generateAiFocus(context) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return null;
  }

  const firstPass = await requestAnthropicText(buildFocusPrompt(context), {
    maxTokens: 120,
    temperature: 0.3
  });
  if (isValidAiTimeReference(firstPass, context)) {
    return firstPass || null;
  }

  const safePass = await requestAnthropicText(buildFocusPrompt(context, {
    forbidClockTimes: true
  }), {
    maxTokens: 120,
    temperature: 0.3
  });
  if (isValidAiTimeReference(safePass, context)) {
    return safePass || null;
  }

  return null;
}

async function generateAiWrapUp(context) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return null;
  }

  const firstPass = await requestAnthropicText(buildWrapUpPrompt(context), {
    maxTokens: 220,
    temperature: 0.35
  });
  if (isValidAiTimeReference(firstPass, context)) {
    return firstPass || null;
  }

  const safePass = await requestAnthropicText(buildWrapUpPrompt(context, {
    forbidClockTimes: true
  }), {
    maxTokens: 220,
    temperature: 0.35
  });
  if (isValidAiTimeReference(safePass, context)) {
    return safePass || null;
  }

  return null;
}

async function generateAiConversation(message, options = {}) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return null;
  }

  const messages = buildConversationMessages(message, options.recentTurns || []);
  const system = buildConversationSystem(options);

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: 220,
    temperature: 0.3,
    system,
    messages
  });

  const text = extractText(response).trim();
  if (!text) {
    return null;
  }

  return isValidConversationalResponse(text) ? text : null;
}

async function requestAnthropicText(prompt, options = {}) {
  const anthropic = getAnthropicClient();
  const requestParams = {
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: options.maxTokens || 320,
    temperature: options.temperature ?? 0.4,
    system: options.system || buildKronosSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  const response = await anthropic.messages.create(requestParams);
  return extractText(response).trim();
}

function buildBriefingPrompt(context, options = {}) {
  const instructions = [
    'Write a concise, helpful Telegram-ready daily briefing in plain text.',
    'Keep it human, proactive, and grounded.',
    'Use 2-3 fitting emojis total for a longer response like this.',
    'Mention what matters most today, the next event, free time opportunities, weather if present, and one focus suggestion.',
    'If useful, explicitly acknowledge uncertainty rather than pretending to know more than the context shows.'
  ];

  if (options.forbidClockTimes) {
    instructions.push('Do not mention exact clock times. Use broader phrasing like "before your next event" or "during your longest open block."');
  } else {
    instructions.push('If you mention exact clock times, only use times that are present in the structured context.');
  }

  return [
    ...instructions,
    '',
    JSON.stringify(buildAiContextPayload(context, { includeWeather: true }), null, 2)
  ].join('\n');
}

function buildFocusPrompt(context, options = {}) {
  const instructions = [
    'Return 2-4 short lines for a Telegram focus cue.',
    'Use 1-2 fitting emojis total.',
    'Ground the cue in the real schedule context.',
    'If certainty is low, sound modest and conservative instead of specific.'
  ];

  if (options.forbidClockTimes) {
    instructions.push('Do not mention exact clock times. Use broader phrasing like "before your next event" or "during your longest open block."');
  } else {
    instructions.push('If you mention exact clock times, only use times that are present in the structured context.');
  }

  return [
    ...instructions,
    '',
    JSON.stringify(buildAiContextPayload(context, { includeWeather: false }), null, 2)
  ].join('\n');
}

function buildWrapUpPrompt(context, options = {}) {
  const instructions = [
    'Write a concise, helpful Telegram-ready end-of-day summary in plain text.',
    'Keep it reflective, grounded, and practical.',
    'Use 2-3 fitting emojis total for a longer response like this.',
    'Mention what the day held, what got completed, what is still open, and what tomorrow is already carrying.',
    'End with one short closing nudge that feels calm and useful.'
  ];

  if (options.forbidClockTimes) {
    instructions.push('Do not mention exact clock times. Use broader phrasing like "later tomorrow" or "still open tonight."');
  } else {
    instructions.push('If you mention exact clock times, only use times that are present in the structured context.');
  }

  return [
    ...instructions,
    '',
    JSON.stringify(buildWrapUpPayload(context), null, 2)
  ].join('\n');
}

// Builds the system parameter for conversational API calls.
// Context and instructions go here — never in the messages array.
function buildConversationSystem(options = {}) {
  const capabilities = options.capabilities || [];
  const base = buildKronosSystemPrompt();

  const conversationRules = [
    '',
    'Conversation behavior:',
    '- Answer the user first. Do not open by explaining your role or listing capabilities unless asked directly.',
    '- Only steer toward a known KRONOS capability when the user is clearly asking for planning, schedule, reminder, task, or status help.',
    '- For casual chat, keep it short, warm, and specific.',
    '- Use 1-2 fitting emojis for a standard reply, 2-3 only if the reply is clearly longer.',
    '- Do not redirect casual conversation into planning or commands unless the user clearly asks for that.',
    '- Only suggest one or two concrete next asks when the user is explicitly asking for help or what you can do.',
    '- If you are unsure what the user wants, say so briefly and offer one or two likely next things you can help with.',
    '- Do not mention weather unless the user asks about it or the prompt is clearly about a daily plan.',
    '- Avoid boilerplate like "I can help with..." unless the user is explicitly asking what you do.',
    '- Prefer direct, natural lines over assistant filler.',
    '- Do not over-explain simple greetings or acknowledgements.',
    '- Do not mention exact clock times — use broader phrasing like "before your next event" or "during your longest open block."'
  ];

  const contextLines = [
    '',
    'Session context:',
    `Current date: ${options.dateLabel || 'unknown'}`,
    `Runtime source: ${options.instanceLabel || 'unknown'}`,
    `Last resolved intent: ${formatLastIntent(options.lastIntent)}`,
    `Saved preferences: ${formatPreferencesForPrompt(options.preferences)}`,
    `Known capabilities: ${capabilities.join(', ') || 'calendar briefings, focus cues, events, weather, status, log'}`
  ];

  return [base, ...conversationRules, ...contextLines].join('\n');
}

// Builds the messages array for conversational API calls.
// Each stored turn becomes a real user/assistant message — never embedded as text.
function buildConversationMessages(currentMessage, recentTurns) {
  const messages = [];

  for (const turn of recentTurns) {
    const role = turn.role === 'assistant' ? 'assistant' : 'user';
    const content = String(turn.text || '').trim();
    if (!content) {
      continue;
    }

    if (messages.length > 0 && messages[messages.length - 1].role === role) {
      // Merge consecutive same-role entries to keep the array valid
      messages[messages.length - 1].content += '\n' + content;
    } else {
      messages.push({ role, content });
    }
  }

  // Claude API requires messages to start with a user turn
  while (messages.length > 0 && messages[0].role === 'assistant') {
    messages.shift();
  }

  // Add the current user message
  const current = String(currentMessage || '').trim();
  if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
    messages[messages.length - 1].content += '\n' + current;
  } else {
    messages.push({ role: 'user', content: current });
  }

  return messages;
}

function isValidConversationalResponse(text) {
  const lowered = String(text).toLowerCase();
  const forbiddenClaims = [
    'i added',
    'i created',
    'i moved',
    'i rescheduled',
    'i checked your calendar',
    'i verified',
    'i already sent',
    'i updated your calendar',
    'i changed your schedule'
  ];

  return !forbiddenClaims.some(claim => lowered.includes(claim));
}

function buildAiContextPayload(context, options = {}) {
  return {
    dateLabel: context.dateLabel,
    preferences: context.preferences || {},
    weather: options.includeWeather ? context.weather : null,
    suggestedFocus: context.suggestedFocus,
    schedule: {
      totalEvents: context.schedule.totalEvents,
      busyMinutes: context.schedule.busyMinutes,
      minutesUntilNextEvent: context.schedule.minutesUntilNextEvent,
      nextEvent: context.schedule.nextEvent ? {
        title: context.schedule.nextEvent.title,
        start: context.schedule.nextEvent.start,
        end: context.schedule.nextEvent.end,
        location: context.schedule.nextEvent.location || null,
        description: context.schedule.nextEvent.description || null
      } : null,
      freeBlocks: context.schedule.freeBlocks,
      conflicts: context.schedule.conflicts
    },
    events: context.events.map(event => ({
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location || null,
      description: event.description || null
    }))
  };
}

function buildWrapUpPayload(context) {
  return {
    dateLabel: context.dateLabel,
    tasks: context.tasks,
    schedule: {
      totalEvents: context.schedule.totalEvents,
      busyMinutes: context.schedule.busyMinutes,
      conflicts: context.schedule.conflicts
    },
    events: context.events.map(event => ({
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location || null,
      description: event.description || null
    }))
  };
}

function extractText(response) {
  if (!response || !Array.isArray(response.content)) {
    return '';
  }

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  return sanitizeAiText(text);
}

function isValidAiTimeReference(text, context) {
  if (!text) {
    return false;
  }

  if (!isValidDaypartSpanReference(text, context)) {
    return false;
  }

  const mentionedTimes = extractMentionedTimes(text);
  if (mentionedTimes.length === 0) {
    return true;
  }

  const allowedTimes = buildAllowedTimes(context);
  return mentionedTimes.every(time => allowedTimes.has(time));
}

function extractMentionedTimes(text) {
  const matches = text.match(/\b\d{1,2}(?::\d{2})?\s?(?:AM|PM|am|pm)\b/g) || [];
  return matches.map(normalizeTimeToken);
}

function buildAllowedTimes(context) {
  const times = new Set();
  const values = [];

  if (context.schedule?.nextEvent) {
    values.push(context.schedule.nextEvent.start, context.schedule.nextEvent.end);
  }

  for (const event of context.events || []) {
    values.push(event.start, event.end);
  }

  for (const block of context.schedule?.freeBlocks || []) {
    values.push(block.start, block.end);
  }

  for (const value of values) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) {
      times.add(normalizeTimeToken(formatTime(value)));
    }
  }

  return times;
}

function isValidDaypartSpanReference(text, context) {
  const claims = extractDaypartSpanClaims(text);
  if (claims.length === 0) {
    return true;
  }

  const events = (context.events || []).filter(event =>
    event.start instanceof Date &&
    !Number.isNaN(event.start.valueOf()) &&
    event.end instanceof Date &&
    !Number.isNaN(event.end.valueOf())
  );

  return claims.every(daypart => events.some(event => eventSpansIntoDaypart(event, daypart)));
}

function extractDaypartSpanClaims(text) {
  const matches = text.match(/\b(?:run|runs|running|extend|extends|stretch|stretches|carry|carries|go)\s+into\s+the\s+(morning|afternoon|evening|night)\b/gi) || [];
  return matches.map(match => {
    const daypartMatch = match.match(/(morning|afternoon|evening|night)/i);
    return daypartMatch ? daypartMatch[1].toLowerCase() : null;
  }).filter(Boolean);
}

function eventSpansIntoDaypart(event, daypart) {
  const startHour = event.start.getHours();
  const endHour = event.end.getHours();
  const boundary = getDaypartStartHour(daypart);

  if (boundary === null) {
    return true;
  }

  return startHour < boundary && endHour >= boundary;
}

function getDaypartStartHour(daypart) {
  switch (daypart) {
    case 'morning':
      return 5;
    case 'afternoon':
      return 12;
    case 'evening':
      return 17;
    case 'night':
      return 21;
    default:
      return null;
  }
}

function formatTime(value) {
  return value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function normalizeTimeToken(value) {
  return String(value)
    .replace(/\s+/g, '')
    .toUpperCase();
}

function sanitizeAiText(value) {
  return String(value)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

function formatLastIntent(intent) {
  if (!intent?.command) {
    return 'none';
  }

  return intent.args ? `${intent.command} (${intent.args})` : intent.command;
}

function formatPreferencesForPrompt(preferences) {
  if (!preferences || typeof preferences !== 'object' || Object.keys(preferences).length === 0) {
    return 'none';
  }

  return JSON.stringify(preferences);
}

module.exports = {
  isAiConfigured,
  generateAiBriefing,
  generateAiFocus,
  generateAiWrapUp,
  generateAiConversation
};
