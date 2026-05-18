-- Batch-level gap analyzer run persistence
-- Run this in Supabase SQL editor before using the Results tab

create table if not exists gap_sessions (
  id            uuid primary key default gen_random_uuid(),
  server_run_id text not null unique,
  completed_at  timestamptz default now(),
  asins_data    jsonb not null  -- [{ asin, url, status, carouselCount, aplusCount }]
);

create index if not exists gap_sessions_completed_at_idx
  on gap_sessions(completed_at desc);
