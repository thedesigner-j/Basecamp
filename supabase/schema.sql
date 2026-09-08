-- Run this once in Supabase: Project > SQL Editor > New query > paste > Run

create table if not exists settings (
  id int primary key default 1,
  twelvedata_api_key text,
  alert_email text,
  alerts_enabled boolean default true,
  constraint singleton_settings check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

create table if not exists candles (
  symbol text not null,
  interval text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (symbol, interval)
);

create table if not exists setups (
  symbol text primary key,
  trend_daily text,
  trend_4h text,
  zone jsonb,
  status text,
  primary_setup jsonb,
  secondary_setup jsonb,
  ema_context jsonb,
  updated_at timestamptz default now()
);

-- If you already ran this file before the EMA feature was added, just run:
-- alter table setups add column if not exists ema_context jsonb;

create table if not exists trade_events (
  id bigserial primary key,
  symbol text not null,
  event_type text not null, -- 'entry' or 'exit'
  direction text,           -- 'long' or 'short'
  stack_before jsonb,       -- EMA stack config + duration, one run prior to this event
  stack_at_event jsonb,     -- EMA stack config + duration, at the moment of this event
  created_at timestamptz not null default now()
);

create table if not exists drawings (
  id bigserial primary key,
  symbol text not null,
  interval text not null default 'daily',
  type text not null,       -- 'horizontal_line' or 'abcd_pattern'
  data jsonb not null,      -- shape depends on type, see lib/analysis.js / components
  created_at timestamptz not null default now()
);

-- Row Level Security stays off for these tables: the app only ever talks to
-- Supabase from the server using the service role key, never from the browser.
