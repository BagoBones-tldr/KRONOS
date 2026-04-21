const crypto = require('crypto');
const { readJson, writeJson } = require('./storage');
const { STORAGE_PATHS, LEGACY_STORAGE_PATHS } = require('./storage-layout');

const TASK_STATE_PATH = STORAGE_PATHS.taskState;
const LEGACY_TASK_STATE_PATH = LEGACY_STORAGE_PATHS.taskState;

async function loadTaskState() {
  const parsed = await readJson(TASK_STATE_PATH, null) ?? await readJson(LEGACY_TASK_STATE_PATH, { tasks: [] });
  if (!parsed || typeof parsed !== 'object') {
    return { tasks: [] };
  }

  return {
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
  };
}

async function saveTaskState(state) {
  await writeJson(TASK_STATE_PATH, state);
}

function createTask(description, dueDate = null, options = {}) {
  return {
    id: crypto.randomUUID(),
    description: normalizeTaskText(description),
    className: normalizeOptionalText(options.className),
    createdAt: new Date().toISOString(),
    dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
    completedAt: null
  };
}

function normalizeTaskText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function getOpenTasks(state) {
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  return tasks.filter(task => !task.completedAt);
}

function getCompletedTasks(state) {
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  return tasks.filter(task => task.completedAt);
}

function addTask(state, description, dueDate = null, options = {}) {
  const next = state && typeof state === 'object' ? state : { tasks: [] };
  next.tasks = Array.isArray(next.tasks) ? next.tasks : [];

  const task = createTask(description, dueDate, options);
  next.tasks.push(task);
  return task;
}

function completeTask(state, query) {
  const matches = findMatchingOpenTasks(state, query);
  if (matches.length === 0) {
    throw new Error(`No open task matched "${query}".`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple open tasks matched "${query}". Be more specific.`);
  }

  const task = matches[0];
  task.completedAt = new Date().toISOString();
  return task;
}

function removeTask(state, query) {
  const openTasks = getOpenTasks(state);
  const matches = openTasks.filter(task => taskMatches(task, query));

  if (matches.length === 0) {
    throw new Error(`No open task matched "${query}".`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple open tasks matched "${query}". Be more specific.`);
  }

  const task = matches[0];
  state.tasks = state.tasks.filter(entry => entry.id !== task.id);
  return task;
}

function findMatchingOpenTasks(state, query) {
  return getOpenTasks(state).filter(task => taskMatches(task, query));
}

function taskMatches(task, query) {
  const normalizedTask = normalizeTaskText(task?.description).toLowerCase();
  const normalizedClass = normalizeTaskText(task?.className || '').toLowerCase();
  const normalizedQuery = normalizeTaskText(query)
    .toLowerCase()
    .replace(/^(?:my|the)\s+/, '');

  return normalizedTask.includes(normalizedQuery) || normalizedClass.includes(normalizedQuery);
}

function formatTaskLine(task) {
  const dueLabel = formatDueDate(task?.dueDate);
  const classLabel = task?.className ? ` for ${task.className}` : '';
  return dueLabel
    ? `• ${task.description}${classLabel} (${dueLabel})`
    : `• ${task.description}${classLabel}`;
}

function formatDueDate(isoString) {
  if (!isoString) {
    return '';
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }

  const timeLabel = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
  const hasExplicitTime = !(date.getHours() === 0 && date.getMinutes() === 0);
  return hasExplicitTime
    ? `due ${date.toDateString()} at ${timeLabel}`
    : `due ${date.toDateString()}`;
}

function normalizeOptionalText(value) {
  const normalized = normalizeTaskText(value);
  return normalized || null;
}

module.exports = {
  loadTaskState,
  saveTaskState,
  getOpenTasks,
  getCompletedTasks,
  addTask,
  completeTask,
  removeTask,
  formatTaskLine
};
