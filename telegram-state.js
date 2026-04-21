const { readJson, writeJson } = require('./storage');
const { STORAGE_PATHS, LEGACY_STORAGE_PATHS } = require('./storage-layout');

const TELEGRAM_STATE_PATH = STORAGE_PATHS.telegramState;
const LEGACY_TELEGRAM_STATE_PATH = LEGACY_STORAGE_PATHS.telegramState;

async function loadTelegramState() {
  const parsed = await readJson(TELEGRAM_STATE_PATH, null) ?? await readJson(LEGACY_TELEGRAM_STATE_PATH, {});
  return {
    nextOffset: typeof parsed?.nextOffset === 'number' ? parsed.nextOffset : undefined
  };
}

async function saveTelegramState(state) {
  await writeJson(TELEGRAM_STATE_PATH, state);
}

module.exports = {
  loadTelegramState,
  saveTelegramState
};
