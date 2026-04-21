const { readJson, writeJson } = require('./storage');
const { STORAGE_PATHS, LEGACY_STORAGE_PATHS } = require('./storage-layout');

const PREFERENCE_STATE_PATH = STORAGE_PATHS.preferenceState;
const LEGACY_PREFERENCE_STATE_PATH = LEGACY_STORAGE_PATHS.preferenceState;

async function loadPreferences() {
  const parsed = await readJson(PREFERENCE_STATE_PATH, null) ?? await readJson(LEGACY_PREFERENCE_STATE_PATH, {});
  return parsed && typeof parsed === 'object' ? parsed : {};
}

async function savePreferences(preferences) {
  await writeJson(PREFERENCE_STATE_PATH, preferences);
}

function normalizePreferenceValue(value) {
  return String(value || '').trim();
}

function applyPreferenceUpdate(preferences, update) {
  const next = { ...(preferences || {}) };

  if (update.type === 'nickname') {
    next.nickname = normalizePreferenceValue(update.value);
  }

  if (update.type === 'workout_time') {
    next.preferredWorkoutTime = normalizePreferenceValue(update.value);
  }

  if (update.type === 'focus_style') {
    next.preferredFocusStyle = normalizePreferenceValue(update.value);
  }

  if (update.type === 'planning_style') {
    next.preferredPlanningStyle = normalizePreferenceValue(update.value);
  }

  if (update.type === 'general_note') {
    const notes = Array.isArray(next.notes) ? next.notes : [];
    const value = normalizePreferenceValue(update.value);
    next.notes = [...notes.filter(note => note !== value), value].slice(-8);
  }

  return next;
}

function formatPreferences(preferences) {
  const lines = [];

  if (preferences.nickname) {
    lines.push(`Nickname: ${preferences.nickname}`);
  }
  if (preferences.preferredWorkoutTime) {
    lines.push(`Preferred workout time: ${preferences.preferredWorkoutTime}`);
  }
  if (preferences.preferredFocusStyle) {
    lines.push(`Preferred focus style: ${preferences.preferredFocusStyle}`);
  }
  if (preferences.preferredPlanningStyle) {
    lines.push(`Preferred planning style: ${preferences.preferredPlanningStyle}`);
  }
  if (Array.isArray(preferences.notes) && preferences.notes.length > 0) {
    for (const note of preferences.notes.slice(-4)) {
      lines.push(`Note: ${note}`);
    }
  }

  return lines;
}

module.exports = {
  loadPreferences,
  savePreferences,
  applyPreferenceUpdate,
  formatPreferences
};
