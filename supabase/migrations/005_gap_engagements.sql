-- Gap engagements + extend asin_plans + gap_sessions live metadata
-- Apply after 004_asin_plans.sql

create table if not exists gap_engagements (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  source_path   text,
  imported_at   timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz default now()
);

create index if not exists gap_engagements_imported_at_idx
  on gap_engagements(imported_at desc nulls last);

grant select, insert, update, delete on gap_engagements to anon;
grant select, insert, update, delete on gap_engagements to authenticated;

-- Extend asin_plans (004)
alter table asin_plans
  add column if not exists engagement_id uuid references gap_engagements(id) on delete cascade,
  add column if not exists sort_order int not null default 0,
  add column if not exists copy_spec jsonb,
  add column if not exists product_data jsonb;

-- Drop global ASIN unique — unique per engagement
alter table asin_plans drop constraint if exists asin_plans_asin_key;

create unique index if not exists asin_plans_engagement_asin_idx
  on asin_plans(engagement_id, asin)
  where engagement_id is not null;

create index if not exists asin_plans_engagement_sort_idx
  on asin_plans(engagement_id, sort_order);

-- gap_sessions: link to engagement + optional live file manifest
alter table gap_sessions
  add column if not exists engagement_id uuid references gap_engagements(id) on delete set null,
  add column if not exists live_files jsonb not null default '[]';

-- live-captures bucket policies (requires 002)
drop policy if exists "live-captures anon select" on storage.objects;
drop policy if exists "live-captures anon insert" on storage.objects;
drop policy if exists "live-captures anon update" on storage.objects;
drop policy if exists "live-captures anon delete" on storage.objects;

create policy "live-captures anon select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'live-captures');

create policy "live-captures anon insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'live-captures');

create policy "live-captures anon update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'live-captures')
  with check (bucket_id = 'live-captures');

create policy "live-captures anon delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'live-captures');
