-- ============================================
-- VMS TEST PLANS
-- test_plans -> test_runs.test_plan_id (a run belongs to at most one plan)
-- test_plans -> test_plan_items (free-form VMS scenario checklist)
-- Safe to re-run
-- ============================================

-- ============================================
-- 1. TEST PLANS
-- ============================================

create table if not exists test_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  description text,
  release_version text,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  owner_id uuid references profiles(id),
  target_date date,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.set_test_plan_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_test_plan_updated_at on test_plans;
create trigger trg_set_test_plan_updated_at
  before update on test_plans
  for each row execute function public.set_test_plan_updated_at();

alter table test_plans enable row level security;

drop policy if exists "Members can view test plans" on test_plans;
create policy "Members can view test plans" on test_plans
  for select using (public.has_project_access(project_id));

drop policy if exists "Testers can create test plans" on test_plans;
create policy "Testers can create test plans" on test_plans
  for insert with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Testers can update test plans" on test_plans;
create policy "Testers can update test plans" on test_plans
  for update using (public.has_project_role(project_id, 'admin', 'lead', 'tester'))
  with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Leads can delete test plans" on test_plans;
create policy "Leads can delete test plans" on test_plans
  for delete using (public.has_project_role(project_id, 'admin', 'lead'));

create index if not exists idx_test_plans_project_id on test_plans(project_id);

-- ============================================
-- 2. LINK TEST RUNS TO A PLAN (nullable — same shape as issues.sprint_id)
-- ============================================

alter table test_runs add column if not exists test_plan_id uuid references test_plans(id) on delete set null;

create index if not exists idx_test_runs_test_plan_id on test_runs(test_plan_id);

-- ============================================
-- 3. TEST PLAN ITEMS (VMS scenario checklist within a plan)
-- ============================================

create table if not exists test_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references test_plans(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  category text,
  notes text,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'done')),
  test_case_id uuid references test_cases(id) on delete set null,
  sort_order integer default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create or replace function public.set_test_plan_item_project_id()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is null then
    select project_id into new.project_id from test_plans where id = new.plan_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_test_plan_item_project_id on test_plan_items;
create trigger trg_set_test_plan_item_project_id
  before insert on test_plan_items
  for each row execute function public.set_test_plan_item_project_id();

alter table test_plan_items enable row level security;

drop policy if exists "Members can view test plan items" on test_plan_items;
create policy "Members can view test plan items" on test_plan_items
  for select using (public.has_project_access(project_id));

drop policy if exists "Testers can add test plan items" on test_plan_items;
create policy "Testers can add test plan items" on test_plan_items
  for insert with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Testers can update test plan items" on test_plan_items;
create policy "Testers can update test plan items" on test_plan_items
  for update using (public.has_project_role(project_id, 'admin', 'lead', 'tester'))
  with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Leads can delete test plan items" on test_plan_items;
create policy "Leads can delete test plan items" on test_plan_items
  for delete using (public.has_project_role(project_id, 'admin', 'lead'));

create index if not exists idx_test_plan_items_plan_id on test_plan_items(plan_id);
create index if not exists idx_test_plan_items_project_id on test_plan_items(project_id);
