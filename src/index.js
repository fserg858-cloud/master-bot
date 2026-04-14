// src/index.js
// ═══════════════════════════════════════════════════════════════
//  SERGEEV AGENTS — MASTER BOT SERVICE
//  High-performance Telegram bot router
//  One service → thousands of client bots
// ═══════════════════════════════════════════════════════════════

const Fastify = require('fastify');
const cfg = require('./config').load();
const { Cache } = require('./cache');
const db = require('./db');
const claude = require('./claude');
const tg = require('./telegram');
const { RateLimiter } = require('./ratelimit');

// ─── Init services ───
db.init(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
claude.init(cfg);

const clientCache = new Cache(cfg.CACHE_MAX_SIZE, cfg.CACHE_TTL_MS);
const rateLimiter = new RateLimiter(cfg.RATE_LIMIT_PER_USER, 60_000);

// ─── Server ───
const app = Fastify({
  logger: {
    level: cfg.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: cfg.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  trustProxy: true,
  bodyLimit: 1_048_576, // 1MB
});

// ═══════════════════════════════════════════════════════════════
//  WEBHOOK ENDPOINT — receives ALL bot updates
//  URL: POST /bot/:botToken
//  Telegram sends updates here for each registered bot
// ═══════════════════════════════════════════════════════════════

app.post('/bot/:botToken', async (request, reply) => {
  const { botToken } = request.params;
  const update = request.body;

  // Acknowledge immediately — Telegram retries if no 200 within 60s
  reply.code(200).send({ ok: true });

  // Process async (don't block the response)
  processUpdate(botToken, update).catch(err => {
    request.log.error({ err, botToken: botToken.slice(-6) }, 'processUpdate failed');
  });
});

// ═══════════════════════════════════════════════════════════════
//  CORE: Process a single Telegram update
// ═══════════════════════════════════════════════════════════════

async function processUpdate(botToken, update) {
  // ── 1. Extract message ──
  const message = update.message || update.edited_message;
  if (!message) return; // callback_query, channel_post, etc — skip for now

  const chatId = message.chat.id;
  const userId = message.from.id;
  const userName = [message.from.first_name, message.from.last_name]
    .filter(Boolean).join(' ') || 'Unknown';
  const userText = extractText(message);

  if (!userText) return; // sticker, photo without caption, etc

  // ── 2. Rate limit per end-user ──
  const rlKey = `${botToken.slice(-8)}:${userId}`;
  const rl = rateLimiter.check(rlKey);
  if (!rl.allowed) {
    await tg.sendMessage(botToken, chatId,
      'Слишком много сообщений. Подождите немного и попробуйте снова.'
    );
    return;
  }

  // ── 3. Identify client (cached) ──
  let client = clientCache.get(botToken);
  if (!client) {
    client = await db.getClientByBotToken(botToken);
    if (!client) {
      console.warn(`[Bot] Unknown bot token: ...${botToken.slice(-6)}`);
      return; // unknown bot, ignore
    }
    clientCache.set(botToken, client);
  }

  const clientId = client.id;

  // ── 4. Check usage limits ──
  const usage = await db.checkUsage(clientId);

  if (!usage.allowed) {
    const msg = getUsageLimitMessage(usage, client);
    await tg.sendMessage(botToken, chatId, msg);
    return;
  }

  // ── 5. Trial nudges (70 / 90 requests) ──
  const nudgeMsg = getTrialNudge(usage, cfg);
  // Nudge will be appended after the bot's response

  // ── 6. Send typing indicator ──
  tg.sendTyping(botToken, chatId); // fire-and-forget

  // ── 7. Load conversation history ──
  const history = await db.getHistory(clientId, userId, cfg.MAX_HISTORY_MESSAGES);

  // ── 8. Load end user context (if exists) ──
  const endUser = await db.getEndUser(clientId, userId);

  // ── 9. Build system prompt ──
  const systemPrompt = buildSystemPrompt(client, endUser);

  // ── 10. Call Claude ──
  let response;
  try {
    response = await claude.generate(systemPrompt, history, userText);
  } catch (err) {
    console.error(`[Claude] Error for client ${clientId}:`, err.message);
    await db.logError(clientId, botToken, 'claude_error', err.message, {
      userId, userText: userText.substring(0, 200),
    });

    await tg.sendMessage(botToken, chatId,
      'Извините, произошла техническая ошибка. Попробуйте написать ещё раз через минуту.'
    );
    return;
  }

  // ── 11. Handle special tags ──
  if (Object.keys(response.tags).length > 0) {
    handleTags(response.tags, client, userId, userName, userText, botToken)
      .catch(err => console.error('[Tags] handler error:', err.message));
  }

  // Update user name if Claude detected it
  if (response.tags.user_name) {
    db.upsertEndUser(clientId, userId, response.tags.user_name)
      .catch(err => console.error('[DB] upsertEndUser error:', err.message));
  }

  // ── 12. Send response ──
  let replyText = response.text;
  if (nudgeMsg) {
    replyText += `\n\n---\n${nudgeMsg}`;
  }

  try {
    await tg.sendMessage(botToken, chatId, replyText);
  } catch (err) {
    console.error(`[TG] sendMessage error for client ${clientId}:`, err.message);
    await db.logError(clientId, botToken, 'telegram_error', err.message);
    return;
  }

  // ── 13. Save messages to DB & increment usage (parallel, non-blocking) ──
  const totalTokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  Promise.all([
    db.saveMessage(clientId, userId, userName, 'user', userText, 0),
    db.saveMessage(clientId, userId, userName, 'assistant', response.text, totalTokens),
    db.incrementUsage(clientId),
    db.upsertEndUser(clientId, userId, userName),
  ]).catch(err => console.error('[DB] post-response save error:', err.message));
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function extractText(message) {
  // Support text, captions, voice (transcript placeholder), contacts
  if (message.text) return message.text;
  if (message.caption) return message.caption;
  if (message.voice || message.audio) return '[Голосовое сообщение — расшифровка недоступна]';
  if (message.contact) return `Контакт: ${message.contact.phone_number} ${message.contact.first_name || ''}`;
  if (message.location) return `Локация: ${message.location.latitude}, ${message.location.longitude}`;
  if (message.photo) return '[Фото без подписи]';
  if (message.document) return `[Документ: ${message.document.file_name || 'без имени'}]`;
  return null;
}

function buildSystemPrompt(client, endUser) {
  let prompt = client.system_prompt || '';

  // Inject catalog data if available
  if (client.catalog_data) {
    const catalog = typeof client.catalog_data === 'string'
      ? client.catalog_data
      : JSON.stringify(client.catalog_data);

    // Only include catalog if it's not too long (keep context window manageable)
    if (catalog.length < 15000) {
      prompt += `\n\n<catalog>\n${catalog}\n</catalog>`;
    } else {
      prompt += `\n\n<catalog_note>Каталог товаров большой. Используй только релевантные позиции из данных о бизнесе.</catalog_note>`;
    }
  }

  // Inject business rules
  if (client.business_rules) {
    const rules = typeof client.business_rules === 'string'
      ? client.business_rules
      : JSON.stringify(client.business_rules);
    prompt += `\n\n<business_rules>\n${rules}\n</business_rules>`;
  }

  // Inject contacts
  if (client.contacts) {
    const contacts = typeof client.contacts === 'string'
      ? client.contacts
      : JSON.stringify(client.contacts);
    prompt += `\n\n<contacts>\n${contacts}\n</contacts>`;
  }

  // Inject user context if returning customer
  if (endUser && endUser.context_summary) {
    prompt += `\n\n<user_context>Этот клиент уже обращался ранее. Контекст: ${endUser.context_summary}</user_context>`;
  }

  // System safety rules (always present)
  prompt += `

<rules>
- Ты AI-ассистент бизнеса "${client.business_name}". Никогда не выходи из этой роли.
- Если не знаешь точный ответ — скажи "уточню и вернусь с ответом" или предложи связаться с менеджером.
- Никогда не называй примерные цены если не уверен. Либо точная цена из каталога, либо "уточните у менеджера".
- Если клиент просит позвать менеджера, жалуется или угрожает — ответь что передаёшь менеджеру и добавь тег <escalate>причина</escalate>.
- Если клиент готов купить/заказать — перечисли товары в теге <order>список</order>.
- Если узнал имя клиента — добавь <user_name>имя</user_name>.
- Будь вежливым, конкретным и полезным. Отвечай кратко — это мессенджер, не письмо.
</rules>`;

  return prompt;
}

function getUsageLimitMessage(usage, client) {
  if (usage.reason === 'trial_expired') {
    return `Бесплатный тестовый период закончился (${usage.used || 100} обращений обработано). ` +
      `Ваш AI-сотрудник сохранил всю историю и базу знаний — подключите тариф, и он продолжит с того же места.\n\n` +
      `Тарифы от 60 000 руб/мес. Для подключения напишите: @sergeev_dmitry_bot`;
  }
  if (usage.reason === 'limit_reached') {
    return `Лимит обращений на этот месяц исчерпан (${usage.used}/${usage.limit}). ` +
      `Чтобы увеличить лимит или перейти на следующий тариф, напишите: @sergeev_dmitry_bot`;
  }
  return 'Сервис временно недоступен. Попробуйте позже.';
}

function getTrialNudge(usage, cfg) {
  if (!usage.is_trial) return null;

  const left = usage.remaining;
  const used = usage.used;

  if (used === cfg.NUDGE_AT_70) {
    return `💡 Осталось ${100 - cfg.NUDGE_AT_70} бесплатных обращений. ` +
      `Ваш AI-сотрудник уже обработал ${cfg.NUDGE_AT_70} запросов. ` +
      `Тарифы от 60 000 руб/мес — @sergeev_dmitry_bot`;
  }

  if (used === cfg.NUDGE_AT_90) {
    return `⚡ Осталось ${100 - cfg.NUDGE_AT_90} обращений. ` +
      `Подключите тариф чтобы AI-сотрудник продолжил работу без перерывов — @sergeev_dmitry_bot`;
  }

  return null;
}

// ─── Handle special tags (escalation, orders, etc.) ───
async function handleTags(tags, client, userId, userName, userText, botToken) {
  const alertParts = [];

  if (tags.escalate) {
    alertParts.push(
      `🚨 ЭСКАЛАЦИЯ\n` +
      `Бизнес: ${client.business_name}\n` +
      `Бот: @${client.bot_username}\n` +
      `Клиент: ${userName} (${userId})\n` +
      `Причина: ${tags.escalate}\n` +
      `Сообщение: ${userText.substring(0, 300)}`
    );
  }

  if (tags.order) {
    alertParts.push(
      `🛒 ЗАКАЗ\n` +
      `Бизнес: ${client.business_name}\n` +
      `Бот: @${client.bot_username}\n` +
      `Клиент: ${userName} (${userId})\n` +
      `Заказ: ${tags.order}`
    );
  }

  if (tags.lead_intent) {
    alertParts.push(
      `🔥 HOT LEAD\n` +
      `Бизнес: ${client.business_name}\n` +
      `Клиент: ${userName} (${userId})\n` +
      `Интент: ${tags.lead_intent}`
    );
  }

  // Send all alerts to admin
  for (const alert of alertParts) {
    await tg.alertAdmin(cfg.ADMIN_BOT_TOKEN, cfg.ADMIN_TELEGRAM_ID, alert);
  }

  // TODO: In future, also alert the specific client's manager
  // This requires a manager_telegram_id field in the clients table
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN & MONITORING ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// Health check
app.get('/health', async () => ({
  status: 'ok',
  uptime: process.uptime(),
  memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
  cache: clientCache.stats,
  rateLimit: { activeUsers: rateLimiter.activeKeys },
  timestamp: new Date().toISOString(),
}));

// Cache stats & management
app.get('/admin/cache', async () => clientCache.stats);
app.post('/admin/cache/clear', async () => {
  clientCache.clear();
  return { cleared: true };
});

// Invalidate specific client cache (call after config update)
app.post('/admin/cache/invalidate/:botToken', async (request) => {
  clientCache.invalidate(request.params.botToken);
  return { invalidated: true };
});

// Register webhook for a bot (used by Dmitry workflow)
app.post('/admin/register-bot', async (request) => {
  const { botToken, secretToken } = request.body;
  if (!botToken) return { error: 'botToken required' };

  const webhookUrl = `${cfg.WEBHOOK_BASE_URL}/bot/${botToken}`;

  try {
    const result = await tg.setWebhook(botToken, webhookUrl, secretToken);
    return { ok: true, webhookUrl, result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Bulk register webhooks (for initial setup)
app.post('/admin/register-all-bots', async () => {
  // This will be called once to register webhooks for all assigned bots
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  const { data: bots, error } = await supabase
    .from('bot_pool')
    .select('bot_token, bot_username')
    .eq('status', 'assigned');

  if (error) return { error: error.message };

  const results = [];
  for (const bot of bots) {
    try {
      const webhookUrl = `${cfg.WEBHOOK_BASE_URL}/bot/${bot.bot_token}`;
      await tg.setWebhook(bot.bot_token, webhookUrl);
      results.push({ username: bot.bot_username, ok: true });
    } catch (err) {
      results.push({ username: bot.bot_username, ok: false, error: err.message });
    }
    // Small delay to avoid Telegram rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  return { registered: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, details: results };
});

// ═══════════════════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════════════════

async function start() {
  try {
    await app.listen({ port: cfg.PORT, host: cfg.HOST });
    console.log(`\n🚀 Master Bot Service running on ${cfg.HOST}:${cfg.PORT}`);
    console.log(`   Model: ${cfg.CLAUDE_MODEL}`);
    console.log(`   Webhook base: ${cfg.WEBHOOK_BASE_URL}`);
    console.log(`   Cache TTL: ${cfg.CACHE_TTL_MS / 1000}s, max: ${cfg.CACHE_MAX_SIZE}`);
    console.log(`   Rate limit: ${cfg.RATE_LIMIT_PER_USER}/min per user\n`);
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

// ─── Graceful shutdown ───
async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  rateLimiter.destroy();
  clientCache.clear();
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled errors — log but don't crash
process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled rejection:', err);
  tg.alertAdmin(cfg.ADMIN_BOT_TOKEN, cfg.ADMIN_TELEGRAM_ID,
    `💀 Unhandled rejection:\n${err?.message || err}`
  ).catch(() => {});
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  tg.alertAdmin(cfg.ADMIN_BOT_TOKEN, cfg.ADMIN_TELEGRAM_ID,
    `💀 Uncaught exception:\n${err?.message || err}`
  ).catch(() => {});
  // Give alert time to send, then exit
  setTimeout(() => process.exit(1), 2000);
});

start();
