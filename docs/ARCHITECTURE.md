# Sergeev Agents — Архитектура платформы

Версия: 1.0
Дата: 2026-05-21
Целевой запуск: 2026-07-01

## Назначение

Sergeev Agents — B2B SaaS платформа AI-агентов по подписке. Клиенты-компании подключают готовых агентов (Леонид — саппорт, Николай — продажи) к своим каналам (Telegram, WhatsApp, Web, Email) и CRM (amoCRM, Bitrix24, Google Sheets). Цель: обрабатывать сотни-тысячи параллельных диалогов с p95 ≤5s и pass-rate ≥95%.

## Принципы

1. **Hot path вне Vercel.** LLM и webhook'и живут в long-running сервисе master-bot на VPS. Vercel — только статика и кабинет.
2. **Очередь между webhook и LLM.** Webhook отвечает каналу <100ms, обработка асинхронная через Redis/BullMQ. Горизонтальное масштабирование воркерами.
3. **Multi-tenant с первого дня.** Все данные изолированы по company_id через RLS. Тенант = компания, не пользователь.
4. **Anthropic Claude primary.** Sonnet 4.6 для агентов, Haiku 4.5 для саммари/роутинга, Opus 4.7 для Enterprise. OpenAI gpt-4o-mini — только fallback при недоступности Anthropic.
5. **AI-Beta всегда в проде.** Continuous QA через флот sim-агентов. Launch gate автоматический. См. AI-BETA-SPEC.md.
6. **n8n не в hot path.** Только контент-машина и служебные workflow.
7. **Observability с первого дня.** Sentry, health-checks, daily-отчёты. Без слепых зон.

## Топология


```
                 ┌──────────────────────────────┐
                 │       Vercel (edge)          │
                 │  sergeev-agents.ru           │
                 │   ├─ маркетинговый сайт      │
                 │   ├─ /app — кабинет          │
                 │   └─ /api/yookassa — webhook │
                 └──────────┬───────────────────┘
                            │
            ┌───────────────┴──────────────────┐
            ▼                                  ▼
    ┌───────────────┐                ┌──────────────────┐
    │   Supabase    │                │   Master-bot     │
    │  (eu-central) │                │ api.sergeev-     │
    │ Postgres 17   │                │  agents.ru       │
    │ + pgvector    │◄──────────────►│ Fastify + Docker │
    │ + Auth + RLS  │                │ на VPS Timeweb   │
    │ + Storage     │                │                  │
    └───────────────┘                └──┬──┬──┬──┬──────┘
                                        │  │  │  │
                       ┌────────────────┘  │  │  │
                       ▼                   │  │  │
              ┌─────────────────┐          │  │  │
              │ Redis + BullMQ  │          │  │  │
              │ (тот же VPS)    │          │  │  │
              └─────────────────┘          │  │  │
                                           ▼  ▼  ▼
                       ┌──────────┐  ┌─────────────────┐
                       │ Anthropic│  │ Channel adapters│
                       │ Claude   │  │ ├─ Telegram     │
                       │ API      │  │ ├─ WhatsApp(GA) │
                       └──────────┘  │ ├─ Web (WS)     │
                                     │ └─ Email(Resend)│
                                     │                 │
                                     │ CRM adapters    │
                                     │ ├─ amoCRM       │
                                     │ ├─ Bitrix24     │
                                     │ └─ G.Sheets     │
                                     └─────────────────┘
```



## Сервисы

### Marketing + Cabinet (Vercel)

Репо `sergeev-consulting4`. Next.js 15. Production `sergeev-agents.ru`. Кабинет `/app/*`.

Ответственности:
- Публичные страницы (главная, цены, агенты, демо, оферта, политика)
- Кабинет (диалоги, настройки агентов, KB, биллинг, аналитика)
- Server actions для всех мутаций через Supabase
- ЮКасса webhook (рекуррент)
- Waitlist
- Админка `/app/admin`

Не делает: LLM-вызовы, channel webhook'и, операции >5s.

Деплой: GitHub Actions → Vercel (push в main, branch protection включён).

### Master-bot (VPS)

Репо `master-bot`. Fastify Node.js в Docker на 195.133.81.29. Домен `api.sergeev-agents.ru`.

Ответственности:
- Webhook endpoints всех каналов (TG, WA, Web WS, Email inbound)
- Async обработка через Redis очередь
- Worker'ы: контекст + RAG + Claude → ответ → канал
- CRM-операции (нативно, не через n8n)
- AI-Beta флот (Conductor, SimAgent, Evaluator) — см. AI-BETA-SPEC.md
- Cron: daily-отчёты, KB переиндексация, прогоны AI-Beta

Stack:
- Node.js 22 LTS, TypeScript strict
- Fastify 4
- @anthropic-ai/sdk
- BullMQ + Redis 7
- @supabase/supabase-js (service-role)
- Pino → Sentry

Не делает: UI, ЮКасса (это в Vercel).

### Supabase

Проект `zilqqeipslcsiutinqpq` (sergeev-saas), eu-central-1, Postgres 17.

Расширения: pgvector, pgcrypto, uuid-ossp, supabase_vault, pg_stat_statements.

Auth: email+пароль (магик-линк как fallback). Trigger создаёт `company` + `membership owner` при регистрации.

Storage: `knowledge-base/{company_id}/{file_id}` (приватный, signed URL), `invoices/{company_id}/{period}`.

Бэкапы: встроенный PITR (если Pro tier) + ежедневный pg_dump → R2 (GitHub Action).

Legacy `nfmufzhmkwntlcuivdae` — мигрировать нужные данные и удалить. Decision 2026-05-21.

### Redis + BullMQ

Redis 7 в Docker рядом с master-bot.

Очереди:
- incoming_message — обработка входящих
- outgoing_message — отправка ответов
- crm_sync — CRM-операции
- kb_index — индексация KB
- qa_run — AI-Beta
- notifications — TG-уведомления владельцу
- billing — события из ЮКасса webhook'а

Persistence: RDB + AOF, том примонтирован.

Failover: если Redis down — master-bot переключается в sync-mode + алерт.

### n8n (auxiliary)

`n8n.sergeev-agents.ru` на том же VPS.

Только: контент-машина, бэкапы, служебные workflow.

НЕ используется: channel routing, hot-path LLM, CRM webhook routing. Workflow `bitrix-router`/`amocrm-router` НЕ создавать.

## Поток данных: входящее сообщение


```
1. Клиент пишет в TG-бот компании
2. Telegram → POST api.sergeev-agents.ru/webhook/telegram/:botId
3. Master-bot:
   - валидирует подпись
   - по :botId находит agent_channels → company_id + agent_slug
   - проверяет usage_counters лимит
   - кладёт job в incoming_message очередь
   - отвечает 200 за <100ms
4. Worker incoming_message:
   - достаёт/создаёт conversation
   - сохраняет msg в messages
   - формирует контекст: последние ≤20 сообщений + auto-summary (Haiku) если больше
   - RAG: embedding → top-5 chunks из kb_chunks по company_id
   - собирает system prompt: базовый + per-company addon + RAG
   - вызывает Sonnet (retry, backoff, fallback gpt-4o-mini)
   - парсит action блоки (create_lead, escalate)
   - инкрементит usage_counters атомарно
   - кладёт outgoing_message job
5. Worker outgoing_message → отправка в канал
```



Latency budget p95: ≤5s без RAG, ≤8s с RAG.

## Multi-tenant модель


```
auth.users (1) ── (N) memberships (N) ── (1) companies
                                              │
                                ┌─────────────┼──────────┐
                                ▼             ▼          ▼
                         subscriptions  agents_enabled  knowledge_base
                                │             │          │
                                ▼             ▼          ▼
                           payments    agent_configs  kb_chunks
                                              │
                                              ▼
                                       agent_channels
                                              │
                                              ▼
                                       conversations
                                              │
                                              ▼
                                          messages
```



User может состоять в N companies. Один company → одна активная subscription. Все данные привязаны к company_id с RLS.

## LLM стек

| Модель | Где | Назначение |
|---|---|---|
| Sonnet 4.6 | Master-bot | Основные ответы агентов (с prompt caching) |
| Haiku 4.5 | Master-bot | Auto-summary, routing decisions |
| Opus 4.7 | Master-bot | Enterprise сложные задачи |
| voyage-3 | Master-bot | Embeddings RAG (1024 dim) |
| Haiku 4.5 | AI-Beta | Evaluator + SimAgent (бюджетная оптимизация) |
| gpt-4o-mini | Fallback only | Anthropic недоступен >30s |

Prompt caching: системные промпты агентов через cache_control. -80% стоимость, -30% латентность.

## Observability

| Слой | Инструмент |
|---|---|
| Errors frontend | Sentry проект sergeev-frontend |
| Errors backend | Sentry проект sergeev-master-bot |
| Logs | Pino → Docker logs → journald, ротация 7 дней |
| Uptime | UptimeRobot: 5 endpoint |
| Web analytics | Plausible selfhosted на VPS |
| Product metrics | Custom dashboard в /app/admin |
| DB | Supabase built-in |
| Alerts | TG канал @sergeev_alerts: health down, errors >1%, qa pass <90% |

## Деплой

| Сервис | Источник | Деплой |
|---|---|---|
| Marketing + Cabinet | sergeev-consulting4 | GitHub Actions → Vercel (main) |
| Master-bot | master-bot | GitHub Actions → SSH deploy (main) |
| DB migrations | sergeev-consulting4/supabase/migrations/ | Supabase CLI через CI (main) |
| n8n workflows | sergeev-n8n-backups | cron-дамп через n8n API раз в час |

Branch protection: PR в main только с approve. Боты-PR ОСТАНОВЛЕНЫ 2026-05-21.

## Масштабирование

Текущий VPS 1CPU/2GB рассчитан на dev. До 1000 параллельных диалогов выдержит при правильном tuning.

Триггеры апгрейда:
- p95 >8s → второй worker или CPU
- Queue depth >100/min → больше воркеров
- RAM >80% → апгрейд
- Disk >70% → апгрейд или off-load старых сообщений

v2 (после 1000 клиентов): K8s, Redis Cluster, Supabase Team plan.

## Безопасность

- Секреты в Vercel ENV / VPS .env / GitHub Secrets, никогда не в коде
- Pre-commit hook gitleaks на оба репо
- agent_channels.config_enc — AES-256-GCM (AGENT_CONFIG_ENC_KEY, ротация раз в год)
- ЮКасса webhook: HMAC + IP-allowlist
- Channel webhook signature verification
- RLS на ВСЕХ таблицах
- Service-role key — только в master-bot и admin actions
- Rate limit 100 req/sec per IP (Fastify rate-limit)
- Cloudflare proxy перед api.sergeev-agents.ru

## 152-ФЗ статус

v1 (1.07): Supabase EU + публичная декларация "хранение в ЕС" + "РФ-резидентность по запросу для Enterprise".

v2 (осень): миграция критических таблиц для РФ-ЮЛ клиентов в РФ-Postgres (Yandex Cloud Managed или Selectel).
