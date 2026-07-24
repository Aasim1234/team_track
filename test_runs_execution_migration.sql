-- ============================================
-- TEST RUNS & EXECUTION
-- test_runs -> test_run_cases (junction) -> test_results (append-only history)
-- Safe to re-run
-- ============================================

-- ============================================
-- 1. TEST RUNS
-- ============================================

create table if not exists test_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  closed_by uuid references profiles(id),
  closed_at timestamptz
);

alter table test_runs enable row level security;

drop policy if exists "Members can view test runs" on test_runs;
create policy "Members can view test runs" on test_runs
  for select using (public.has_project_access(project_id));

drop policy if exists "Testers can create test runs" on test_runs;
create policy "Testers can create test runs" on test_runs
  for insert with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Testers can update test runs" on test_runs;
create policy "Testers can update test runs" on test_runs
  for update using (public.has_project_role(project_id, 'admin', 'lead', 'tester'))
  with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Leads can delete test runs" on test_runs;
create policy "Leads can delete test runs" on test_runs
  for delete using (public.has_project_role(project_id, 'admin', 'lead'));

create index if not exists idx_test_runs_project_id on test_runs(project_id);

-- ============================================
-- 2. TEST RUN CASES (junction — a case can appear in many runs,
--    each with its own independent result history)
-- ============================================

create table if not exists test_run_cases (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references test_runs(id) on delete cascade not null,
  test_case_id uuid references test_cases(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade,
  assigned_to uuid references profiles(id),
  created_at timestamptz default now(),
  unique (run_id, test_case_id)
);

create or replace function public.set_test_run_case_project_id()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is null then
    select project_id into new.project_id from test_runs where id = new.run_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_test_run_case_project_id on test_run_cases;
create trigger trg_set_test_run_case_project_id
  before insert on test_run_cases
  for each row execute function public.set_test_run_case_project_id();

alter table test_run_cases enable row level security;

drop policy if exists "Members can view test run cases" on test_run_cases;
create policy "Members can view test run cases" on test_run_cases
  for select using (public.has_project_access(project_id));

drop policy if exists "Testers can add test run cases" on test_run_cases;
create policy "Testers can add test run cases" on test_run_cases
  for insert with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Testers can update test run cases" on test_run_cases;
create policy "Testers can update test run cases" on test_run_cases
  for update using (public.has_project_role(project_id, 'admin', 'lead', 'tester'))
  with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Leads can remove test run cases" on test_run_cases;
create policy "Leads can remove test run cases" on test_run_cases
  for delete using (public.has_project_role(project_id, 'admin', 'lead'));

create index if not exists idx_test_run_cases_run_id on test_run_cases(run_id);
create index if not exists idx_test_run_cases_test_case_id on test_run_cases(test_case_id);
create index if not exists idx_test_run_cases_project_id on test_run_cases(project_id);
create index if not exists idx_test_run_cases_assigned_to on test_run_cases(assigned_to);

-- ============================================
-- 3. TEST RESULTS (append-only execution history —
--    never updated or deleted, mirrors test_case_versions)
-- ============================================

create table if not exists test_results (
  id uuid primary key default gen_random_uuid(),
  run_case_id uuid references test_run_cases(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade,
  status text not null check (status in ('untested', 'passed', 'failed', 'blocked', 'retest', 'skipped')),
  comment text,
  elapsed_minutes int,
  executed_by uuid references profiles(id),
  executed_at timestamptz default now()
);

create or replace function public.set_test_result_project_id()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is null then
    select project_id into new.project_id from test_run_cases where id = new.run_case_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_test_result_project_id on test_results;
create trigger trg_set_test_result_project_id
  before insert on test_results
  for each row execute function public.set_test_result_project_id();

alter table test_results enable row level security;

drop policy if exists "Members can view test results" on test_results;
create policy "Members can view test results" on test_results
  for select using (public.has_project_access(project_id));

drop policy if exists "Testers can record test results" on test_results;
create policy "Testers can record test results" on test_results
  for insert with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

-- Deliberately no update/delete policy for any role — execution history
-- is permanent. A correction is recorded as a new result, never an edit.

create index if not exists idx_test_results_run_case_id on test_results(run_case_id);
create index if not exists idx_test_results_project_id on test_results(project_id);

-- ============================================
-- 4. CURRENT-STATUS VIEW (latest result per run case)
-- security_invoker = true is required here — without it this view would
-- run with the view owner's privileges and could leak other projects'
-- data to any authenticated user, bypassing the RLS above entirely.
-- ============================================

create or replace view test_run_case_current_status
with (security_invoker = true) as
select
  trc.id as run_case_id,
  trc.run_id,
  trc.test_case_id,
  trc.project_id,
  trc.assigned_to,
  coalesce(latest.status, 'untested') as current_status,
  latest.executed_at as last_executed_at,
  latest.executed_by as last_executed_by,
  latest.comment as last_comment
from test_run_cases trc
left join lateral (
  select tr.status, tr.executed_at, tr.executed_by, tr.comment
  from test_results tr
  where tr.run_case_id = trc.id
  order by tr.executed_at desc
  limit 1
) latest on true;

grant select on test_run_case_current_status to authenticated;
