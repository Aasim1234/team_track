-- Test Case IDs (TC-0001) and real creation data for VMS test cases.
--
-- Every test case in a VMS Test Plan gets a permanent number from the database;
-- the app shows it as TC-0001. Existing test cases are numbered in plan order,
-- then sheet (row) order. A new test case always takes the next number, whatever
-- the client sends, and a number never changes or repeats.
--
-- The same trigger records who created a test case and when, from the signed-in
-- session, so "Recently added test cases" is based on real creation data that
-- cannot be edited afterwards.

alter table vms_test_plan_rows add column if not exists case_number integer;

-- Number existing test cases (only on the first run).
with numbered as (
  select r.id,
         row_number() over (order by tp.created_at, tp.id, r.sort_order, r.created_at, r.id) as n
  from vms_test_plan_rows r
  join test_plans tp on tp.id = r.plan_id
)
update vms_test_plan_rows r
set case_number = numbered.n
from numbered
where numbered.id = r.id
  and r.case_number is null
  and not exists (select 1 from vms_test_plan_rows x where x.case_number is not null);

create sequence if not exists vms_case_number_seq;
select setval('vms_case_number_seq', coalesce((select max(case_number) from vms_test_plan_rows), 0) + 1, false);
alter sequence vms_case_number_seq owned by vms_test_plan_rows.case_number;

alter table vms_test_plan_rows alter column case_number set not null;
create unique index if not exists vms_rows_case_number_key on vms_test_plan_rows (case_number);
create index if not exists idx_vms_rows_project_created on vms_test_plan_rows (project_id, created_at desc, case_number desc);

-- References to a deleted profile are cleared by ON DELETE SET NULL, which runs
-- as a nested update (trigger depth > 1). Only that path may null the
-- "who" columns below; a direct edit from the app cannot.

create or replace function vms_row_identity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.case_number := nextval('vms_case_number_seq');
    if v_actor is not null then
      new.created_by := v_actor;
      new.created_at := now();
    else
      new.created_at := coalesce(new.created_at, now());
    end if;
    return new;
  end if;

  new.case_number := old.case_number;
  new.created_at := old.created_at;
  new.created_by := case when new.created_by is null and pg_trigger_depth() > 1 then null else old.created_by end;
  return new;
end;
$$;

drop trigger if exists trg_vms_row_identity on vms_test_plan_rows;
create trigger trg_vms_row_identity
  before insert or update on vms_test_plan_rows
  for each row execute function vms_row_identity();

-- Same deleted-profile handling for the To-Do task columns.
create or replace function vms_row_task_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_project uuid;
  v_owner text;
begin
  v_project := coalesce(new.project_id, (select project_id from test_plans where id = new.plan_id));

  -- A new (or changed) assignment starts a fresh task for the assignee.
  if tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is null then
      new.assigned_by := null;
      new.task_status := null;
      new.task_status_at := null;
      new.task_status_by := null;
    else
      new.assigned_by := v_actor;
      new.task_status := 'open';
      new.task_status_at := now();
      new.task_status_by := v_actor;
    end if;
    return new;
  end if;

  new.assigned_by := case when new.assigned_by is null and pg_trigger_depth() > 1 then null else old.assigned_by end;

  if new.task_status is distinct from old.task_status then
    if new.assigned_to is null then
      raise exception 'This test case is not assigned to anyone, so it has no task to update.';
    end if;
    if new.task_status is null then
      raise exception 'A task can be completed, closed or reopened, but not removed. Unassign the test case instead.';
    end if;
    if v_actor is not null and v_actor <> new.assigned_to and not has_project_role(v_project, 'admin', 'lead') then
      select coalesce(nullif(name, ''), email) into v_owner from profiles where id = new.assigned_to;
      v_owner := coalesce(v_owner, 'another user');
      raise exception 'This task belongs to %. Only % or an Admin/Lead can complete, close or reopen it.', v_owner, v_owner;
    end if;
    if new.task_status = 'completed' and coalesce(new.result, 'not_tested') = 'not_tested' then
      raise exception 'Record a result for this test case before completing the task.';
    end if;
    new.task_status_at := now();
    new.task_status_by := v_actor;
  else
    new.task_status_at := old.task_status_at;
    new.task_status_by := case when new.task_status_by is null and pg_trigger_depth() > 1 then null else old.task_status_by end;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
