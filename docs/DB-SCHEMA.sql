-- Sergeev Agents — Multi-tenant schema v1.0
-- Target: zilqqeipslcsiutinqpq (sergeev-saas)
-- Launch: 2026-07-01
-- Apply via Supabase CLI: supabase db push

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_stat_statements";

-- ============================================================
-- 1. CLEAN UP EMPTY LEGACY TABLES (audit confirmed 0 rows)
-- ============================================================
drop table if exists public.subscriptions cascade;
drop table if exists public.agent_settings cascade;
drop table if exists public.agent_channels cascade;
drop table if exists public.agent_events cascade;

-- ============================================================
-- 2. ENUMS
-- ============================================================
do $$ begin create type membership_role as enum ('owner','admin','member'); exception when duplicate_object then null; end $$;
do $$ begin create type subscription_status as enum ('trial','active','past_due','paused','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type agent_slug as enum ('leonid','nikolai','dmitry','ignat'); exception when duplicate_object then null; end $$;
do $$ begin create type channel_type as enum ('telegram','whatsapp','web','email','amocrm','bitrix24','sheets'); exception when duplicate_object then null; end $$;
do $$ begin create type conversation_status as enum ('open','resolved','escalated','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type message_role as enum ('user','assistant','system','tool'); exception when duplicate_object then null; end $$;
do $$ begin create type kb_file_status as enum ('uploaded','parsing','embedding','indexed','error'); exception when duplicate_object then null; end $$;

-- ============================================================
-- 3. CORE TABLES
-- ============================================================

create table public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  inn text,
  legal_address text,
  contact_email text,
  contact_phone text,
  is_legal_entity boolean default false,
  ru_residency_required boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on public.companies (inn);

create table public.memberships (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role membership_role not null default 'member',
  created_at timestamptz default now(),
  unique (user_id, company_id)
);
create index on public.memberships (user_id);
create index on public.memberships (company_id);

create table public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tariff_id uuid not null references public.tariffs(id),
  status subscription_status not null default 'trial',
  trial_ends_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  pending_tariff_id uuid references public.tariffs(id),
  pending_change_at timestamptz,
  yookassa_payment_method_id text,
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index on public.subscriptions (company_id) where status in ('trial','active','past_due','paused');

create table public.agents_enabled (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_slug agent_slug not null,
  enabled boolean not null default true,
  created_at timestamptz default now(),
  unique (company_id, agent_slug)
);

create table public.agent_configs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_slug agent_slug not null,
  tone text default 'friendly',
  topics text[] default '{}',
  blocklist text[] default '{}',
  system_prompt_addon text,
  faq jsonb default '[]'::jsonb,
  escalation_keywords text[] default '{}',
  escalation_telegram_chat_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, agent_slug)
);

create table public.agent_channels (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_slug agent_slug not null,
  channel channel_type not null,
  enabled boolean not null default true,
  config_enc bytea,
  webhook_secret text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, agent_slug, channel)
);
create index on public.agent_channels (company_id, channel) where enabled = true;

create table public.knowledge_base (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size_bytes bigint,
  mime_type text,
  status kb_file_status default 'uploaded',
  error_message text,
  chunks_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on public.knowledge_base (company_id);

create table public.kb_chunks (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kb_file_id uuid not null references public.knowledge_base(id) on delete cascade,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(1024),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index on public.kb_chunks (company_id);
create index on public.kb_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table public.conversations (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_slug agent_slug not null,
  channel channel_type not null,
  external_user_id text not null,
  external_user_name text,
  status conversation_status not null default 'open',
  summary text,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (company_id, agent_slug, channel, external_user_id)
);
create index on public.conversations (company_id, last_message_at desc);
create index on public.conversations (company_id, agent_slug, status);

create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role message_role not null,
  content text not null,
  tool_calls jsonb,
  tool_results jsonb,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  model text,
  cached boolean default false,
  created_at timestamptz default now()
);
create index on public.messages (conversation_id, created_at);
create index on public.messages (company_id, created_at desc);

create table public.events (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_slug agent_slug,
  conversation_id uuid references public.conversations(id) on delete set null,
  event_type text not null,
  payload jsonb default '{}'::jsonb,
  external_contact text,
  amount_rub numeric(12,2),
  created_at timestamptz default now()
);
create index on public.events (company_id, created_at desc);
create index on public.events (company_id, event_type, created_at desc);

create table public.usage_counters (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_slug agent_slug not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  requests_used int not null default 0,
  tokens_in_total bigint not null default 0,
  tokens_out_total bigint not null default 0,
  updated_at timestamptz default now(),
  unique (company_id, agent_slug, period_start)
);
create index on public.usage_counters (company_id, period_end);

create table public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz default now()
);
create index on public.audit_log (company_id, created_at desc);

-- ============================================================
-- 4. AI-BETA TABLES
-- ============================================================

create table public.qa_runs (
  id uuid primary key default uuid_generate_v4(),
  run_batch_id uuid not null,
  run_mode text not null default 'continuous',
  sim_persona text not null,
  agent_slug agent_slug not null,
  channel channel_type not null,
  scenario text,
  conversation_jsonb jsonb not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  total_turns int default 0,
  total_latency_ms int default 0,
  status text default 'running'
);
create index on public.qa_runs (run_batch_id);
create index on public.qa_runs (started_at desc);
create index on public.qa_runs (run_mode);

create table public.qa_evaluations (
  id uuid primary key default uuid_generate_v4(),
  qa_run_id uuid not null references public.qa_runs(id) on delete cascade,
  turn_index int not null,
  relevance_score int,
  accuracy_score int,
  persona_score int,
  action_correct boolean,
  latency_ms int,
  safety_passed boolean,
  overall_passed boolean,
  evaluator_notes text,
  created_at timestamptz default now()
);
create index on public.qa_evaluations (qa_run_id);

-- ============================================================
-- 5. UPDATE TARIFFS TO LAUNCH PRICES
-- ============================================================
update public.tariffs set price_rub_month = 99000 where agent_slug = 'leonid' and grade = '1';
update public.tariffs set price_rub_month = 199000 where agent_slug = 'leonid' and grade = '2';
update public.tariffs set price_rub_month = 99000 where agent_slug = 'nikolai' and grade = '1';
update public.tariffs set price_rub_month = 199000 where agent_slug = 'nikolai' and grade = '2';
update public.tariffs set requests_limit = 500, trial_days = 14 where grade = 'test';

-- ============================================================
-- 6. HELPER FUNCTIONS
-- ============================================================

create or replace function public.is_company_member(p_company_id uuid)
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.memberships where user_id = auth.uid() and company_id = p_company_id);
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.memberships where user_id = auth.uid() and company_id = p_company_id and role in ('owner','admin'));
$$;

create or replace function public.is_superadmin()
returns boolean language sql security definer stable as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  for t in select unnest(array['companies','subscriptions','agent_configs','agent_channels','knowledge_base','usage_counters'])
  loop
    execute format('drop trigger if exists set_updated_at on public.%I; create trigger set_updated_at before update on public.%I for each row execute procedure public.tg_set_updated_at();', t, t);
  end loop;
end $$;

create or replace function public.tg_auth_user_created()
returns trigger language plpgsql security definer as $$
declare v_company_id uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  insert into public.companies (name, contact_email)
  values (coalesce(new.raw_user_meta_data->>'company','Моя компания'), new.email)
  returning id into v_company_id;
  insert into public.memberships (user_id, company_id, role)
  values (new.id, v_company_id, 'owner');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.tg_auth_user_created();

-- ============================================================
-- 8. RLS POLICIES
-- ============================================================

alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.subscriptions enable row level security;
alter table public.agents_enabled enable row level security;
alter table public.agent_configs enable row level security;
alter table public.agent_channels enable row level security;
alter table public.knowledge_base enable row level security;
alter table public.kb_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.events enable row level security;
alter table public.usage_counters enable row level security;
alter table public.audit_log enable row level security;
alter table public.qa_runs enable row level security;
alter table public.qa_evaluations enable row level security;

create policy companies_select on public.companies for select using (public.is_company_member(id) or public.is_superadmin());
create policy companies_update on public.companies for update using (public.is_company_admin(id));

create policy memberships_select on public.memberships for select using (user_id = auth.uid() or public.is_company_admin(company_id) or public.is_superadmin());
create policy memberships_insert on public.memberships for insert with check (public.is_company_admin(company_id));
create policy memberships_delete on public.memberships for delete using (public.is_company_admin(company_id) and role != 'owner');

create policy subs_select on public.subscriptions for select using (public.is_company_member(company_id) or public.is_superadmin());
create policy subs_all on public.subscriptions for all using (public.is_company_admin(company_id) or public.is_superadmin());

create policy ae_select on public.agents_enabled for select using (public.is_company_member(company_id));
create policy ae_all on public.agents_enabled for all using (public.is_company_admin(company_id));

create policy ac_select on public.agent_configs for select using (public.is_company_member(company_id));
create policy ac_all on public.agent_configs for all using (public.is_company_admin(company_id));

create policy ach_select on public.agent_channels for select using (public.is_company_member(company_id));
create policy ach_all on public.agent_channels for all using (public.is_company_admin(company_id));

create policy kb_select on public.knowledge_base for select using (public.is_company_member(company_id));
create policy kb_all on public.knowledge_base for all using (public.is_company_admin(company_id));

create policy kbc_select on public.kb_chunks for select using (public.is_company_member(company_id));

create policy conv_select on public.conversations for select using (public.is_company_member(company_id));
create policy msg_select on public.messages for select using (public.is_company_member(company_id));
create policy ev_select on public.events for select using (public.is_company_member(company_id));
create policy uc_select on public.usage_counters for select using (public.is_company_member(company_id));

create policy audit_select on public.audit_log for select using ((company_id is not null and public.is_company_admin(company_id)) or public.is_superadmin());

create policy qa_run_select on public.qa_runs for select using (public.is_superadmin());
create policy qa_eval_select on public.qa_evaluations for select using (public.is_superadmin());

-- service role bypasses RLS by default in Supabase

-- ============================================================
-- 9. GRANTS
-- ============================================================

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.companies, public.subscriptions, public.agents_enabled, public.agent_configs, public.agent_channels, public.knowledge_base, public.memberships to authenticated;
