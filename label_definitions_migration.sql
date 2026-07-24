-- ============================================
-- LABEL DEFINITIONS (Admin > Customizations)
-- Promotes the previously-hardcoded issue label list into a real,
-- admin-manageable table. Safe to re-run.
-- ============================================

create table if not exists label_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default 'gray' check (color in ('green', 'blue', 'orange', 'red', 'purple', 'gray')),
  created_at timestamptz default now()
);

alter table label_definitions enable row level security;

-- Everyone needs to read the label list when creating/editing an issue.
drop policy if exists "Authenticated users can view labels" on label_definitions;
create policy "Authenticated users can view labels" on label_definitions
  for select using (auth.role() = 'authenticated');

-- Only project admins can manage the shared label vocabulary.
drop policy if exists "Project admins manage labels" on label_definitions;
create policy "Project admins manage labels" on label_definitions
  for all using (
    exists (select 1 from project_members where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from project_members where user_id = auth.uid() and role = 'admin')
  );

-- Seed with the labels that were previously hardcoded in NewIssueModal.jsx,
-- so existing behavior doesn't regress for current users.
insert into label_definitions (name, color) values
  ('bug', 'red'),
  ('enhancement', 'green'),
  ('documentation', 'blue'),
  ('urgent', 'orange'),
  ('blocked', 'purple'),
  ('good first issue', 'green'),
  ('needs review', 'purple'),
  ('wontfix', 'gray')
on conflict (name) do nothing;
