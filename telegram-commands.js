const { loadEnv } = require('./env');

const { buildCommandResult } = require('./command-service');
const { getUpdates, sendTelegramMessage, sendChatAction, getRequiredEnv } = require('./telegram-service');
const { loadTelegramState, saveTelegramState } = require('./telegram-state');
const {
  loadConversationState,
  saveConversationState,
  getChatConversation,
  updateChatConversation,
  appendConversationTurn
} = require('./conversation-state');

loadEnv();

const LONG_POLL_TIMEOUT = 25;

async function processMessage(message, conversationState, allowedChatId) {
  const text = message?.text;
  const chatId = String(message?.chat?.id || '');

  if (!text || chatId !== String(allowedChatId)) {
    if (chatId && chatId !== String(allowedChatId)) {
      console.log(`Skipping message from unauthorized chat: ${chatId}`);
    }
    return;
  }

  // Acknowledge immediately so the user sees KRONOS is working
  sendChatAction(chatId).catch(() => {});

  console.log(`Received: ${text}`);

  const chatConversation = getChatConversation(conversationState, chatId);
  const result = await buildCommandResult(text, new Date(), chatConversation);
  const response = result.text;

  if (process.env.DRY_RUN === '1') {
    console.log(response);
  } else {
    await sendTelegramMessage(chatId, response);
  }

  const withUserTurn = appendConversationTurn(chatConversation, 'user', text);
  const withAssistantTurn = appendConversationTurn(withUserTurn, 'assistant', response);
  updateChatConversation(conversationState, chatId, {
    recentTurns: withAssistantTurn.recentTurns,
    lastIntent: result.intent
  });
}

async function runPollingLoop() {
  const allowedChatId = getRequiredEnv('TELEGRAM_CHAT_ID');
  const state = await loadTelegramState();
  const conversationState = await loadConversationState();
  let nextOffset = state.nextOffset;

  console.log('Telegram command poller started (long polling).');

  while (true) {
    let updates = [];

    try {
      updates = await getUpdates({ offset: nextOffset, timeout: LONG_POLL_TIMEOUT });
    } catch (err) {
      console.error('getUpdates error:', err.message);
      await sleep(3000);
      continue;
    }

    for (const update of updates) {
      nextOffset = update.update_id + 1;
      const message = update.message || null;
      const editedMessage = update.edited_message || null;

      if (!message && editedMessage && process.env.ALLOW_EDITED_MESSAGES !== '1') {
        continue;
      }

      try {
        await processMessage(message || editedMessage, conversationState, allowedChatId);
      } catch (err) {
        console.error('Error processing message:', err.message);
      }
    }

    if (nextOffset && process.env.DRY_RUN !== '1') {
      await saveTelegramState({ nextOffset });
      await saveConversationState(conversationState);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

runPollingLoop().catch(error => {
  console.error('Telegram poller fatal error:', error.message);
  process.exitCode = 1;
});
