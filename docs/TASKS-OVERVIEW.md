# Tasks Overview — Sergeev Agents 1.07.2026 Launch

Bird-eye view всех задач проекта к публичному запуску **1 июля 2026**.

- **Milestone:** [1.07.2026 Public Launch](https://github.com/fserg858-cloud/master-bot/milestone/1)
- **Total:** 56 задач (T1=16, T2=22, T3=18)
- **Приоритеты:** P0=44 · P1=11 · P2=1
- **Area:** cabinet=24 · master-bot=19 · db=5 · vps=4 · ai-beta=2 · legal=2

Связанные спецификации: [docs/ARCHITECTURE.md](./ARCHITECTURE.md) · [docs/DB-SCHEMA.sql](./DB-SCHEMA.sql) · [docs/AI-BETA-SPEC.md](./AI-BETA-SPEC.md)

---

## Track 1 — Security & Integrity (16)

`track-1-security` · Закрыть утечки, изоляция, мониторинг, чистка инфры.

- [ ] [#2](https://github.com/fserg858-cloud/master-bot/issues/2) Поднять n8n (сейчас отдаёт 503) — `area:vps` `P0` `infra`
- [ ] [#3](https://github.com/fserg858-cloud/master-bot/issues/3) Отозвать токен @Lenya bot и убрать хардкод — `area:cabinet` `P0` `security`
- [ ] [#4](https://github.com/fserg858-cloud/master-bot/issues/4) Переписать git history через filter-repo — `area:cabinet` `P0` `security`
- [ ] [#5](https://github.com/fserg858-cloud/master-bot/issues/5) Отозвать все ключи которые были в git истории — `area:cabinet` `P0` `security`
- [ ] [#6](https://github.com/fserg858-cloud/master-bot/issues/6) Закрыть все 20+ PR от ботов — `area:cabinet` `P0` `infra`
- [ ] [#7](https://github.com/fserg858-cloud/master-bot/issues/7) Отключить ботов Sentinel/Bolt/Palette/Jules — `area:cabinet` `P0` `infra`
- [ ] [#8](https://github.com/fserg858-cloud/master-bot/issues/8) Branch protection на main обоих репо — `area:cabinet` `P0` `infra`
- [ ] [#9](https://github.com/fserg858-cloud/master-bot/issues/9) Удалить 90+ стале-веток в sergeev-consulting4 — `area:cabinet` `P1` `refactor`
- [ ] [#12](https://github.com/fserg858-cloud/master-bot/issues/12) Закрыть легаси Supabase nfmufzhmkwntlcuivdae — `area:db` `P0` `security`
- [ ] [#14](https://github.com/fserg858-cloud/master-bot/issues/14) Починить /api/lead — `area:cabinet` `P0` `feature`
- [ ] [#15](https://github.com/fserg858-cloud/master-bot/issues/15) Удалить /api/audit (бросает 500) — `area:cabinet` `P1` `refactor`
- [ ] [#17](https://github.com/fserg858-cloud/master-bot/issues/17) Поставить Sentry на frontend + backend — `area:cabinet` `P0` `infra`
- [ ] [#18](https://github.com/fserg858-cloud/master-bot/issues/18) Health-check + UptimeRobot 5 endpoint — `area:cabinet` `P0` `infra`
- [ ] [#22](https://github.com/fserg858-cloud/master-bot/issues/22) Plausible Analytics self-hosted на VPS — `area:vps` `P1` `infra`
- [ ] [#24](https://github.com/fserg858-cloud/master-bot/issues/24) Чистка репо: worktrees, dev_server.log, benchmark.ts, telegram-commander.js — `area:cabinet` `P2` `refactor`
- [ ] [#27](https://github.com/fserg858-cloud/master-bot/issues/27) Унифицировать на pnpm — `area:cabinet` `P1` `refactor`

## Track 2 — Core Platform Rebuild (22)

`track-2-platform` · БД-миграция, multi-tenant ядро, master-bot pipeline, RAG.

- [ ] [#52](https://github.com/fserg858-cloud/master-bot/issues/52) Применить DB-SCHEMA.sql миграцию к zilqqeipslcsiutinqpq — `area:db` `P0` `feature`
- [ ] [#54](https://github.com/fserg858-cloud/master-bot/issues/54) Проверить pgvector + ivfflat индекс — `area:db` `P0` `feature`
- [ ] [#56](https://github.com/fserg858-cloud/master-bot/issues/56) Тест RLS изоляции tenant'ов — `area:db` `P0` `security`
- [ ] [#58](https://github.com/fserg858-cloud/master-bot/issues/58) Auth: email+пароль вместо OTP only — `area:cabinet` `P0` `feature`
- [ ] [#59](https://github.com/fserg858-cloud/master-bot/issues/59) Bootstrap master-bot на VPS Docker + nginx + Let's Encrypt — `area:vps` `P0` `infra`
- [ ] [#61](https://github.com/fserg858-cloud/master-bot/issues/61) Redis 7 на VPS в Docker — `area:vps` `P0` `infra`
- [ ] [#63](https://github.com/fserg858-cloud/master-bot/issues/63) MVP pipeline TG → queue → worker → Claude → TG для Леонида — `area:master-bot` `P0` `feature`
- [ ] [#65](https://github.com/fserg858-cloud/master-bot/issues/65) Обновить тарифы в БД 99K/199K + триал 14 дней — `area:db` `P0` `refactor`
- [ ] [#67](https://github.com/fserg858-cloud/master-bot/issues/67) Anthropic Claude SDK с retry/backoff/fallback — `area:master-bot` `P0` `feature`
- [ ] [#69](https://github.com/fserg858-cloud/master-bot/issues/69) Wizard подключения Telegram в кабинете — `area:cabinet` `P0` `feature`
- [ ] [#71](https://github.com/fserg858-cloud/master-bot/issues/71) Память диалогов: messages + auto-summary — `area:master-bot` `P0` `feature`
- [ ] [#74](https://github.com/fserg858-cloud/master-bot/issues/74) Атомарный usage_counters + проверка лимита — `area:master-bot` `P0` `feature`
- [ ] [#76](https://github.com/fserg858-cloud/master-bot/issues/76) История диалогов в кабинете — `area:cabinet` `P0` `feature`
- [ ] [#78](https://github.com/fserg858-cloud/master-bot/issues/78) Применение per-company настроек агента — `area:master-bot` `P0` `feature`
- [ ] [#81](https://github.com/fserg858-cloud/master-bot/issues/81) Эскалация на оператора — `area:master-bot` `P0` `feature`
- [ ] [#83](https://github.com/fserg858-cloud/master-bot/issues/83) Daily-отчёт владельцу компании в TG — `area:master-bot` `P1` `feature`
- [ ] [#85](https://github.com/fserg858-cloud/master-bot/issues/85) Дмитрий-бот онбординг flow — `area:master-bot` `P0` `feature`
- [ ] [#88](https://github.com/fserg858-cloud/master-bot/issues/88) KB upload UI в кабинете — `area:cabinet` `P0` `feature`
- [ ] [#90](https://github.com/fserg858-cloud/master-bot/issues/90) KB parsing + chunking worker — `area:master-bot` `P0` `feature`
- [ ] [#92](https://github.com/fserg858-cloud/master-bot/issues/92) KB embedding через Voyage AI — `area:master-bot` `P0` `feature`
- [ ] [#93](https://github.com/fserg858-cloud/master-bot/issues/93) RAG top-5 в master-bot — `area:master-bot` `P0` `feature`
- [ ] [#94](https://github.com/fserg858-cloud/master-bot/issues/94) KB management в кабинете — `area:cabinet` `P1` `feature`

## Track 3 — Channels, CRM, Launch Polish (18)

`track-3-launch` · Каналы (Web/Email/WA), CRM, AI-Beta QA, юр-документы, биллинг.

- [ ] [#60](https://github.com/fserg858-cloud/master-bot/issues/60) AI-Beta скелет: Conductor + Evaluator + qa_runs — `area:ai-beta` `P0` `feature`
- [ ] [#62](https://github.com/fserg858-cloud/master-bot/issues/62) AI-Beta полный флот 8 personas — `area:ai-beta` `P0` `feature`
- [ ] [#64](https://github.com/fserg858-cloud/master-bot/issues/64) QA Dashboard /app/admin/qa — `area:cabinet` `P0` `feature`
- [ ] [#66](https://github.com/fserg858-cloud/master-bot/issues/66) Web-виджет standalone JS bundle — `area:master-bot` `P0` `feature`
- [ ] [#68](https://github.com/fserg858-cloud/master-bot/issues/68) Email-канал inbound через Resend — `area:master-bot` `P1` `feature`
- [ ] [#70](https://github.com/fserg858-cloud/master-bot/issues/70) Николай-агент: системный промпт продажника — `area:master-bot` `P0` `feature`
- [ ] [#72](https://github.com/fserg858-cloud/master-bot/issues/72) Wizard всех каналов в кабинете — `area:cabinet` `P0` `feature`
- [ ] [#73](https://github.com/fserg858-cloud/master-bot/issues/73) amoCRM OAuth + лид + webhook — `area:master-bot` `P0` `feature`
- [ ] [#75](https://github.com/fserg858-cloud/master-bot/issues/75) Bitrix24 OAuth + лид + webhook — `area:master-bot` `P0` `feature`
- [ ] [#77](https://github.com/fserg858-cloud/master-bot/issues/77) Google Sheets fallback per-company — `area:master-bot` `P1` `feature`
- [ ] [#79](https://github.com/fserg858-cloud/master-bot/issues/79) WhatsApp Green API real handler — `area:master-bot` `P0` `feature`
- [ ] [#80](https://github.com/fserg858-cloud/master-bot/issues/80) Публичная оферта для SaaS-РФ — `area:legal` `P0` `feature`
- [ ] [#82](https://github.com/fserg858-cloud/master-bot/issues/82) ToS на /tos — `area:legal` `P1` `feature`
- [ ] [#84](https://github.com/fserg858-cloud/master-bot/issues/84) 152-ФЗ согласие чекбокс — `area:cabinet` `P0` `security`
- [ ] [#86](https://github.com/fserg858-cloud/master-bot/issues/86) PDF-счёт для ЮЛ при оплате — `area:cabinet` `P0` `feature`
- [ ] [#87](https://github.com/fserg858-cloud/master-bot/issues/87) Закрывающий акт ежемесячно автомат — `area:cabinet` `P1` `feature`
- [ ] [#89](https://github.com/fserg858-cloud/master-bot/issues/89) Транзакционные email через Resend — `area:cabinet` `P0` `feature`
- [ ] [#91](https://github.com/fserg858-cloud/master-bot/issues/91) Demo-страница /demo с живым виджетом — `area:cabinet` `P1` `feature`

---

## Critical path

P0 блокеры запуска (44 шт) перечислены выше с приоритетом `P0`. Главные параллельные потоки:

1. **Security cleanup** (T1: #2-#9, #12, #17-#18) — должен быть закрыт первым, до новой разработки.
2. **DB + VPS foundation** (T2: #52, #54, #56, #59, #61) — фундамент для всего остального.
3. **Master-bot pipeline** (T2: #63, #67, #71, #74, #78, #81) — ядро runtime агентов.
4. **Onboarding loop** (T2: #85 Дмитрий-бот + KB stack #88, #90, #92, #93) — без этого нет триала.
5. **Channels + CRM** (T3: #66, #73, #75, #79) — для коммерческой ценности.
6. **AI-Beta gate** (T3: #60, #62, #64) — pre-launch quality bar.
7. **Legal + billing** (T3: #80, #84, #86, #89) — без этого нельзя продавать.
