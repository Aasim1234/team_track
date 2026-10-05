-- A test plan's execution belongs to a release version.
--
-- Until now a test plan's rows carried one set of execution fields — result,
-- failure comment, assignment, task — and changing the plan's release version
-- only changed a label on the plan. Release 12.84 inherited everything people
-- had done for 12.83: the same results, the same assignments, the same To-Do
-- tasks. That is wrong: a new release is new testing.
--
-- What changes here:
--
--   vms_row_release_state   the execution context of a release the plan is not
--                           currently on — result, comment, assignment and task
--                           per test case. Nothing is thrown away.
--
--   change_plan_release()   the only way a plan's release version may change.
--                           It saves the current release's context, resets every
--                           test case to Not Tested with nobody assigned, and
--                           brings back the target release's own context if the
--                           plan has been on that release before.
--
--   plan_release_contexts() what is saved for this plan's other releases, so the
--                           app can say what will be kept and what will return.
--
-- The test cases themselves are never touched: same rows, same TC numbers, same
-- topics, scenarios, steps and expected results. Release reports are untouched
-- too — they are still written when a plan is marked Pass or Discard.

begin;

-- ---------------------------------------------------------------- the store --

create table if not exists vms_row_release_state (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references vms_test_plan_rows(id) on delete cascade,
  release_version_id uuid not null references release_versions(id) on delete cascade,
  plan_id uuid not null references test_plans(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  result text,
  failure_comment text,
  failed_by uuid references profiles(id) on delete set null,
  failed_at timestamptz,
  assigned_to uuid references profiles(id) on delete set null,
  assigned_at timestamptz,
  assigned_by uuid references profiles(id) on delete set null,
  task_status text,
  task_status_at timestamptz,
  task_status_by uuid references profiles(id) on delete set null,
  saved_at timestamptz not null default now(),
  saved_by uuid references profiles(id) on delete set null,
  unique (row_id, release_version_id)
);

create index if not exists idx_vms_row_release_state_plan on vms_row_release_state(plan_id, release_version_id);
create index if not exists idx_vms_row_release_state_release on vms_row_release_state(release_version_id);

alter table vms_row_release_state enable row level security;

-- Readable by anyone who may read the test cases; only change_plan_release()
-- writes it, so there is no insert, update or delete policy.
drop policy if exists vms_row_release_state_select on vms_row_release_state;
create policy vms_row_release_state_select on vms_row_release_state for select
  using (has_project_access(project_id) and (select has_permission('test_cases.view')));

revoke all on vms_row_release_state from public, anon;
grant select on vms_row_release_state to authenticated;
grant all on vms_row_release_state to service_role;

-- ------------------------------------------------------- the switch marker --

-- Set only inside change_plan_release(), and only for its transaction. While it
-- is on, the per-row guards and audit entries stand aside: the switch has been
-- authorised once, as a whole, and it writes one summary entry of its own
-- instead of a thousand.
create or replace function release_switch_active() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('app.release_switch', true), '') = '1'
$$;

revoke all on function release_switch_active() from public, anon;
grant execute on function release_switch_active() to authenticated, service_role;

-- The triggers keep their own definitions; they simply do not fire during a
-- release switch.
drop trigger if exists trg_audit_vms_row on vms_test_plan_rows;
create trigger trg_audit_vms_row after insert or delete or update on vms_test_plan_rows
  for each row when (not release_switch_active()) execute function audit_vms_row();

drop trigger if exists trg_audit_vms_row_assignment on vms_test_plan_rows;
create trigger trg_audit_vms_row_assignment after insert or update of assigned_to on vms_test_plan_rows
  for each row when (not release_switch_active()) execute function audit_vms_row_assignment();

drop trigger if exists trg_audit_vms_row_task on vms_test_plan_rows;
create trigger trg_audit_vms_row_task after update of task_status on vms_test_plan_rows
  for each row when (not release_switch_active()) execute function audit_vms_row_task();

drop trigger if exists trg_vms_row_access_guard on vms_test_plan_rows;
create trigger trg_vms_row_access_guard before insert or update on vms_test_plan_rows
  for each row when (not release_switch_active()) execute function vms_row_access_guard();

drop trigger if exists trg_vms_row_assignment_guard on vms_test_plan_rows;
create trigger trg_vms_row_assignment_guard before insert or update on vms_test_plan_rows
  for each row when (not release_switch_active()) execute function vms_row_assignment_guard();

drop trigger if exists trg_vms_row_result_audit on vms_test_plan_rows;
create trigger trg_vms_row_result_audit before insert or update on vms_test_plan_rows
  for each row when (not release_switch_active()) execute function vms_row_result_audit();

drop trigger if exists trg_vms_row_task_sync on vms_test_plan_rows;
create trigger trg_vms_row_task_sync before insert or update on vms_test_plan_rows
  for each row when (not release_switch_active()) execute function vms_row_task_sync();

-- A release version may only change through change_plan_release(), so no path —
-- the app, a script, or a direct SQL update — can carry one release's work into
-- another.
create or replace function test_plan_release_switch_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Change the release version with the Release Version dialog: a new release starts its own execution context.';
end;
$$;

drop trigger if exists trg_test_plan_release_switch_only on test_plans;
create trigger trg_test_plan_release_switch_only before update on test_plans
  for each row
  when (new.release_version_id is distinct from old.release_version_id and not release_switch_active())
  execute function test_plan_release_switch_only();

-- ------------------------------------------------------------- the switch ---

create or replace function change_plan_release(p_plan_id uuid, p_release_version_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  tp test_plans;
  v_from text;
  v_to text;
  v_release release_versions;
  v_cases integer;
  v_saved_results integer := 0;
  v_saved_assignments integer := 0;
  v_reset integer := 0;
  v_back_results integer := 0;
  v_back_assignments integer := 0;
  v_back boolean := false;
  v_note text;
begin
  if v_actor is null then
    raise exception 'Sign in to change a release version.';
  end if;

  select * into tp from test_plans where id = p_plan_id;
  if tp.id is null then
    raise exception 'That test plan no longer exists.';
  end if;
  if not has_project_access(tp.project_id) then
    raise exception 'You don''t have access to this project.';
  end if;
  if not has_permission('releases.manage') then
    raise exception 'You don''t have permission to change a test plan''s release version.';
  end if;
  if p_release_version_id is null then
    raise exception 'A test plan''s release version can be changed, but not removed.';
  end if;

  select * into v_release from release_versions where id = p_release_version_id;
  if v_release.id is null then
    raise exception 'That release version no longer exists.';
  end if;
  if v_release.project_id is distinct from tp.project_id then
    raise exception 'That release version belongs to a different project.';
  end if;

  select name into v_from from release_versions where id = tp.release_version_id;
  v_to := v_release.name;
  select count(*) into v_cases from vms_test_plan_rows where plan_id = tp.id;

  if tp.release_version_id is not distinct from p_release_version_id then
    return jsonb_build_object('changed', false, 'release', v_to, 'cases', v_cases);
  end if;

  perform set_config('app.release_switch', '1', true);

  -- 1. keep what this release has: results, reasons, assignments and tasks
  if tp.release_version_id is not null then
    insert into vms_row_release_state (
      row_id, release_version_id, plan_id, project_id, result, failure_comment, failed_by, failed_at,
      assigned_to, assigned_at, assigned_by, task_status, task_status_at, task_status_by, saved_at, saved_by)
    select r.id, tp.release_version_id, tp.id, tp.project_id, r.result, r.failure_comment, r.failed_by, r.failed_at,
           r.assigned_to, r.assigned_at, r.assigned_by, r.task_status, r.task_status_at, r.task_status_by, now(), v_actor
      from vms_test_plan_rows r
     where r.plan_id = tp.id
       and (coalesce(r.result, 'not_tested') <> 'not_tested' or r.assigned_to is not null
            or r.failure_comment is not null or r.task_status is not null)
    on conflict (row_id, release_version_id) do update
      set result = excluded.result, failure_comment = excluded.failure_comment,
          failed_by = excluded.failed_by, failed_at = excluded.failed_at,
          assigned_to = excluded.assigned_to, assigned_at = excluded.assigned_at, assigned_by = excluded.assigned_by,
          task_status = excluded.task_status, task_status_at = excluded.task_status_at,
          task_status_by = excluded.task_status_by, saved_at = excluded.saved_at, saved_by = excluded.saved_by;

    select count(*) filter (where coalesce(result, 'not_tested') <> 'not_tested'),
           count(*) filter (where assigned_to is not null)
      into v_saved_results, v_saved_assignments
      from vms_row_release_state
     where plan_id = tp.id and release_version_id = tp.release_version_id;
  end if;

  -- 2. the new release starts clean: every test case Not Tested, nobody assigned
  with cleared as (
    update vms_test_plan_rows
       set result = 'not_tested', failure_comment = null, failed_by = null, failed_at = null,
           assigned_to = null, assigned_at = null, assigned_by = null,
           task_status = null, task_status_at = null, task_status_by = null
     where plan_id = tp.id
       and (coalesce(result, 'not_tested') <> 'not_tested' or assigned_to is not null
            or failure_comment is not null or task_status is not null)
    returning 1)
  select count(*) into v_reset from cleared;

  -- 3. been on this release before? pick up exactly where that release left off
  if exists (select 1 from vms_row_release_state where plan_id = tp.id and release_version_id = p_release_version_id) then
    v_back := true;
    update vms_test_plan_rows r
       set result = coalesce(s.result, 'not_tested'),
           failure_comment = s.failure_comment,
           failed_by = s.failed_by,
           failed_at = s.failed_at,
           -- someone who has left the project cannot pick their work back up
           assigned_to = case when pm.user_id is not null then s.assigned_to end,
           assigned_at = case when pm.user_id is not null then s.assigned_at end,
           assigned_by = case when pm.user_id is not null then s.assigned_by end,
           task_status = case when pm.user_id is not null then s.task_status end,
           task_status_at = case when pm.user_id is not null then s.task_status_at end,
           task_status_by = case when pm.user_id is not null then s.task_status_by end
      from vms_row_release_state s
      left join project_members pm on pm.project_id = s.project_id and pm.user_id = s.assigned_to
     where s.row_id = r.id and s.release_version_id = p_release_version_id;

    select count(*) filter (where coalesce(result, 'not_tested') <> 'not_tested'),
           count(*) filter (where assigned_to is not null)
      into v_back_results, v_back_assignments
      from vms_test_plan_rows where plan_id = tp.id;

    -- the context is live again, so it is no longer a saved one
    delete from vms_row_release_state where plan_id = tp.id and release_version_id = p_release_version_id;
  end if;

  -- 4. the plan moves, and a finished plan starts the new release as Active
  update test_plans
     set release_version_id = p_release_version_id,
         status = case when status in ('pass', 'discard') then 'active' else status end,
         discard_reason = case when status in ('pass', 'discard') then null else discard_reason end
   where id = tp.id;

  v_note := concat_ws(' · ',
    format('%s test case%s start as Not Tested with nobody assigned',
           v_cases, case when v_cases = 1 then '' else 's' end),
    case when v_saved_results + v_saved_assignments > 0
         then format('%s result%s and %s assignment%s saved for release %s',
                     v_saved_results, case when v_saved_results = 1 then '' else 's' end,
                     v_saved_assignments, case when v_saved_assignments = 1 then '' else 's' end, v_from) end,
    case when v_back then format('release %s was tested before, so its %s result%s and %s assignment%s came back',
                     v_to, v_back_results, case when v_back_results = 1 then '' else 's' end,
                     v_back_assignments, case when v_back_assignments = 1 then '' else 's' end) end);

  perform audit_write(tp.project_id, 'release_context_reset', 'test_plan', tp.id, tp.name, tp.id, tp.name,
    'Execution', coalesce('Release ' || v_from, 'No release'), 'Release ' || v_to, v_note, null);

  perform set_config('app.release_switch', '', true);

  return jsonb_build_object(
    'changed', true, 'from', v_from, 'release', v_to, 'cases', v_cases,
    'savedResults', v_saved_results, 'savedAssignments', v_saved_assignments,
    'reset', v_reset, 'restored', v_back,
    'restoredResults', v_back_results, 'restoredAssignments', v_back_assignments);
end;
$$;

revoke all on function change_plan_release(uuid, uuid) from public, anon;
grant execute on function change_plan_release(uuid, uuid) to authenticated;

-- --------------------------------------------------- what is kept, per plan --

create or replace function plan_release_contexts(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tp test_plans;
begin
  select * into tp from test_plans where id = p_plan_id;
  if tp.id is null or not has_project_access(tp.project_id) or not (select has_permission('test_cases.view')) then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'releaseId', x.release_version_id, 'release', x.name, 'cases', x.cases,
      'executed', x.executed, 'assigned', x.assigned, 'openTasks', x.open_tasks, 'savedAt', x.saved_at)
      order by x.saved_at desc), '[]'::jsonb)
    from (
      select s.release_version_id, rv.name, count(*)::int as cases,
             count(*) filter (where coalesce(s.result, 'not_tested') <> 'not_tested')::int as executed,
             count(*) filter (where s.assigned_to is not null)::int as assigned,
             count(*) filter (where s.task_status = 'open')::int as open_tasks,
             max(s.saved_at) as saved_at
        from vms_row_release_state s
        join release_versions rv on rv.id = s.release_version_id
       where s.plan_id = p_plan_id
       group by s.release_version_id, rv.name
    ) x);
end;
$$;

revoke all on function plan_release_contexts(uuid) from public, anon;
grant execute on function plan_release_contexts(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
