-- Bulk assignment of test cases.
--
-- bulk_assign_test_cases(row ids, assignee, include already-assigned?) assigns
-- every selected test case in one transaction: either all of them change or
-- none do. The same rules as single assignment apply, because the ordinary
-- row triggers still run for every test case:
--   * the caller needs Assign Test Case (checked here and by vms_row_access_guard);
--   * the assignee must be a member of the test case's project;
--   * each assigned test case opens its own To-Do task for the assignee;
--   * each change gets its own activity log entry with the previous assignee.
-- Test cases already assigned to someone else are left alone unless the caller
-- explicitly asks to reassign them. One extra log entry summarises the whole
-- bulk assignment (who, how many, which IDs, to whom, previous assignees).

begin;

create or replace function bulk_assign_test_cases(
  p_row_ids uuid[], p_assignee uuid, p_include_assigned boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_ids uuid[];
  v_requested integer;
  v_found integer;
  v_plans integer;
  v_project uuid;
  v_plan uuid;
  v_plan_name text;
  v_assignee_name text;
  v_new integer;
  v_unchanged integer;
  v_taken integer;
  v_reassigned integer := 0;
  v_skipped integer := 0;
  v_target uuid[];
  v_count integer;
  v_case_ids text;
  v_previous text;
  v_comment text;
begin
  if v_actor is null then
    raise exception 'Sign in to assign test cases.';
  end if;
  if not has_permission('test_cases.assign') then
    raise exception 'You don''t have permission to assign test cases.';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_row_ids) as x where x is not null;
  v_requested := coalesce(array_length(v_ids, 1), 0);
  if v_requested = 0 then
    raise exception 'Select at least one test case to assign.';
  end if;
  if p_assignee is null then
    raise exception 'Choose who to assign the test cases to.';
  end if;

  -- Runs as the database owner, so project access is checked explicitly.
  select count(*), count(distinct plan_id), (array_agg(project_id))[1], (array_agg(plan_id))[1]
    into v_found, v_plans, v_project, v_plan
  from vms_test_plan_rows r
  where r.id = any(v_ids) and has_project_access(r.project_id);
  if v_found <> v_requested then
    raise exception 'Some of the selected test cases no longer exist or aren''t available to you. Refresh and try again.';
  end if;

  select coalesce(nullif(name, ''), email) into v_assignee_name from profiles where id = p_assignee;
  if v_assignee_name is null then
    raise exception 'That person no longer exists.';
  end if;

  select count(*) filter (where assigned_to is null),
         count(*) filter (where assigned_to = p_assignee),
         count(*) filter (where assigned_to is not null and assigned_to <> p_assignee)
    into v_new, v_unchanged, v_taken
  from vms_test_plan_rows where id = any(v_ids);

  if p_include_assigned then
    v_reassigned := v_taken;
    if v_taken > 0 then
      select string_agg(n || case when c > 1 then ' ×' || c else '' end, ', ' order by n) into v_previous
      from (
        select coalesce(nullif(p.name, ''), p.email, 'Removed user') as n, count(*) as c
        from vms_test_plan_rows r left join profiles p on p.id = r.assigned_to
        where r.id = any(v_ids) and r.assigned_to is not null and r.assigned_to <> p_assignee
        group by 1
      ) s;
    end if;
  else
    v_skipped := v_taken;
  end if;

  select array_agg(id order by case_number) into v_target
  from vms_test_plan_rows
  where id = any(v_ids)
    and assigned_to is distinct from p_assignee
    and (p_include_assigned or assigned_to is null);
  v_count := coalesce(array_length(v_target, 1), 0);

  if v_count > 0 then
    select string_agg('TC-' || lpad(case_number::text, 4, '0'), ', ' order by case_number) into v_case_ids
    from vms_test_plan_rows where id = any(v_target);

    -- Marks each test case's own log entry as part of this bulk assignment.
    perform set_config('app.assignment_context',
      format('Bulk assignment of %s test case%s', v_count, case when v_count = 1 then '' else 's' end), true);

    update vms_test_plan_rows set assigned_to = p_assignee where id = any(v_target);

    perform set_config('app.assignment_context', '', true);

    if v_plans = 1 then
      select name into v_plan_name from test_plans where id = v_plan;
    else
      v_plan := null;
    end if;

    v_comment := left(v_case_ids, 1800);
    if v_skipped > 0 then
      v_comment := v_comment || format(' · %s already assigned to someone else left unchanged', v_skipped);
    end if;

    perform audit_write(v_project, 'bulk_assigned', 'test_case', null,
      format('%s test case%s', v_count, case when v_count = 1 then '' else 's' end),
      v_plan, v_plan_name, 'Assigned to', v_previous, v_assignee_name, v_comment, null);
  end if;

  return jsonb_build_object(
    'assigned', v_new, 'reassigned', v_reassigned, 'unchanged', v_unchanged,
    'skipped', v_skipped, 'assignee', v_assignee_name);
end;
$$;

revoke all on function bulk_assign_test_cases(uuid[], uuid, boolean) from public, anon;
grant execute on function bulk_assign_test_cases(uuid[], uuid, boolean) to authenticated;

-- Per-test-case assignment log entries now say when they came from a bulk assignment.
create or replace function audit_vms_row_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old uuid;
  v_old_name text;
  v_new_name text;
  v_plan_name text;
  v_label text;
  v_action text;
  v_comment text;
  v_context text;
begin
  if tg_op = 'UPDATE' then v_old := old.assigned_to; end if;
  if v_old is not distinct from new.assigned_to then return new; end if;

  if v_old is not null then
    select coalesce(nullif(name, ''), email) into v_old_name from profiles where id = v_old;
    v_old_name := coalesce(v_old_name, 'Removed user');
  end if;
  if new.assigned_to is not null then
    select coalesce(nullif(name, ''), email) into v_new_name from profiles where id = new.assigned_to;
  end if;
  select name into v_plan_name from test_plans where id = new.plan_id;
  v_label := coalesce(nullif(btrim(new.scenario), ''), nullif(btrim(new.topic), ''), '(blank row)');

  if v_old is null then
    v_action := 'assigned';
  elsif new.assigned_to is null then
    v_action := 'unassigned';
  else
    v_action := 'reassigned';
  end if;

  -- An override is any change to someone else's existing assignment.
  if v_actor is null then
    v_comment := 'Changed outside the app';
  elsif v_old is not null and v_old <> v_actor then
    v_comment := 'Admin/Manager override (was assigned to ' || v_old_name || ')';
  elsif v_old is null and new.assigned_to <> v_actor then
    v_comment := 'Assigned by an Admin/Manager';
  end if;

  v_context := nullif(current_setting('app.assignment_context', true), '');
  if v_context is not null then
    v_comment := coalesce(v_comment || ' · ', '') || v_context;
  end if;

  perform audit_write(new.project_id, v_action, 'test_case', new.id, v_label, new.plan_id, v_plan_name,
                      'Assigned to', v_old_name, v_new_name, v_comment, new.result);
  return new;
end;
$$;

commit;
