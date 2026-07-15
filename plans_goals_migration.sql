-- ============================================
-- PLANS & GOALS FEATURE
-- Safe to re-run
-- ============================================

-- 1. PLANS (cross-project timelines)
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists plan_projects (
  plan_id uuid references plans(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  primary key (plan_id, project_id)
);

-- 2. GOALS
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  project_id uuid references projects(id) on delete set null,
  owner_id uuid references profiles(id),
  status text default 'on_track', -- 'on_track', 'at_risk', 'off_track', 'done'
  progress int default 0 check (progress >= 0 and progress <= 100),
  target_date date,
  created_at timestamptz default now()
);

-- 3. RLS
alter table plans enable row level security;
alter table plan_projects enable row level security;
alter table goals enable row level security;

drop policy if exists "Authenticated users full access" on plans;
create policy "Authenticated users full access" on plans
  for all using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users full access" on plan_projects;
create policy "Authenticated users full access" on plan_projects
  for all using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users full access" on goals;
create policy "Authenticated users full access" on goals
  for all using (auth.role() = 'authenticated');

-- 4. Indexes
create index if not exists idx_plan_projects_project_id on plan_projects(project_id);
create index if not exists idx_goals_project_id on goals(project_id);
create index if not exists idx_goals_owner_id on goals(owner_id);
