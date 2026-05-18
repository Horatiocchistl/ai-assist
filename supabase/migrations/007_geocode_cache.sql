-- Persistent geocode cache (Nominatim results) for weather lookups

create table if not exists geocode_cache (
  id                 uuid primary key default gen_random_uuid(),
  query_key          text not null unique,
  query_original     text not null,
  latitude           double precision not null,
  longitude          double precision not null,
  display_name       text not null,
  source             text not null default 'nominatim',
  nominatim_place_id bigint,
  created_at         timestamptz not null default now()
);

create index if not exists geocode_cache_query_key_idx on geocode_cache (query_key);

grant select, insert on geocode_cache to anon;
grant select, insert on geocode_cache to authenticated;
