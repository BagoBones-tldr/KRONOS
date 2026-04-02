const { loadEnv } = require('./env');
const { getUpdates } = require('./telegram-service');

loadEnv();

async function getChatId() {
  const data = await getUpdates();
  console.log(JSON.stringify(data, null, 2));
}

getChatId().catch(console.error);
