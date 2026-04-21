const { loadEnv } = require('./env');

loadEnv();

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getTelegramBaseUrl() {
  return `https://api.telegram.org/bot${getRequiredEnv('TELEGRAM_TOKEN')}`;
}

async function telegramRequest(method, payload = {}) {
  const response = await fetch(`${getTelegramBaseUrl()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Telegram API request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || 'unknown error'}`);
  }

  return Array.isArray(data.result) || data.result !== null ? data.result : [];
}

async function sendTelegramMessage(chatId, text) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML'
  });
}

async function sendChatAction(chatId, action = 'typing') {
  return telegramRequest('sendChatAction', {
    chat_id: chatId,
    action
  });
}

async function getUpdates(options = {}) {
  const payload = {};
  if (options.offset) {
    payload.offset = options.offset;
  }
  if (options.timeout) {
    payload.timeout = options.timeout;
  }

  return telegramRequest('getUpdates', payload);
}

module.exports = {
  getUpdates,
  sendTelegramMessage,
  sendChatAction,
  getRequiredEnv
};
