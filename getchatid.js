require('dotenv').config();

async function getChatId() {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getUpdates`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

getChatId().catch(console.error);
