const Anthropic = require('@anthropic-ai/sdk');
const { buildKronosSystemPrompt } = require('./ai-policy');
const { loadMemoryContext } = require('./memory-service');

const DEFAULT_MODEL = 'claude-sonnet-4-6';

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
    console.warn('[ai] generateAiBriefing: no API key configured, skipping.');
    return { text: null, failReason: 'no API key configured' };
  }

  try {
    const firstPass = await requestAnthropicText(buildBriefingPrompt(context), {
      maxTokens: 260,
      temperature: 0.35
    });
    if (isValidAiTimeReference(firstPass, context)) {
      return { text: firstPass || null, failReason: null };
    }

    console.warn('[ai] generateAiBriefing: first pass failed time validation, retrying with forbidClockTimes.');

    const safePass = await requestAnthropicText(buildBriefingPrompt(context, {
      forbidClockTimes: true
    }), {
      maxTokens: 260,
      temperature: 0.35
    });
    if (isValidAiTimeReference(safePass, context)) {
      return { text: safePass || null, failReason: null };
    }

    console.warn('[ai] generateAiBriefing: both passes failed time validation, falling back to deterministic.');
    return { text: null, failReason: 'time validation failed (both passes)' };
  } catch (error) {
    console.warn('[ai] generateAiBriefing: API error:', error.message);
    return { text: null, failReason: `API error: ${error.message}` };
  }
}

async function checkAnthropicConnectivity() {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return { ok: false, reason: 'no API key configured' };
  }

  try {
    const result = await anthropic.models.list({ limit: 1 });
    const modelId = result.data?.[0]?.id || 'unknown';
    return { ok: true, modelId };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
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
  const system = await buildConversationSystem(options);

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 220,
    temperature: 0.3,
    system,
    messages
  });

  const text = extractText(response).trim();
  if (!text) {
    return null;
  }

  // Pass ACTION responses through as-is for caller to dispatch
  if (text.startsWith('ACTION: /')) {
    return text;
  }

  return isValidConversationalResponse(text) ? text : null;
}

async function summarizeConversationTurns(turns, existingSummary = null) {
  const anthropic = getAnthropicClient();
  if (!anthropic || !Array.isArray(turns) || turns.length === 0) {
    return null;
  }

  const formatted = turns
    .map(t => `${t.role === 'assistant' ? 'KRONOS' : 'User'}: ${t.text}`)
    .join('\n');

  let prompt = 'Summarize this conversation in 2-3 sentences for use as prior context in a continuing session. Cover what was discussed, what was resolved, and any context worth carrying forward. Plain text only.\n\n';
  if (existingSummary) {
    prompt += `Earlier context: ${existingSummary}\n\n`;
  }
  prompt += `Conversation:\n${formatted}`;

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 120,
      temperature: 0.2,
      system: 'You are a concise summarizer. Output plain text only.',
      messages: [{ role: 'user', content: prompt }]
    });
    return extractText(response).trim() || null;
  } catch {
    return null;
  }
}

async function requestAnthropicText(prompt, options = {}) {
  const anthropic = getAnthropicClient();
  const systemText = options.system || buildKronosSystemPrompt();
  const requestParams = {
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: options.maxTokens || 320,
    temperature: options.temperature ?? 0.4,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
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
// Returns an array of content blocks: stable (cacheable) + volatile (session-specific).
// Splitting lets the API cache the stable prefix across requests within the same session.
async function buildConversationSystem(options = {}) {
  const capabilities = options.capabilities || [];
  const base = buildKronosSystemPrompt();

  const conversationRules = [
    '',
    'Conversation behavior:',
    '- Lead with the answer. Do not open with a preamble, role explanation, or capability list.',
    '- Mirror message length. A one-sentence message gets one or two sentences back — not a paragraph.',
    '- If the message is casual, respond casually. Do not pivot to schedule data or commands unprompted.',
    '- Use 1-2 fitting emojis for a standard reply, 2-3 only if the reply is clearly longer.',
    '- Do not redirect casual conversation into planning or commands unless the user clearly asks for that.',
    '- When making a suggestion, offer one good one — not a list.',
    '- If unsure what the user wants, say so in one sentence and offer one likely next step.',
    '- Do not mention weather unless the user asks or the message is clearly about a daily plan.',
    '- Prefer direct, natural lines over assistant filler.',
    '- Do not over-explain simple greetings or acknowledgements.',
    '',
    'Intent routing:',
    '- If the user is clearly asking for live schedule or calendar data, respond with exactly: ACTION: /command [args] — nothing else.',
    '- Use this for: today\'s schedule (/today), tomorrow (/tomorrow), the week (/week), events on a date (/events [date]), next event (/next), free blocks (/free [date]), busy time (/busy [date]), weather (/weather), when is an event (/whenis [name]), conflicts (/conflicts), availability check (/availability [query]).',
    '- Do NOT trigger ACTION for write operations (/add, /remind, /remove, /task) — those need explicit user intent.',
    '- Only output ACTION when confident. Casual, ambiguous, or follow-up messages should be answered conversationally.',
    '- Examples: "do I have anything Tuesday?" → ACTION: /events tuesday | "what\'s the weather?" → ACTION: /weather | "when is my dentist?" → ACTION: /whenis dentist | "am I free Friday afternoon?" → ACTION: /availability friday afternoon | "what\'s next on my calendar?" → ACTION: /next | "how\'s my week looking?" → ACTION: /week | "any conflicts today?" → ACTION: /conflicts | "am I free at 3?" → ACTION: /availability today at 3 | "what am I doing this weekend?" → ACTION: /events this weekend'
  ];

  const longTermMemory = loadMemoryContext();

  const contextLines = [
    'Session context:',
    `Current date: ${options.dateLabel || 'unknown'}`,
    `Runtime source: ${options.instanceLabel || 'unknown'}`,
    `Last resolved intent: ${formatLastIntent(options.lastIntent)}`,
    `Saved preferences: ${formatPreferencesForPrompt(options.preferences)}`,
    `Conversation summary: ${options.summary || 'none'}`,
    `Long-term memory: ${longTermMemory}`,
    `Known capabilities: ${capabilities.join(', ') || 'calendar briefings, focus cues, events, weather, status, log'}`
  ];

  const stableText = [base, ...conversationRules].join('\n');
  const volatileText = contextLines.join('\n');

  return [
    { type: 'text', text: stableText, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatileText }
  ];
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

  // Cache the last assistant turn so growing history is reused across requests in the same session
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  if (lastAssistant) {
    lastAssistant.content = [{ type: 'text', text: lastAssistant.content, cache_control: { type: 'ephemeral' } }];
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
    'i changed your schedule',
    'i deleted',
    'i removed',
    'i set a reminder',
    'i scheduled',
    'i booked',
    'i cancelled',
    'i completed',
    'i marked',
    'i sent you',
    "i'll remind you",
    'i will remind you',
    "i'll send",
    'i will send',
    'i noted that',
    'i saved that',
    'i have set',
    'i just added',
    'i just created',
    'i just scheduled'
  ];

  if (forbiddenClaims.some(claim => lowered.includes(claim))) {
    return false;
  }

  // Block fake command-confirmation formatting: /add, /remove, /remind followed by pipe-separated fields + checkmark
  if (/\/(?:add|remove|remind|create|delete)\b.+[|｜].+[✅✓☑]/.test(text)) {
    return false;
  }

  return true;
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
  // Strip all whitespace including narrow no-break space (U+202F) produced by Node 18+ ICU
  return String(value)
    .replace(/[^A-Za-z0-9:]/g, '')
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
  generateAiConversation,
  summarizeConversationTurns,
  checkAnthropicConnectivity
};
