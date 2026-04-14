// src/config.js
// ─── Environment config with strict validation ───

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'ANTHROPIC_API_KEY',
  'WEBHOOK_BASE_URL',   // e.g. https://bot.sergeev-agents.ru
  'ADMIN_TELEGRAM_ID',  // Fedor's chat_id for alerts
  'ADMIN_BOT_TOKEN',    // Token of any bot that can message Fedor
];

function load() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`\n❌ Missing env vars: ${missing.join(', ')}\n`);
    process.exit(1);
  }

  return Object.freeze({
    // Server
    PORT: parseInt(process.env.PORT || '3000', 10),
    HOST: process.env.HOST || '0.0.0.0',
    NODE_ENV: process.env.NODE_ENV || 'production',

    // Supabase
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,

    // Claude
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    CLAUDE_MAX_TOKENS: parseInt(process.env.CLAUDE_MAX_TOKENS || '2048', 10),

    // Telegram
    WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL.replace(/\/$/, ''),

    // Admin alerts
    ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,
    ADMIN_BOT_TOKEN: process.env.ADMIN_BOT_TOKEN,

    // Limits
    CACHE_TTL_MS: parseInt(process.env.CACHE_TTL_MS || '300000', 10),       // 5 min
    CACHE_MAX_SIZE: parseInt(process.env.CACHE_MAX_SIZE || '5000', 10),
    MAX_HISTORY_MESSAGES: parseInt(process.env.MAX_HISTORY_MESSAGES || '20', 10),
    RATE_LIMIT_PER_USER: parseInt(process.env.RATE_LIMIT_PER_USER || '20', 10),  // per minute
    CLAUDE_TIMEOUT_MS: parseInt(process.env.CLAUDE_TIMEOUT_MS || '30000', 10),
    TRIAL_REQUESTS: parseInt(process.env.TRIAL_REQUESTS || '100', 10),

    // Retention nudges
    NUDGE_AT_70: parseInt(process.env.NUDGE_AT_70 || '70', 10),
    NUDGE_AT_90: parseInt(process.env.NUDGE_AT_90 || '90', 10),
  });
}

module.exports = { load };
