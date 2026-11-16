-- Tally database. Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Every row belongs to one user and row-level security stops anyone else reading it.

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider_name text not null default 'Bank',
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  status text not null default 'ok',
  last_synced timestamptz,
  created_at timestamptz not null default now()
);
-- No policies on purpose: bank tokens are only ever touched by the `bank` edge function (service role).
alter table public.bank_connections enable row level security;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  institution text not null default '',
  type text not null default 'current',
  balance numeric not null default 0,
  source text not null default 'manual',
  external_id text,
  connection_id uuid references public.bank_connections on delete set null,
  last_synced timestamptz,
  unique (user_id, external_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  date date not null,
  amount numeric not null,
  description text not null default '',
  category text not null default '',
  notes text not null default '',
  source text not null default 'manual',
  external_id text,
  unique (user_id, external_id)
);
create index if not exists transactions_user_date on public.transactions (user_id, date desc);

create table if not exists public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  amount numeric not null,
  kind text not null,
  category text not null default 'Other',
  frequency text not null default 'monthly',
  next_due date not null,
  active boolean not null default true
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  merchant text not null,
  date date not null,
  total numeric not null,
  category text not null default 'Other',
  notes text not null default '',
  file_path text,
  file_type text,
  transaction_id uuid references public.transactions on delete set null
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category text not null,
  monthly_limit numeric not null
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  target numeric not null,
  saved numeric not null default 0,
  target_date date
);

do $$
declare t text;
begin
  foreach t in array array['accounts', 'transactions', 'recurring', 'receipts', 'budgets', 'goals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Private bucket for receipt photos; each user can only reach files under their own user-id folder.
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
drop policy if exists receipts_own_files on storage.objects;
create policy receipts_own_files on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
