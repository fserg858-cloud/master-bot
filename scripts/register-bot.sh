#!/bin/bash
# scripts/register-bot.sh
# Register a single bot's webhook with the master-bot service
# Usage: ./register-bot.sh <bot_token>

BOT_TOKEN=$1
BASE_URL="${WEBHOOK_BASE_URL:-https://bot.sergeev-agents.ru}"

if [ -z "$BOT_TOKEN" ]; then
  echo "Usage: $0 <bot_token>"
  exit 1
fi

echo "Registering webhook for bot token: ...${BOT_TOKEN: -6}"

curl -s -X POST "${BASE_URL}/admin/register-bot" \
  -H "Content-Type: application/json" \
  -d "{\"botToken\": \"${BOT_TOKEN}\"}" | python3 -m json.tool

echo ""
