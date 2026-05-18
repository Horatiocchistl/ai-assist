-- Human annotations for comparison view

create table if not exists asin_annotations (
  id          uuid primary key default gen_random_uuid(),
  run_id      text not null,
  asin        text not null,
  section     text not null,   -- hero | carousel_01 | carousel_02 | aplus_01 | aplus_02 | ...
  note        text,
  severity    text,            -- critical | warning | ok | null
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(run_id, asin, section)
);

create index if not exists asin_annotations_run_asin_idx on asin_annotations(run_id, asin);
