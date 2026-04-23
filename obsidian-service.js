const fs = require('fs');
const path = require('path');
const { getKronosNotesDir } = require('./runtime-paths');

const DEFAULT_TIMEZONE = DEFAULT_TIMEZONE;

function journalDir() {
  return path.join(getKronosNotesDir(), 'dev-journal');
}

function todayFilePath() {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: DEFAULT_TIMEZONE
  });
  return path.join(journalDir(), `${today}.md`);
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function appendNote(text) {
  const dir = journalDir();
  fs.mkdirSync(dir, { recursive: true });

  const filePath = todayFilePath();
  const entry = `- ${timestamp()} — ${text}\n`;

  if (!fs.existsSync(filePath)) {
    const today = new Date().toLocaleDateString('en-US', {
      timeZone: DEFAULT_TIMEZONE,
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    fs.writeFileSync(filePath, `# ${today}\n\n${entry}`);
  } else {
    fs.appendFileSync(filePath, entry);
  }

  return filePath;
}

module.exports = { appendNote };
