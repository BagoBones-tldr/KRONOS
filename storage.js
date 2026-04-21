const fs = require('fs/promises');
const path = require('path');
const { loadEnv } = require('./env');

loadEnv();

function getStorageRoot() {
  const configured = (process.env.KRONOS_STORAGE_PATH || '').trim();
  return configured || __dirname;
}

function resolveStoragePath(targetPath) {
  const value = String(targetPath || '').trim();
  if (!value) {
    throw new Error('Storage path is required.');
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.join(getStorageRoot(), value);
}

async function ensureParentDir(targetPath) {
  const resolved = resolveStoragePath(targetPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  return resolved;
}

async function readJson(targetPath, fallbackValue = null) {
  try {
    const raw = await fs.readFile(resolveStoragePath(targetPath), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }
    throw error;
  }
}

async function writeJson(targetPath, value) {
  const resolved = await ensureParentDir(targetPath);
  await fs.writeFile(resolved, JSON.stringify(value, null, 2));
  return resolved;
}

async function readText(targetPath, fallbackValue = null) {
  try {
    return await fs.readFile(resolveStoragePath(targetPath), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }
    throw error;
  }
}

async function writeText(targetPath, value) {
  const resolved = await ensureParentDir(targetPath);
  await fs.writeFile(resolved, String(value));
  return resolved;
}

module.exports = {
  getStorageRoot,
  resolveStoragePath,
  readJson,
  writeJson,
  readText,
  writeText
};
