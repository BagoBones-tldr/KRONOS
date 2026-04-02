const fs = require('fs/promises');
const path = require('path');

const TELEGRAM_STATE_PATH = path.join(__dirname, 'telegram-state.json');

async function loadTelegramState() {
  try {
    const raw = await fs.readFile(TELEGRAM_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      nextOffset: typeof parsed.nextOffset === 'number' ? parsed.nextOffset : undefined
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function saveTelegramState(state) {
  await fs.writeFile(TELEGRAM_STATE_PATH, JSON.stringify(state, null, 2));
}

module.exports = {
  loadTelegramState,
  saveTelegramState
};
