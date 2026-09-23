-- ============================================
-- PROJECT TABS FEATURE (Code repos + Docs)
-- Safe to re-run
-- ============================================

-- 1. LINKED REPOSITORIES (Code tab)
create table if not exists project_repos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  url text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- 2. PROJECT DOCS (Docs tab)
create table if not exists project_docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  title text not null default 'Untitled',
  body text default '',
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. RLS
alter table project_repos enable row level security;
alter table project_docs enable row level security;

drop policy if exists "Authenticated users full access" on project_repos;
create policy "Authenticated users full access" on project_repos
  for all using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users full access" on project_docs;
create policy "Authenticated users full access" on project_docs
  for all using (auth.role() = 'authenticated');

-- 4. Indexes
create index if not exists idx_project_repos_project_id on project_repos(project_id);
create index if not exists idx_project_docs_project_id on project_docs(project_id);

-- ------------------------------------------------------------ Data API --
-- From 30 October 2026 Supabase no longer grants new tables in public to the
-- Data API roles automatically, so this migration names its own grants. These
-- are the permissions this project runs with today, so re-running this file
-- changes nothing. Row Level Security (above) is what restricts who sees what;
-- these grants only make the table reachable through the Data API at all.

grant all on public.project_repos to anon;
grant all on public.project_repos to authenticated;
grant all on public.project_repos to service_role;

grant all on public.project_docs to anon;
grant all on public.project_docs to authenticated;
grant all on public.project_docs to service_role;
