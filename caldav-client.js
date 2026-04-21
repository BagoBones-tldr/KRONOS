const { loadEnv } = require('./env');
const { DAVClient } = require('tsdav');

loadEnv();

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function createCalendarClient() {
  const client = new DAVClient({
    serverUrl: process.env.CALDAV_SERVER_URL || 'https://caldav.icloud.com',
    credentials: {
      username: getEnv('APPLE_ID'),
      password: getEnv('APPLE_PASS')
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav'
  });

  await client.login();
  return client;
}

module.exports = {
  createCalendarClient
};
