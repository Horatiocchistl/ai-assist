-- Drop FK to legacy runs table, change run_id to text to support server_run_id format
-- (e.g. "gap_1748_abc") used by gap_sessions. Required before any LLM gap inserts will work.
alter table gaps drop constraint if exists gaps_run_id_fkey;
alter table gaps alter column run_id type text using run_id::text;
create index if not exists gaps_run_id_text_idx on gaps(run_id);

-- Add category column for the 7-panel analysis structure
alter table gaps add column if not exists category text;
