// src/claude.js
// ─── Claude API wrapper with retries and timeout ───

const Anthropic = require('@anthropic-ai/sdk');

let client;
let config;

function init(cfg) {
  config = cfg;
  client = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
  return client;
}

// ─── Build messages array from conversation history ───
function buildMessages(history, newMessage) {
  const messages = [];

  for (const msg of history) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  messages.push({ role: 'user', content: newMessage });
  return messages;
}

// ─── Generate response with retry ───
async function generate(systemPrompt, history, userMessage, opts = {}) {
  const messages = buildMessages(history, userMessage);
  const maxRetries = opts.maxRetries || 3;
  const model = opts.model || config.CLAUDE_MODEL;
  const maxTokens = opts.maxTokens || config.CLAUDE_MAX_TOKENS;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      });

      // Extract text from response
      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      // Extract any tags for special handling
      const tags = extractTags(text);

      return {
        text: cleanResponse(text),
        tags,
        usage: {
          input_tokens: response.usage?.input_tokens || 0,
          output_tokens: response.usage?.output_tokens || 0,
        },
        model: response.model,
        stop_reason: response.stop_reason,
      };

    } catch (err) {
      lastError = err;

      // Don't retry on auth errors or invalid requests
      if (err.status === 401 || err.status === 400) {
        throw err;
      }

      // Retry on overload (529), rate limit (429), server errors (5xx)
      if (attempt < maxRetries && (err.status === 529 || err.status === 429 || err.status >= 500)) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.warn(`[Claude] Attempt ${attempt} failed (${err.status}), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

// ─── Extract special tags from Claude's response ───
function extractTags(text) {
  const tags = {};

  const tagPatterns = [
    { name: 'order', regex: /<order>([\s\S]*?)<\/order>/i },
    { name: 'escalate', regex: /<escalate>([\s\S]*?)<\/escalate>/i },
    { name: 'lead_intent', regex: /<lead_intent>([\s\S]*?)<\/lead_intent>/i },
    { name: 'user_name', regex: /<user_name>([\s\S]*?)<\/user_name>/i },
  ];

  for (const { name, regex } of tagPatterns) {
    const match = text.match(regex);
    if (match) {
      tags[name] = match[1].trim();
    }
  }

  return tags;
}

// ─── Remove internal tags from response before sending to user ───
function cleanResponse(text) {
  return text
    .replace(/<order>[\s\S]*?<\/order>/gi, '')
    .replace(/<escalate>[\s\S]*?<\/escalate>/gi, '')
    .replace(/<lead_intent>[\s\S]*?<\/lead_intent>/gi, '')
    .replace(/<user_name>[\s\S]*?<\/user_name>/gi, '')
    .replace(/<next_state>[\s\S]*?<\/next_state>/gi, '')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { init, generate };
