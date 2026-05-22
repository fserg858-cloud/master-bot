# Деплой master-bot на VPS

Целевой URL: **https://api.sergeev-agents.ru**
VPS: 195.133.81.29 (Timeweb, Ubuntu 24.04)
Архитектура: Cloudflare (Proxied, Flexible) → nginx на хосте :80 → master-bot в Docker :3001

## Первичный деплой

### 1. На VPS

```bash
ssh root@195.133.81.29

# Клонируем
mkdir -p /opt/master-bot && cd /opt/master-bot
git clone https://github.com/fserg858-cloud/master-bot.git .

# Конфиг
cp .env.example .env
nano .env
#   SUPABASE_SERVICE_KEY — Supabase dashboard → Project zilqqeipslcsiutinqpq
#                          → Settings → API → service_role (secret)
#   ANTHROPIC_API_KEY     — console.anthropic.com → API Keys

# Сборка и запуск
docker compose up -d --build
docker compose logs -f --tail=50          # убедиться что Fastify стартанул, Ctrl+C
curl http://localhost:3001/health         # → {"status":"ok",...}
curl http://localhost:3001/                # → {"service":"sergeev-master-bot",...}

# Nginx
cp deploy/nginx/master-bot.conf /etc/nginx/sites-available/master-bot
ln -sf /etc/nginx/sites-available/master-bot /etc/nginx/sites-enabled/master-bot
nginx -t && systemctl reload nginx
```

### 2. В Cloudflare (web UI)

DNS → Records → Add record:

- Type: **A**
- Name: **api**
- IPv4: **195.133.81.29**
- Proxy: **ON** (оранжевое облачко)
- TTL: **Auto**

SSL/TLS уже **Flexible** (настроено ранее для `n8n.sergeev-agents.ru`).

### 3. Верификация

```bash
# Ждём пропагацию DNS + Cloudflare edge
sleep 60

# Smoke tests
curl -s https://api.sergeev-agents.ru/health
# → {"status":"ok","ts":...,"version":"0.1.0"}

curl -s https://api.sergeev-agents.ru/
# → {"service":"sergeev-master-bot","version":"0.1.0"}

curl -s -X POST https://api.sergeev-agents.ru/webhook/telegram/test123 \
  -H 'content-type: application/json' -d '{"hello":"world"}'
# → {"ok":true}

# В логах должна появиться запись о webhook
docker logs master-bot --tail 20
```

## Последующие деплои

```bash
cd /opt/master-bot
git pull
docker compose up -d --build
docker compose logs --tail=30 master-bot
```

## Troubleshooting

**`docker compose up` падает на build:**

```bash
docker compose build --no-cache master-bot
```

**Контейнер запускается, но `curl localhost:3001/health` зависает:**

```bash
docker compose logs master-bot
docker exec master-bot wget -qO- http://localhost:3001/health
```

**nginx → 502 Bad Gateway:**
Проверь, что контейнер слушает на `127.0.0.1:3001` хоста:

```bash
ss -ltnp | grep 3001
```

**Cloudflare → 521 (web server is down):**
Cloudflare не может достучаться до :80. Проверь:

```bash
curl -H "Host: api.sergeev-agents.ru" http://195.133.81.29/health
```

Если локально работает, а через CF нет — убедись, что Cloudflare proxy ON и SSL/TLS в Flexible.

## Архитектура

```
client → Cloudflare (HTTPS, Proxied)
       → 195.133.81.29:80 (HTTP, host nginx)
       → 127.0.0.1:3001 (master-bot, Docker)
```

XRay продолжает держать :443 для VPN — master-bot к нему не имеет отношения.
