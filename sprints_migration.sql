-- ============================================
-- SPRINTS / CYCLES FEATURE
-- Safe to re-run
-- ============================================

-- 1. TABLE
create table if not exists sprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text default 'planned', -- 'planned', 'active', 'completed'
  created_at timestamptz default now()
);

-- 2. Add sprint_id to issues (nullable = backlog when null)
alter table issues add column if not exists sprint_id uuid references sprints(id) on delete set null;

-- 3. RLS
alter table sprints enable row level security;

drop policy if exists "Authenticated users full access" on sprints;
create policy "Authenticated users full access" on sprints
  for all using (auth.role() = 'authenticated');

-- 4. Indexes
create index if not exists idx_sprints_project_id on sprints(project_id);
create index if not exists idx_issues_sprint_id on issues(sprint_id);

-- 5. Only one active sprint per project at a time (enforced at DB level)
create unique index if not exists idx_one_active_sprint_per_project
  on sprints(project_id)
  where status = 'active';

-- ------------------------------------------------------------ Data API --
-- From 30 October 2026 Supabase no longer grants new tables in public to the
-- Data API roles automatically, so this migration names its own grants. These
-- are the permissions this project runs with today, so re-running this file
-- changes nothing. Row Level Security (above) is what restricts who sees what;
-- these grants only make the table reachable through the Data API at all.

grant all on public.sprints to anon;
grant all on public.sprints to authenticated;
grant all on public.sprints to service_role;
