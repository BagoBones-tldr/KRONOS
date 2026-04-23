#!/usr/bin/env node
const { loadEnv } = require('../env');
loadEnv();

const { appendNote } = require('../obsidian-service');

const text = process.argv.slice(2).join(' ').trim();

if (!text) {
  console.error('Usage: node scripts/note.js "your note here"');
  process.exit(1);
}

try {
  const filePath = appendNote(text);
  console.log(`Logged to ${filePath}`);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
