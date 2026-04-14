# Sergeev Agents — Master Bot Service

Высокопроизводительный сервис маршрутизации Telegram-ботов.
Один сервис обслуживает тысячи клиентских ботов через единый webhook.

## Архитектура

```
Telegram → Nginx (SSL) → Master Bot (Node.js) → Claude API
                ↕                    ↕
            n8n (Dmitry)        Supabase (DB)
```

## Развёртывание на VPS

### 1. Подключись к серверу

```bash
ssh root@<IP_СЕРВЕРА>
```

### 2. Установи Docker

```bash
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
```

### 3. Клонируй проект

```bash
cd /opt
git clone https://github.com/fserg858-cloud/master-bot.git
cd master-bot
```

### 4. Настрой .env

```bash
cp .env.example .env
nano .env
# Заполни: ANTHROPIC_API_KEY, N8N_PASSWORD, ADMIN_BOT_TOKEN
```

### 5. Настрой DNS

В панели домена создай A-записи:
```
bot.sergeev-agents.ru  → <IP_СЕРВЕРА>
n8n.sergeev-agents.ru  → <IP_СЕРВЕРА>
```

### 6. Получи SSL-сертификаты

```bash
# Сначала запусти nginx без SSL (временная конфигурация)
# Потом:
docker run --rm \
  -v /opt/master-bot/certbot_data:/etc/letsencrypt \
  -v /opt/master-bot/certbot_www:/var/www/certbot \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d bot.sergeev-agents.ru \
  -d n8n.sergeev-agents.ru \
  --agree-tos --email fedor@sergeev-agents.ru
```

### 7. Запусти всё

```bash
docker compose up -d --build
```

### 8. Проверь

```bash
# Health check
curl https://bot.sergeev-agents.ru/health

# n8n
# Открой https://n8n.sergeev-agents.ru в браузере
```

## Создание ботов в пул

### Скрипт для BotFather (руками, ~2 мин на бота):

1. Открой @BotFather в Telegram
2. `/newbot` → имя: `Sergeev Agents 001` → username: `sergeev_agents_001_bot`
3. Скопируй токен
4. Повтори для 002, 003... 100

### Массовая загрузка токенов в Supabase:

```sql
INSERT INTO bot_pool (bot_username, bot_token, status) VALUES
  ('sergeev_agents_001_bot', '1234567:AAE...', 'available'),
  ('sergeev_agents_002_bot', '2345678:AAF...', 'available'),
  -- ...
  ('sergeev_agents_100_bot', '3456789:AAG...', 'available');
```

### Регистрация webhook для назначенных ботов:

```bash
curl -X POST https://bot.sergeev-agents.ru/admin/register-all-bots
```

## Мониторинг

```bash
# Логи master-bot
docker logs -f master-bot --tail 100

# Логи n8n
docker logs -f n8n --tail 100

# Статистика
curl https://bot.sergeev-agents.ru/health
```

## Обновление

```bash
cd /opt/master-bot
git pull
docker compose up -d --build master-bot
```

## Масштабирование

- **До 500 клиентов:** один VPS (4 vCPU, 8GB RAM) — достаточно
- **500-2000:** увеличь VPS до 8 vCPU / 16GB RAM
- **2000+:** второй VPS с master-bot за Nginx load balancer
- **5000+:** Kubernetes или свой оркестратор
