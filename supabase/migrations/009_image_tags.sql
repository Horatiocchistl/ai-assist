-- Image tags for comparison view

create table if not exists image_tags (
  id          uuid primary key default gen_random_uuid(),
  run_id      text not null,
  asin        text not null,
  section     text not null,        -- page | hero | carousel_01 | aplus_01 | ...
  image_type  text not null,        -- live | planned
  image_index int,                  -- for multiple images (carousel, aplus), null for hero
  tag         text not null,
  created_at  timestamptz default now(),
  unique(run_id, asin, section, image_type, image_index, tag)
);

create index if not exists image_tags_run_asin_idx on image_tags(run_id, asin);
create index if not exists image_tags_tag_idx on image_tags(tag);
