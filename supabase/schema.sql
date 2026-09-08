-- Ultraplan: one row per user with the same three blobs the app keeps in localStorage.
-- Run this once in Supabase → SQL Editor.

create table if not exists public.user_data (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  profile     jsonb not null default '{}'::jsonb,
  log         jsonb not null default '{}'::jsonb,
  activities  jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "own row: select" on public.user_data;
drop policy if exists "own row: insert" on public.user_data;
drop policy if exists "own row: update" on public.user_data;
drop policy if exists "own row: delete" on public.user_data;

create policy "own row: select" on public.user_data for select using (auth.uid() = user_id);
create policy "own row: insert" on public.user_data for insert with check (auth.uid() = user_id);
create policy "own row: update" on public.user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row: delete" on public.user_data for delete using (auth.uid() = user_id);
