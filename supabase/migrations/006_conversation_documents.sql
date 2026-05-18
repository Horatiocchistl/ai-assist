-- Saved conversation documents (permanent on user Save)
-- Apply after 002_gap_analyzer_storage.sql

insert into storage.buckets (id, name, public)
values ('conversation-documents', 'conversation-documents', false)
on conflict (id) do nothing;

create table if not exists conversation_documents (
  id              uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  project_id      text,
  title           text not null,
  filename        text not null,
  storage_path    text not null,
  saved_at        timestamptz not null default now(),
  created_at      timestamptz default now()
);

create index if not exists conversation_documents_conv_idx
  on conversation_documents (conversation_id, saved_at desc);

create index if not exists conversation_documents_project_idx
  on conversation_documents (project_id, saved_at desc)
  where project_id is not null;

grant select, insert, update, delete on conversation_documents to anon;
grant select, insert, update, delete on conversation_documents to authenticated;

drop policy if exists "conversation-documents anon select" on storage.objects;
drop policy if exists "conversation-documents anon insert" on storage.objects;
drop policy if exists "conversation-documents anon update" on storage.objects;
drop policy if exists "conversation-documents anon delete" on storage.objects;

create policy "conversation-documents anon select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'conversation-documents');

create policy "conversation-documents anon insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'conversation-documents');

create policy "conversation-documents anon update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'conversation-documents')
  with check (bucket_id = 'conversation-documents');

create policy "conversation-documents anon delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'conversation-documents');
