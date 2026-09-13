-- To-Do tasks for assigned test cases.
--
-- A test case assigned to someone is a task for that person. The task state is
-- stored on the test case row itself, so the Test Plan grid, the To-Do page and
-- every device always read the same thing:
--   task_status     open | completed | closed   (null while unassigned)
--   assigned_by     who made the current assignment
--   task_status_at  when the task was opened / completed / closed / reopened
--   task_status_by  who did it
--
-- Rules (enforced here, so the API cannot bypass them):
--   * Assigning or reassigning opens a fresh task for the new assignee;
--     unassigning clears the task. The test case itself is never removed.
--   * A result on its own never completes or closes a task (Fail, Blocked and
--     Retest included). Only an explicit Complete / Close does.
--   * Completing needs a recorded result; closing does not.
--   * Only the assignee or a project Admin/Lead can complete, close or reopen.
--   * assigned_by and the task timestamps cannot be edited directly.
-- Completions, closures and reopenings are written to the activity log.

alter table vms_test_plan_rows
  add column if not exists assigned_by uuid references profiles(id) on delete set null,
  add column if not exists task_status text,
  add column if not exists task_status_at timestamptz,
  add column if not exists task_status_by uuid references profiles(id) on delete set null;

alter table vms_test_plan_rows drop constraint if exists vms_rows_task_status_valid;
alter table vms_test_plan_rows add constraint vms_rows_task_status_valid
  check (task_status is null or task_status in ('open', 'completed', 'closed'));

create index if not exists idx_vms_rows_task_assignee
  on vms_test_plan_rows (project_id, assigned_to, task_status) where assigned_to is not null;

-- Test cases already assigned become open tasks. Who assigned them is taken
-- from the activity log. This runs before the task triggers exist, so it adds
-- no log entries and changes nothing else on those rows.
update vms_test_plan_rows r
set task_status = 'open',
    task_status_at = coalesce(r.assigned_at, now()),
    assigned_by = (select a.actor_id from audit_log a
                   where a.entity_id = r.id and a.action in ('assigned', 'reassigned')
                   order by a.occurred_at desc, a.id desc limit 1)
where r.assigned_to is not null and r.task_status is null;

-- Every assigned test case has a task, and only assigned ones do.
alter table vms_test_plan_rows drop constraint if exists vms_rows_task_needs_assignee;
alter table vms_test_plan_rows add constraint vms_rows_task_needs_assignee
  check ((assigned_to is null) = (task_status is null));

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

  new.assigned_by := old.assigned_by;

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
    new.task_status_by := old.task_status_by;
  end if;

  return new;
end;
$$;

-- Named to run after the assignment guard, which decides whether the
-- assignment change is allowed at all.
drop trigger if exists trg_vms_row_task_sync on vms_test_plan_rows;
create trigger trg_vms_row_task_sync
  before insert or update on vms_test_plan_rows
  for each row execute function vms_row_task_sync();

create or replace function audit_vms_row_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan_name text;
  v_label text;
begin
  -- Tasks opened or cleared by an assignment change are covered by the
  -- assignment entry.
  if new.assigned_to is distinct from old.assigned_to
     or new.task_status is not distinct from old.task_status then
    return new;
  end if;

  select name into v_plan_name from test_plans where id = new.plan_id;
  v_label := coalesce(nullif(btrim(new.scenario), ''), nullif(btrim(new.topic), ''), '(blank row)');

  perform audit_write(new.project_id,
    case new.task_status when 'completed' then 'task_completed'
                         when 'closed' then 'task_closed'
                         else 'task_reopened' end,
    'test_case', new.id, v_label, new.plan_id, v_plan_name,
    'Task', initcap(old.task_status), initcap(new.task_status),
    'Result: ' || audit_result_label(coalesce(new.result, 'not_tested')), new.result);
  return new;
end;
$$;

drop trigger if exists trg_audit_vms_row_task on vms_test_plan_rows;
create trigger trg_audit_vms_row_task
  after update of task_status on vms_test_plan_rows
  for each row execute function audit_vms_row_task();

notify pgrst, 'reload schema';
