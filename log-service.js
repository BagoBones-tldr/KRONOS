const { readText } = require('./storage');

const KRONOS_LOG_PATH = 'KRONOS_LOG.md';

async function buildLogSummary() {
  const raw = await readText(KRONOS_LOG_PATH, '');

  const today = extractSection(raw, '## 📅 Today');
  const earlier = extractSection(raw, '## 🕰️ Earlier Sessions');
  const current = extractSection(raw, '## 🚀 Current KRONOS State');
  const future = extractSection(raw, '## 🔮 Where It’s Headed');
  const updates = extractAutomatedUpdates(raw);

  const lines = [
    'KRONOS development summary:',
    summarizeSection(today, [
      'Moved KRONOS into the live ~/Developer repo and switched background execution from nohup to launchd.',
      'Expanded Telegram commands and fixed formatting, edited-message handling, and faster polling.',
      'Marked the future path toward a server-based architecture.'
    ]),
    summarizeSection(earlier, [
      'Started from Apple Calendar plus a simple 8:00 AM Telegram notification.',
      'Pulled the repo out of Docker, moved it local, and removed hardcoded credentials.',
      'Refactored into modular services and added weather, commands, recurring event fixes, and pre-event reminders.'
    ]),
    summarizeSection(current, [
      'KRONOS now supports calendar briefings, weather, Telegram commands, alerts, conflict detection, and free/busy analysis.',
      'The active live workspace is the current project-kronos repo, and the old Documents copy is deprecated.'
    ]),
    summarizeSection(future, [
      'KRONOS is currently a deterministic assistant bot.',
      'The next major leap is a conversational brain and personalization layer on top of the existing infrastructure.'
    ])
  ].filter(Boolean);

  if (updates.length > 0) {
    lines.push('Recent implementation milestones:');
    for (const update of updates.slice(-3).reverse()) {
      lines.push(`• ${update.timestamp} — ${update.summary}`);
    }
  }

  return lines.join('\n');
}

function extractSection(content, heading) {
  const start = content.indexOf(heading);
  if (start === -1) {
    return '';
  }

  const nextHeading = content.indexOf('\n## ', start + heading.length);
  return content.slice(start, nextHeading === -1 ? content.length : nextHeading).trim();
}

function summarizeBullets(section, limit) {
  if (!section) {
    return '';
  }

  const lines = section.split('\n');
  const heading = lines[0].replace(/^##\s+/, '').trim();
  const bullets = lines
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .slice(0, limit)
    .map(line => `• ${line.slice(2)}`);

  if (bullets.length === 0) {
    return '';
  }

  return [`${heading}:`, ...bullets].join('\n');
}

function summarizeSection(section, fallbackLines) {
  if (!section) {
    return '';
  }

  const heading = section.split('\n')[0].replace(/^##\s+/, '').trim();
  return [`${heading}:`, ...fallbackLines.map(line => `• ${line}`)].join('\n');
}

function extractAutomatedUpdates(content) {
  const section = extractSection(content, '## 🤖 Automated Updates');
  if (!section) {
    return [];
  }

  const chunks = section.split('\n### ').slice(1);
  return chunks.map(chunk => {
    const [timestampLine, ...rest] = chunk.split('\n');
    const summaryLine = rest.find(line => line.trim().startsWith('- Summary:'));
    return {
      timestamp: timestampLine.trim(),
      summary: summaryLine
        ? summaryLine.replace(/^- Summary:\s*`?/, '').replace(/`$/, '').trim()
        : 'Update recorded'
    };
  });
}

module.exports = {
  buildLogSummary
};
