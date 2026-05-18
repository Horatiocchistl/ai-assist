-- Add asin column to gaps table for direct filtering

alter table gaps add column if not exists asin text;
create index if not exists gaps_asin_idx on gaps(asin);
