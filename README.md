# sergeev-master-bot

Webhook-роутер для клиентских ботов платформы Sergeev Agents.
Один сервис принимает входящие сообщения от Telegram / WhatsApp / встроенного виджета и маршрутизирует их к LLM-агентам и Supabase.

## Quick start (локально)

```bash
npm install
cp .env.example .env
# заполни SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY (для health-роута не обязательно)

npm run dev
# → Fastify слушает на http://localhost:3001
curl http://localhost:3001/health
```

## Endpoints (MVP)

| Метод | Путь | Что делает |
|---|---|---|
| `GET`  | `/health`                     | health-check, версия |
| `GET`  | `/`                           | имя сервиса, версия |
| `POST` | `/webhook/telegram/:botId`    | приём update'ов от Telegram (заглушка) |
| `POST` | `/webhook/whatsapp/:botId`    | приём событий WhatsApp (заглушка) |
| `POST` | `/webhook/widget/:botId`      | приём событий веб-виджета (заглушка) |

Логика обработки webhook'ов будет добавлена в следующих PR.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev`       | tsx watch — hot reload |
| `npm run build`     | tsc → `dist/` |
| `npm start`         | `node dist/server.js` |
| `npm run typecheck` | `tsc --noEmit` |

## Деплой на VPS

См. [`deploy/README.md`](deploy/README.md).
Цель: `https://api.sergeev-agents.ru` через Cloudflare → host nginx → Docker.

## Структура

```
src/server.ts            — Fastify entry point
docs/                    — спеки (ARCHITECTURE, DB-SCHEMA, AI-BETA-SPEC)
deploy/nginx/            — production nginx-конфиг
deploy/README.md         — пошаговая инструкция деплоя
Dockerfile               — multi-stage build (deps → build → runtime)
docker-compose.yml       — single-service compose, port 127.0.0.1:3001
```
