-- Strava connection: one row per user with the athlete's tokens. Run once in Supabase → SQL Editor.
-- Only the server (service role, api/strava.js) reads and writes this table: row level security is on and
-- no policy exists, so the browser (anon key) can never read a token.

create table if not exists public.strava_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  athlete_id bigint,
  athlete_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  last_sync timestamptz,
  created_at timestamptz not null default now()
);

alter table public.strava_tokens enable row level security;
