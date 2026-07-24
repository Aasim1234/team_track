-- ============================================
-- STARRED PROJECTS (for sidebar)
-- Safe to re-run
-- ============================================

create table if not exists starred_projects (
  user_id uuid references profiles(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (user_id, project_id)
);

alter table starred_projects enable row level security;

drop policy if exists "Users manage their own stars" on starred_projects;
create policy "Users manage their own stars" on starred_projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
