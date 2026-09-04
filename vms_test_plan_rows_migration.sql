-- VMS Test Plan rows.
--
-- This module mirrors the source Google Sheet one-for-one: five columns,
-- Topic / Scenario / Test Steps / Expected Result / RESULT, and nothing else.
-- It deliberately does NOT reuse test_cases — that model carries IDs,
-- preconditions, priorities and versions this module must not show.

create table if not exists vms_test_plan_rows (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references test_plans(id) on delete cascade not null,
  project_id uuid not null,
  topic text,
  scenario text,
  test_steps text,
  expected_result text,
  -- not_tested | pass | fail | blocked | retest | na
  result text default 'not_tested',
  sort_order integer default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_vms_rows_plan_id on vms_test_plan_rows(plan_id, sort_order);

-- project_id is denormalized so RLS can check access without a join, the same
-- convention test_run_cases and test_results already follow.
create or replace function set_vms_row_project_id()
returns trigger language plpgsql as $$
begin
  if new.project_id is null then
    select project_id into new.project_id from test_plans where id = new.plan_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vms_row_project_id on vms_test_plan_rows;
create trigger trg_vms_row_project_id
  before insert on vms_test_plan_rows
  for each row execute function set_vms_row_project_id();

alter table vms_test_plan_rows enable row level security;

drop policy if exists "vms_rows_select" on vms_test_plan_rows;
create policy "vms_rows_select" on vms_test_plan_rows
  for select using (has_project_access(project_id));

drop policy if exists "vms_rows_insert" on vms_test_plan_rows;
create policy "vms_rows_insert" on vms_test_plan_rows
  for insert with check (has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "vms_rows_update" on vms_test_plan_rows;
create policy "vms_rows_update" on vms_test_plan_rows
  for update using (has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "vms_rows_delete" on vms_test_plan_rows;
create policy "vms_rows_delete" on vms_test_plan_rows
  for delete using (has_project_role(project_id, 'admin', 'lead'));
