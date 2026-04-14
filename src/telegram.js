// src/telegram.js
// ─── Telegram Bot API wrapper ───

const TG_API = 'https://api.telegram.org/bot';
const MAX_MESSAGE_LENGTH = 4096;

// ─── Send typing indicator ───
async function sendTyping(botToken, chatId) {
  try {
    await fetch(`${TG_API}${botToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
  } catch {
    // Non-critical, ignore
  }
}

// ─── Send message with auto-chunking for long texts ───
async function sendMessage(botToken, chatId, text, opts = {}) {
  const chunks = splitMessage(text);
  const results = [];

  for (const chunk of chunks) {
    const body = {
      chat_id: chatId,
      text: chunk,
      parse_mode: opts.parseMode || undefined,
      disable_web_page_preview: true,
    };

    if (opts.replyMarkup) {
      // Only add markup to last chunk
      if (chunk === chunks[chunks.length - 1]) {
        body.reply_markup = opts.replyMarkup;
      }
    }

    const res = await fetch(`${TG_API}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!data.ok) {
      throw new TelegramError(data.description || 'Unknown error', data.error_code);
    }

    results.push(data.result);
  }

  return results;
}

// ─── Split long messages at paragraph/sentence boundaries ───
function splitMessage(text) {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Find best split point: paragraph break > sentence > word > hard cut
    let splitAt = remaining.lastIndexOf('\n\n', MAX_MESSAGE_LENGTH);
    if (splitAt < MAX_MESSAGE_LENGTH * 0.3) {
      splitAt = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    }
    if (splitAt < MAX_MESSAGE_LENGTH * 0.3) {
      splitAt = remaining.lastIndexOf('. ', MAX_MESSAGE_LENGTH);
      if (splitAt > 0) splitAt += 1; // include the period
    }
    if (splitAt < MAX_MESSAGE_LENGTH * 0.3) {
      splitAt = remaining.lastIndexOf(' ', MAX_MESSAGE_LENGTH);
    }
    if (splitAt < MAX_MESSAGE_LENGTH * 0.3) {
      splitAt = MAX_MESSAGE_LENGTH; // hard cut
    }

    chunks.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }

  return chunks;
}

// ─── Register webhook for a bot ───
async function setWebhook(botToken, webhookUrl, secretToken) {
  const body = {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
    max_connections: 100,
  };

  if (secretToken) {
    body.secret_token = secretToken;
  }

  const res = await fetch(`${TG_API}${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new TelegramError(data.description || 'setWebhook failed', data.error_code);
  }
  return data;
}

// ─── Set bot name and description ───
async function setBotInfo(botToken, { name, description, shortDescription }) {
  const calls = [];

  if (name) {
    calls.push(
      fetch(`${TG_API}${botToken}/setMyName`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
    );
  }

  if (description) {
    calls.push(
      fetch(`${TG_API}${botToken}/setMyDescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
    );
  }

  if (shortDescription) {
    calls.push(
      fetch(`${TG_API}${botToken}/setMyShortDescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ short_description: shortDescription }),
      })
    );
  }

  await Promise.allSettled(calls);
}

// ─── Check bot is alive ───
async function getMe(botToken) {
  const res = await fetch(`${TG_API}${botToken}/getMe`);
  const data = await res.json();
  if (!data.ok) throw new TelegramError(data.description, data.error_code);
  return data.result;
}

// ─── Send admin alert ───
async function alertAdmin(adminBotToken, adminChatId, message) {
  try {
    await sendMessage(adminBotToken, adminChatId, `⚠️ ALERT\n\n${message}`);
  } catch (err) {
    console.error('[TG] Failed to alert admin:', err.message);
  }
}

class TelegramError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TelegramError';
    this.code = code;
  }
}

module.exports = {
  sendTyping,
  sendMessage,
  splitMessage,
  setWebhook,
  setBotInfo,
  getMe,
  alertAdmin,
  TelegramError,
};
