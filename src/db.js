// src/db.js
// ─── Supabase data access layer ───

const { createClient } = require('@supabase/supabase-js');

let supabase;

function init(url, key) {
  supabase = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
  return supabase;
}

// ─── Client lookup by bot token ───
async function getClientByBotToken(botToken) {
  const { data: bot, error: botErr } = await supabase
    .from('bot_pool')
    .select('id, bot_username, assigned_to_client_id')
    .eq('bot_token', botToken)
    .eq('status', 'assigned')
    .single();

  if (botErr || !bot || !bot.assigned_to_client_id) return null;

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', bot.assigned_to_client_id)
    .single();

  if (clientErr || !client) return null;

  return {
    ...client,
    bot_username: bot.bot_username,
    bot_pool_id: bot.id,
  };
}

// ─── Usage check & increment (atomic) ───
async function checkUsage(clientId) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Try to get existing usage record
  let { data: usage, error } = await supabase
    .from('usage')
    .select('*')
    .eq('client_id', clientId)
    .eq('month', monthKey)
    .single();

  // Create if doesn't exist
  if (error && error.code === 'PGRST116') {
    // Get client plan to determine limit
    const { data: client } = await supabase
      .from('clients')
      .select('plan, status')
      .eq('id', clientId)
      .single();

    if (!client) return { allowed: false, reason: 'client_not_found' };

    const planLimits = {
      trial: 100,
      starter: 3000,
      business: 10000,
      premium: 30000,
      enterprise: 999999,
    };

    const isTrial = client.status === 'trial';
    const limit = isTrial ? 100 : (planLimits[client.plan] || 3000);

    const { data: newUsage, error: createErr } = await supabase
      .from('usage')
      .insert({
        client_id: clientId,
        month: monthKey,
        requests_used: 0,
        requests_limit: limit,
        is_trial: isTrial,
        trial_requests_left: isTrial ? 100 : null,
      })
      .select()
      .single();

    if (createErr) return { allowed: false, reason: 'db_error' };
    usage = newUsage;
  } else if (error) {
    return { allowed: false, reason: 'db_error' };
  }

  // Check limits
  if (usage.is_trial) {
    if ((usage.trial_requests_left || 0) <= 0) {
      return { allowed: false, reason: 'trial_expired', used: usage.requests_used };
    }
    return {
      allowed: true,
      is_trial: true,
      remaining: usage.trial_requests_left,
      used: usage.requests_used,
      limit: 100,
    };
  }

  if (usage.requests_used >= usage.requests_limit) {
    return {
      allowed: false,
      reason: 'limit_reached',
      used: usage.requests_used,
      limit: usage.requests_limit,
    };
  }

  return {
    allowed: true,
    is_trial: false,
    remaining: usage.requests_limit - usage.requests_used,
    used: usage.requests_used,
    limit: usage.requests_limit,
  };
}

// ─── Increment usage after successful response ───
async function incrementUsage(clientId) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: usage } = await supabase
    .from('usage')
    .select('id, is_trial, trial_requests_left, requests_used')
    .eq('client_id', clientId)
    .eq('month', monthKey)
    .single();

  if (!usage) return;

  const updates = { requests_used: (usage.requests_used || 0) + 1 };
  if (usage.is_trial) {
    updates.trial_requests_left = Math.max(0, (usage.trial_requests_left || 0) - 1);
  }

  await supabase.from('usage').update(updates).eq('id', usage.id);
}

// ─── Conversation history ───
async function getHistory(clientId, endUserTelegramId, limit = 20) {
  const { data, error } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('client_id', clientId)
    .eq('end_user_telegram_id', String(endUserTelegramId))
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.reverse(); // chronological order
}

async function saveMessage(clientId, endUserTelegramId, endUserName, role, content, tokensUsed = 0) {
  const { error } = await supabase.from('conversations').insert({
    client_id: clientId,
    end_user_telegram_id: String(endUserTelegramId),
    end_user_name: endUserName || null,
    role,
    content,
    tokens_used: tokensUsed,
  });
  if (error) console.error('[DB] saveMessage error:', error.message);
}

// ─── End user upsert ───
async function upsertEndUser(clientId, telegramId, name) {
  const { error } = await supabase
    .from('client_users')
    .upsert(
      {
        client_id: clientId,
        telegram_id: String(telegramId),
        name: name || null,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'client_id,telegram_id' }
    );
  if (error) console.error('[DB] upsertEndUser error:', error.message);
}

// ─── Get end user context ───
async function getEndUser(clientId, telegramId) {
  const { data } = await supabase
    .from('client_users')
    .select('*')
    .eq('client_id', clientId)
    .eq('telegram_id', String(telegramId))
    .single();
  return data || null;
}

// ─── Log errors for monitoring ───
async function logError(clientId, botToken, errorType, errorMessage, context = {}) {
  try {
    await supabase.from('error_log').insert({
      client_id: clientId || null,
      bot_token_last4: botToken ? botToken.slice(-4) : null,
      error_type: errorType,
      error_message: errorMessage,
      context: context,
    });
  } catch (e) {
    // Don't throw on logging errors
    console.error('[DB] logError failed:', e.message);
  }
}

module.exports = {
  init,
  getClientByBotToken,
  checkUsage,
  incrementUsage,
  getHistory,
  saveMessage,
  upsertEndUser,
  getEndUser,
  logError,
};
