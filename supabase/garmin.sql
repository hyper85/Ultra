-- Garmin connection: one row per user with the runner's own Garmin Personal API key and the current ~24 h access
-- token. Run once in Supabase → SQL Editor. Only the server (service role, api/garmin.js) reads and writes this table:
-- row level security is on and no policy exists, so the browser (anon key) can never read a key.

create table if not exists public.garmin_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  api_key text not null,
  access_token text,
  token_expires bigint,
  last_sync timestamptz,
  created_at timestamptz not null default now()
);

alter table public.garmin_keys enable row level security;
