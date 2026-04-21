const STATE_DIR = 'state';

const STORAGE_PATHS = {
  telegramState: `${STATE_DIR}/telegram.json`,
  conversationState: `${STATE_DIR}/conversations.json`,
  preferenceState: `${STATE_DIR}/preferences.json`,
  taskState: `${STATE_DIR}/tasks.json`,
  alertState: `${STATE_DIR}/alerts.json`,
  endOfDayState: `${STATE_DIR}/end-of-day.json`,
  reminderState: `${STATE_DIR}/reminders.json`
};

const LEGACY_STORAGE_PATHS = {
  telegramState: 'telegram-state.json',
  conversationState: 'conversation-state.json',
  preferenceState: 'preferences-state.json',
  taskState: 'tasks-state.json',
  alertState: 'alerts-state.json',
  endOfDayState: 'end-of-day-state.json',
  reminderState: 'reminders-state.json'
};

module.exports = {
  STATE_DIR,
  STORAGE_PATHS,
  LEGACY_STORAGE_PATHS
};
