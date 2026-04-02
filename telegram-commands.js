const { loadEnv } = require('./env');

const { buildCommandResponse } = require('./command-service');
const { getUpdates, sendTelegramMessage, getRequiredEnv } = require('./telegram-service');
const { loadTelegramState, saveTelegramState } = require('./telegram-state');

loadEnv();

async function processUpdates() {
  const allowedChatId = getRequiredEnv('TELEGRAM_CHAT_ID');
  const state = await loadTelegramState();
  let nextOffset = state.nextOffset;

  console.log('Telegram command poller started.');

  const updates = await getUpdates({
    offset: nextOffset
  });

  if (updates.length === 0) {
    console.log('No pending Telegram updates.');
    return;
  }
 
  let processed = 0;
  for (const update of updates) {
    nextOffset = update.update_id + 1;

    const message = update.message || update.edited_message;
    const text = message?.text;
    const chatId = String(message?.chat?.id || '');

    if (!text || !text.startsWith('/')) {
      continue;
    }

    if (chatId !== String(allowedChatId)) {
      console.log(`Skipping command from unauthorized chat: ${chatId}`);
      continue;
    }

    const response = await buildCommandResponse(text, new Date());
    console.log(`Replying to ${text}`);

    if (process.env.DRY_RUN === '1') {
      console.log(response);
    } else {
      await sendTelegramMessage(chatId, response);
    }

    processed += 1;
  }

  if (nextOffset && process.env.DRY_RUN !== '1') {
    await saveTelegramState({ nextOffset });
  }

  if (process.env.DRY_RUN === '1') {
    console.log(`Dry run complete. Next offset would be ${nextOffset}.`);
    return;
  }

  if (processed > 0) {
    console.log(`Processed ${processed} command(s).`);
  }
}

processUpdates().catch(error => {
  console.error('Telegram command poller error:', error.message);
  process.exitCode = 1;
});
