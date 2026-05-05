const fs = require('fs');
const path = require('path');
const { getMemoryDir } = require('./runtime-paths');

const USER_PROFILE_FILE = 'user-profile.md';
const PATTERNS_FILE = 'patterns.md';
const CONTEXT_FILE = 'context.md';

const CONTEXT_RETENTION_DAYS = 14;
const MEMORY_INJECTION_LIMIT = 1200; // ~200 tokens in characters

// ─── Read helpers ────────────────────────────────────────────────────────────

function memoryPath(filename) {
  return path.join(getMemoryDir(), filename);
}

function readMemoryFile(filename) {
  try {
    return fs.readFileSync(memoryPath(filename), 'utf8');
  } catch {
    return null;
  }
}

// ─── Write helpers ───────────────────────────────────────────────────────────

function ensureMemoryDir() {
  try {
    fs.mkdirSync(getMemoryDir(), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function writeMemoryFile(filename, content) {
  try {
    if (!ensureMemoryDir()) return false;
    fs.writeFileSync(memoryPath(filename), content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

// ─── user-profile.md ─────────────────────────────────────────────────────────

function appendUserFact(type, value) {
  try {
    const existing = readMemoryFile(USER_PROFILE_FILE) || '# User Profile\n';
    const timestamp = new Date().toLocaleDateString('en-CA');
    const label = formatFactLabel(type);
    const line = `- **${label}:** ${value} _(${timestamp})_`;

    // Replace existing line for this type if present, otherwise append
    const typeMarker = `**${label}:**`;
    const lines = existing.split('\n');
    const idx = lines.findIndex(l => l.includes(typeMarker));

    let updated;
    if (idx !== -1) {
      lines[idx] = line;
      updated = lines.join('\n');
    } else {
      updated = existing.trimEnd() + '\n' + line + '\n';
    }

    writeMemoryFile(USER_PROFILE_FILE, updated);
  } catch {
    // non-critical
  }
}

function formatFactLabel(type) {
  const labels = {
    nickname: 'Name',
    workout_time: 'Workout time',
    focus_style: 'Focus style',
    planning_style: 'Planning style',
    general_note: 'Note'
  };
  return labels[type] || type;
}

// ─── context.md ──────────────────────────────────────────────────────────────

function appendContext(summary) {
  try {
    const existing = readMemoryFile(CONTEXT_FILE) || '# Context Log\n';
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
    const entry = `\n## ${timestamp}\n${summary.trim()}\n`;
    writeMemoryFile(CONTEXT_FILE, existing.trimEnd() + entry);
  } catch {
    // non-critical
  }
}

function trimContext() {
  try {
    const content = readMemoryFile(CONTEXT_FILE);
    if (!content) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CONTEXT_RETENTION_DAYS);

    const sections = content.split(/\n(?=## )/);
    const header = sections[0];
    const entries = sections.slice(1);

    const keep = [];
    const prune = [];

    for (const entry of entries) {
      const dateMatch = entry.match(/^## (.+)\n/);
      if (!dateMatch) { keep.push(entry); continue; }
      const entryDate = new Date(dateMatch[1]);
      if (isNaN(entryDate) || entryDate >= cutoff) {
        keep.push(entry);
      } else {
        prune.push(entry);
      }
    }

    if (prune.length === 0) return;

    // Summarize pruned entries into a single archived paragraph
    const archiveText = prune.map(e => e.replace(/^## .+\n/, '').trim()).join(' ');
    const archiveEntry = `\n## Archive (before ${cutoff.toLocaleDateString('en-CA')})\n${archiveText}\n`;

    writeMemoryFile(CONTEXT_FILE, header + archiveEntry + keep.join(''));
  } catch {
    // non-critical
  }
}

// ─── AI injection ─────────────────────────────────────────────────────────────

function loadMemoryContext() {
  try {
    const profile = readMemoryFile(USER_PROFILE_FILE);
    const context = readMemoryFile(CONTEXT_FILE);

    const parts = [];

    if (profile) {
      // Strip markdown header, keep bullet facts
      const facts = profile
        .split('\n')
        .filter(l => l.startsWith('- '))
        .join('\n');
      if (facts) parts.push(`User facts:\n${facts}`);
    }

    if (context) {
      // Keep only the last 3 context entries
      const sections = context.split(/\n(?=## )/).filter(s => s.startsWith('## '));
      const recent = sections.slice(-3).map(s => s.trim()).join('\n\n');
      if (recent) parts.push(`Recent context:\n${recent}`);
    }

    if (parts.length === 0) return 'none';

    const combined = parts.join('\n\n');
    // Hard cap to avoid token blowout
    return combined.length > MEMORY_INJECTION_LIMIT
      ? combined.slice(0, MEMORY_INJECTION_LIMIT) + '…'
      : combined;
  } catch {
    return 'none';
  }
}

// ─── /recall ─────────────────────────────────────────────────────────────────

function loadFullMemory() {
  const profile = readMemoryFile(USER_PROFILE_FILE);
  const patterns = readMemoryFile(PATTERNS_FILE);
  const context = readMemoryFile(CONTEXT_FILE);

  const sections = [];

  if (profile) {
    const facts = profile.split('\n').filter(l => l.startsWith('- ')).join('\n');
    if (facts) sections.push(`What I know about you:\n${facts}`);
  }

  if (context) {
    const entries = context.split(/\n(?=## )/).filter(s => s.startsWith('## '));
    const recent = entries.slice(-3);
    if (recent.length) {
      sections.push(`Recent context:\n${recent.map(e => e.trim()).join('\n\n')}`);
    }
  }

  if (patterns) {
    const lines = patterns.split('\n').filter(l => l.startsWith('- ')).join('\n');
    if (lines) sections.push(`Patterns:\n${lines}`);
  }

  if (sections.length === 0) return null;
  return sections.join('\n\n');
}

// ─── patterns.md ─────────────────────────────────────────────────────────────

function updatePatterns(usageStats) {
  try {
    if (!usageStats || !usageStats.commands) return;
    const sorted = Object.entries(usageStats.commands)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([cmd, data]) => `- /${cmd} — used ${data.count}x`);

    if (!sorted.length) return;
    const content = `# Patterns\n\n## Most used commands\n${sorted.join('\n')}\n`;
    writeMemoryFile(PATTERNS_FILE, content);
  } catch {
    // non-critical
  }
}

module.exports = {
  loadMemoryContext,
  loadFullMemory,
  appendUserFact,
  appendContext,
  trimContext,
  updatePatterns
};
