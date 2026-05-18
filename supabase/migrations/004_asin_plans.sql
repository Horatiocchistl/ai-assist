-- Gap Analyzer Pre-Run: asin_plans + planned-assets storage policies
-- Apply order: 002_gap_analyzer_storage.sql → 004_asin_plans.sql (this file)

create table if not exists asin_plans (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  asin         text not null unique,
  images       jsonb not null default '[]',  -- [{ path, filename, label?, section? }]
  sheet        jsonb,                       -- { path, filename } or null
  created_at   timestamptz default now()
);

create index if not exists asin_plans_created_at_idx on asin_plans(created_at desc);

-- Table access (single-consultant app; anon key in Electron renderer)
grant select, insert, update, delete on asin_plans to anon;
grant select, insert, update, delete on asin_plans to authenticated;

-- Storage policies for planned-assets bucket (requires 002 to create bucket)
drop policy if exists "planned-assets anon select" on storage.objects;
drop policy if exists "planned-assets anon insert" on storage.objects;
drop policy if exists "planned-assets anon update" on storage.objects;
drop policy if exists "planned-assets anon delete" on storage.objects;

create policy "planned-assets anon select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'planned-assets');

create policy "planned-assets anon insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'planned-assets');

create policy "planned-assets anon update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'planned-assets')
  with check (bucket_id = 'planned-assets');

create policy "planned-assets anon delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'planned-assets');
