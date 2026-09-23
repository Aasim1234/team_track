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

-- ------------------------------------------------------------ Data API --
-- From 30 October 2026 Supabase no longer grants new tables in public to the
-- Data API roles automatically, so this migration names its own grants. These
-- are the permissions this project runs with today, so re-running this file
-- changes nothing. Row Level Security (above) is what restricts who sees what;
-- these grants only make the table reachable through the Data API at all.

grant all on public.starred_projects to anon;
grant all on public.starred_projects to authenticated;
grant all on public.starred_projects to service_role;
