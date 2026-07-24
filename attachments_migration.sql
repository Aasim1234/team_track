-- ============================================
-- FILE ATTACHMENTS FOR ISSUES
-- Safe to re-run
-- ============================================

-- 1. Attachments table
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references issues(id) on delete cascade not null,
  file_name text not null,
  file_url text not null,
  file_type text not null, -- 'image' | 'video' | 'file'
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table attachments enable row level security;

drop policy if exists "Authenticated users full access" on attachments;
create policy "Authenticated users full access" on attachments
  for all using (auth.role() = 'authenticated');

create index if not exists idx_attachments_issue_id on attachments(issue_id);

-- 2. Storage bucket for the actual files (images/videos)
-- This creates a public bucket named "issue-attachments".
-- If this insert fails or behaves oddly on your Supabase version, instead
-- create it manually: Dashboard -> Storage -> New bucket -> name it
-- "issue-attachments" -> toggle "Public bucket" ON -> Save.
insert into storage.buckets (id, name, public)
values ('issue-attachments', 'issue-attachments', true)
on conflict (id) do nothing;

-- 3. Storage policies: any authenticated user can upload/read/delete
-- files in this bucket (fine for an internal team tool).
drop policy if exists "Authenticated users can upload attachments" on storage.objects;
create policy "Authenticated users can upload attachments"
  on storage.objects for insert
  with check (bucket_id = 'issue-attachments' and auth.role() = 'authenticated');

drop policy if exists "Anyone can view attachments" on storage.objects;
create policy "Anyone can view attachments"
  on storage.objects for select
  using (bucket_id = 'issue-attachments');

drop policy if exists "Authenticated users can delete attachments" on storage.objects;
create policy "Authenticated users can delete attachments"
  on storage.objects for delete
  using (bucket_id = 'issue-attachments' and auth.role() = 'authenticated');
