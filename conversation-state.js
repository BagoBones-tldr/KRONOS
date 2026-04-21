const { readJson, writeJson } = require('./storage');
const { STORAGE_PATHS, LEGACY_STORAGE_PATHS } = require('./storage-layout');

const CONVERSATION_STATE_PATH = STORAGE_PATHS.conversationState;
const LEGACY_CONVERSATION_STATE_PATH = LEGACY_STORAGE_PATHS.conversationState;
const MAX_TURNS_PER_CHAT = 8;

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
    lastIntent: entry.lastIntent || null
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
    lastIntent: updates.lastIntent || existing.lastIntent || null
  };

  return nextState;
}

function appendConversationTurn(conversation, role, text) {
  const nextTurns = [...(conversation?.recentTurns || []), {
    role,
    text: String(text || '').trim()
  }].filter(turn => turn.text).slice(-MAX_TURNS_PER_CHAT);

  return {
    recentTurns: nextTurns,
    lastIntent: conversation?.lastIntent || null
  };
}

module.exports = {
  loadConversationState,
  saveConversationState,
  getChatConversation,
  updateChatConversation,
  appendConversationTurn
};
