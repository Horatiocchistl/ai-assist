-- Storage buckets for gap analyzer images

insert into storage.buckets (id, name, public)
values
  ('planned-assets', 'planned-assets', false),
  ('live-captures',  'live-captures',  false),
  ('diff-heatmaps',  'diff-heatmaps',  false)
on conflict (id) do nothing;
