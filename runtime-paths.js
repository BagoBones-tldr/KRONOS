const path = require('path');
const os = require('os');

function getProjectRoot() {
  return __dirname;
}

function getObsidianRoot() {
  return process.env.KRONOS_OBSIDIAN_DIR || path.join(os.homedir(), 'Documents', 'Obsidian Vault');
}

function getKronosNotesDir() {
  return process.env.KRONOS_OBSIDIAN_NOTES_DIR || path.join(getObsidianRoot(), 'KRONOS Notes');
}

function getBriefingsDir() {
  return process.env.KRONOS_BRIEFINGS_PATH || path.join(getKronosNotesDir(), 'briefings');
}

module.exports = {
  getProjectRoot,
  getObsidianRoot,
  getKronosNotesDir,
  getBriefingsDir
};
