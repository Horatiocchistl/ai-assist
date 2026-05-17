-- Gap Analyzer tables

create table if not exists asins (
  id          uuid primary key default gen_random_uuid(),
  asin        text not null,
  url         text not null,
  title       text,
  page_type   text default 'pdp',  -- pdp | aplus | brand_store
  group_tag   text,
  created_at  timestamptz default now()
);

create table if not exists runs (
  id           uuid primary key default gen_random_uuid(),
  asin_id      uuid references asins(id) on delete cascade,
  status       text default 'pending',  -- pending | running | complete | error
  error_msg    text,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz default now()
);

create table if not exists gaps (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid references runs(id) on delete cascade,
  section         text,       -- hero | carousel_N | bullets | aplus_N | brand
  gap_type        text,       -- image_missing | image_wrong | copy_drift | color_mismatch | layout_shift | asset_swapped | extra_image
  severity        text,       -- critical | warning | ok
  description     text,
  planned_img_url text,
  live_img_url    text,
  diff_img_url    text,
  created_at      timestamptz default now()
);

create index if not exists runs_asin_id_idx on runs(asin_id);
create index if not exists gaps_run_id_idx on gaps(run_id);
create index if not exists gaps_severity_idx on gaps(severity);
