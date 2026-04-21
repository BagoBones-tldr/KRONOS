const { loadEnv } = require('../env');
const { getStorageRoot, resolveStoragePath, readJson, writeJson } = require('../storage');

loadEnv();

const TEST_PATH = 'state/storage-smoke-test.json';

async function main() {
  const payload = {
    ok: true,
    checkedAt: new Date().toISOString(),
    storageRoot: getStorageRoot()
  };

  await writeJson(TEST_PATH, payload);
  const readBack = await readJson(TEST_PATH, null);

  if (!readBack?.ok) {
    throw new Error('Storage smoke test failed: data could not be read back cleanly.');
  }

  console.log(`Storage root: ${getStorageRoot()}`);
  console.log(`Resolved path: ${resolveStoragePath(TEST_PATH)}`);
  console.log('Storage smoke test passed.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
