const { readJson, writeJson } = require('./storage');
const { STORAGE_PATHS, LEGACY_STORAGE_PATHS } = require('./storage-layout');

const CONVERSATION_STATE_PATH = STORAGE_PATHS.conversationState;
const LEGACY_CONVERSATION_STATE_PATH = LEGACY_STORAGE_PATHS.conversationState;
const MAX_TURNS_PER_CHAT = 16;
const SUMMARIZE_AT = 12;
const KEEP_AFTER_SUMMARIZE = 4;

async function loadConversationState() {
  const parsed = await readJson(CONVERSATION_STATE_PATH, null) ?? await readJson(LEGACY_CONVERSATION_STATE_PATH, { chats: {} });
  return parsed && typeof parsed === 'object' ? parsed : { chats: {} };
}

async function saveConversationState(state) {
  await writeJson(CONVERSATION_STATE_PATH, state);
}

function getChatConversation(state, chatId) {
  const chats = state?.chats || {};
  const entry = chats[String(chatId)] || {};

  return {
    recentTurns: Array.isArray(entry.recentTurns) ? entry.recentTurns.slice(-MAX_TURNS_PER_CHAT) : [],
    lastIntent: entry.lastIntent || null,
    summary: entry.summary || null
  };
}

function updateChatConversation(state, chatId, updates) {
  const nextState = state && typeof state === 'object' ? state : { chats: {} };
  nextState.chats = nextState.chats || {};

  const existing = getChatConversation(nextState, chatId);
  const nextTurns = Array.isArray(updates.recentTurns)
    ? updates.recentTurns.slice(-MAX_TURNS_PER_CHAT)
    : existing.recentTurns;

  nextState.chats[String(chatId)] = {
    recentTurns: nextTurns,
    lastIntent: updates.lastIntent || existing.lastIntent || null,
    summary: updates.summary !== undefined ? updates.summary : existing.summary
  };

  return nextState;
}

function appendConversationTurn(conversation, role, text) {
  const nextTurns = [...(conversation?.recentTurns || []), {
    role,
    text: String(text || '').trim(),
    timestamp: new Date().toISOString()
  }].filter(turn => turn.text).slice(-MAX_TURNS_PER_CHAT);

  return {
    recentTurns: nextTurns,
    lastIntent: conversation?.lastIntent || null,
    summary: conversation?.summary || null
  };
}

function getTurnsForSummarization(conversation) {
  const turns = conversation?.recentTurns || [];
  if (turns.length < SUMMARIZE_AT) return null;
  return {
    toSummarize: turns.slice(0, turns.length - KEEP_AFTER_SUMMARIZE),
    toKeep: turns.slice(turns.length - KEEP_AFTER_SUMMARIZE)
  };
}

module.exports = {
  loadConversationState,
  saveConversationState,
  getChatConversation,
  updateChatConversation,
  appendConversationTurn,
  getTurnsForSummarization,
  SUMMARIZE_AT
};
