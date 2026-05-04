const { readJson, writeJson } = require('./storage');
const { STORAGE_PATHS } = require('./storage-layout');

async function recordCommandUsage(command) {
  if (!command || command === '') return;

  try {
    const stats = await loadUsageStats();
    const hour = new Date().getHours();
    const key = command.replace(/^\//, '');

    if (!stats.commands[key]) {
      stats.commands[key] = { count: 0, hourly: {} };
    }

    stats.commands[key].count += 1;
    stats.commands[key].hourly[hour] = (stats.commands[key].hourly[hour] || 0) + 1;
    stats.lastUpdated = new Date().toISOString();

    await writeJson(STORAGE_PATHS.usageStats, stats);
  } catch {
    // non-critical, never throw
  }
}

async function loadUsageStats() {
  const parsed = await readJson(STORAGE_PATHS.usageStats, null);
  if (parsed && typeof parsed === 'object') return parsed;
  return { commands: {}, lastUpdated: null };
}

function formatUsageSummary(stats) {
  if (!stats || Object.keys(stats.commands || {}).length === 0) {
    return 'No usage data yet.';
  }

  const sorted = Object.entries(stats.commands)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 8);

  const lines = ['Most used commands:'];
  for (const [cmd, data] of sorted) {
    lines.push(`• /${cmd} — ${data.count}x`);
  }

  if (stats.lastUpdated) {
    lines.push(`\nLast activity: ${new Date(stats.lastUpdated).toLocaleString()}`);
  }

  return lines.join('\n');
}

module.exports = {
  recordCommandUsage,
  loadUsageStats,
  formatUsageSummary
};
