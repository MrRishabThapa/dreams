create extension if not exists pgcrypto;

-- ignore stale offline writes, stamp server time
create or replace function public.touch_row() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_modified_at := now();
  return new;
end $$;

create table public.accounts (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  name text not null,
  kind text not null check (kind in ('cash','bank','wallet','savings','investment')),
  opening_minor bigint not null default 0,
  icon text, color text,
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_modified_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  name text not null,
  type text not null check (type in ('income','expense')),
  icon text, color text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_modified_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  type text not null check (type in ('expense','income','transfer','adjust')),
  amount_minor bigint not null,
  account_id uuid not null,
  to_account_id uuid,
  category_id uuid,
  category_name text,
  occurred_on date not null,
  note text not null default '',
  debt_id uuid,
  debt_event text check (debt_event in ('open','pay')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_modified_at timestamptz not null default now()
);

create table public.debts (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  person text not null,
  direction text not null check (direction in ('owe','owed')),
  amount_minor bigint not null check (amount_minor > 0),
  opened_on date not null,
  due_on date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_modified_at timestamptz not null default now()
);

create table public.dreams (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  title text not null,
  icon text, color text,
  target_minor bigint not null check (target_minor > 0),
  target_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_modified_at timestamptz not null default now()
);

create table public.dream_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  dream_id uuid not null,
  amount_minor bigint not null,
  entered_on date not null,
  note text not null default '',
  transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_modified_at timestamptz not null default now()
);

create table public.audits (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  snapshot jsonb not null,
  reflection text not null default '',
  next_savings_target_minor bigint,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_modified_at timestamptz not null default now(),
  unique (user_id, month)
);

create table public.user_settings (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  currency text not null default 'NPR',
  symbol text not null default 'Rs',
  monthly_savings_target_minor bigint,
  theme text not null default 'auto',
  auto_sync boolean not null default false,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_modified_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','debts','dreams','dream_entries','audits','user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_row()', t);
    execute format('create index on public.%I (user_id, server_modified_at)', t);
  end loop;
end $$;

-- ---------- Schema changes after the first release ----------
-- Safe to run again on an existing project (idempotent). Run before deploying a client
-- that uses new columns; see DEPLOY.md "Schema changes".

-- v1.2.2: the name in the Home greeting
alter table public.user_settings add column if not exists display_name text;

-- make PostgREST pick up new columns right away
notify pgrst, 'reload schema';
