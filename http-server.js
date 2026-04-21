const { loadEnv } = require('./env');

loadEnv();

const express = require('express');
const { buildCommandResult } = require('./command-service');
const {
  loadConversationState,
  saveConversationState,
  getChatConversation,
  updateChatConversation,
  appendConversationTurn
} = require('./conversation-state');

const PORT = parseInt(process.env.HTTP_PORT || '3001', 10);
const KRONOS_KEY = process.env.KRONOS_HTTP_KEY || '';
const HTTP_CHAT_ID = 'http';

const app = express();
app.use(express.json());

// Auth middleware
app.use((req, res, next) => {
  if (!KRONOS_KEY) {
    console.warn('Warning: KRONOS_HTTP_KEY is not set. All requests will be accepted.');
    return next();
  }

  const provided = req.headers['x-kronos-key'];
  if (provided !== KRONOS_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
});

app.post('/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const conversationState = await loadConversationState();
    const chatConversation = getChatConversation(conversationState, HTTP_CHAT_ID);

    const result = await buildCommandResult(message, new Date(), chatConversation);
    const response = result.text;

    const withUser = appendConversationTurn(chatConversation, 'user', message);
    const withAssistant = appendConversationTurn(withUser, 'assistant', response);
    const nextState = updateChatConversation(conversationState, HTTP_CHAT_ID, {
      recentTurns: withAssistant.recentTurns,
      lastIntent: result.intent
    });
    await saveConversationState(nextState);

    res.json({ response });
  } catch (err) {
    console.error('POST /chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`KRONOS HTTP server listening on port ${PORT}`);
});
