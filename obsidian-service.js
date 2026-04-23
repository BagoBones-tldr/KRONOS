const fs = require('fs');
const path = require('path');
const { getKronosNotesDir } = require('./runtime-paths');

function journalDir() {
  return path.join(getKronosNotesDir(), 'dev-journal');
}

function todayFilePath() {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: process.env.BRIEFING_TIMEZONE || 'America/Chicago'
  });
  return path.join(journalDir(), `${today}.md`);
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: process.env.BRIEFING_TIMEZONE || 'America/Chicago',
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
      timeZone: process.env.BRIEFING_TIMEZONE || 'America/Chicago',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    fs.writeFileSync(filePath, `# ${today}\n\n${entry}`);
  } else {
    fs.appendFileSync(filePath, entry);
  }

  return filePath;
}

module.exports = { appendNote };
