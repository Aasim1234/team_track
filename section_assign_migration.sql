-- Assign an entire section of test cases.
--
-- In VMS Test Plans a section is a Topic within a test plan: every test case
-- in that plan filed under the same Topic (matched without regard to case or
-- surrounding spaces), wherever in the plan it appears. Test cases in other
-- plans, or under other Topics - even similar ones such as "Recording" vs
-- "Recording Server Status" - are never included. VMS topics have no
-- sub-topics, so a section is complete on its own.
--
-- Bulk assignment and section assignment now share one routine, so both follow
-- exactly the same rules: Assign Test Case permission, project access, the
-- assignee must be a project member, already-assigned test cases are only
-- changed when explicitly asked, everything happens in one transaction, each
-- test case opens its own To-Do task and gets its own activity log entry, and
-- one summary entry records the whole operation.

begin;

create or replace function assign_test_cases_internal(
  p_ids uuid[], p_assignee uuid, p_include_assigned boolean, p_kind text, p_section text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
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
  v_cases text;
  v_case_ids text;
  v_previous text;
  v_comment text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to assign test cases.';
  end if;
  if not has_permission('test_cases.assign') then
    raise exception 'You don''t have permission to assign test cases.';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_ids) as x where x is not null;
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
    v_cases := v_count || ' test case' || case when v_count = 1 then '' else 's' end;
    select string_agg('TC-' || lpad(case_number::text, 4, '0'), ', ' order by case_number) into v_case_ids
    from vms_test_plan_rows where id = any(v_target);

    -- Marks each test case's own log entry as part of this operation.
    perform set_config('app.assignment_context',
      case when p_kind = 'section'
           then format('Section assignment: %s (%s)', p_section, v_cases)
           else format('Bulk assignment of %s', v_cases) end, true);

    update vms_test_plan_rows set assigned_to = p_assignee where id = any(v_target);

    perform set_config('app.assignment_context', '', true);

    if v_plans = 1 then
      select name into v_plan_name from test_plans where id = v_plan;
    else
      v_plan := null;
    end if;

    v_comment := case when p_kind = 'section' then v_cases || ': ' else '' end || left(v_case_ids, 1800);
    if v_skipped > 0 then
      v_comment := v_comment || format(' · %s already assigned to someone else left unchanged', v_skipped);
    end if;

    perform audit_write(v_project,
      case when p_kind = 'section' then 'section_assigned' else 'bulk_assigned' end,
      'test_case', null,
      case when p_kind = 'section' then p_section else v_cases end,
      v_plan, v_plan_name, 'Assigned to', v_previous, v_assignee_name, v_comment, null);
  end if;

  return jsonb_build_object(
    'total', v_requested, 'assigned', v_new, 'reassigned', v_reassigned, 'unchanged', v_unchanged,
    'skipped', v_skipped, 'assignee', v_assignee_name, 'section', p_section);
end;
$$;

-- Only the two functions below may use it.
revoke all on function assign_test_cases_internal(uuid[], uuid, boolean, text, text) from public, anon, authenticated;

-- Multi-select assignment: same behaviour as before, now via the shared routine.
create or replace function bulk_assign_test_cases(
  p_row_ids uuid[], p_assignee uuid, p_include_assigned boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return assign_test_cases_internal(p_row_ids, p_assignee, p_include_assigned, 'bulk', null);
end;
$$;

create or replace function assign_test_section(
  p_plan_id uuid, p_section text, p_assignee uuid, p_include_assigned boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_ids uuid[];
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to assign test cases.';
  end if;
  if not has_permission('test_cases.assign') then
    raise exception 'You don''t have permission to assign test cases.';
  end if;

  select project_id into v_project from test_plans where id = p_plan_id;
  if v_project is null or not has_project_access(v_project) then
    raise exception 'That test plan isn''t available to you.';
  end if;
  if coalesce(btrim(p_section), '') = '' then
    raise exception 'Choose a section to assign.';
  end if;

  select array_agg(id order by case_number), (array_agg(btrim(topic) order by case_number))[1]
    into v_ids, v_name
  from vms_test_plan_rows
  where plan_id = p_plan_id and lower(btrim(topic)) = lower(btrim(p_section));

  if v_ids is null then
    raise exception 'The section "%" has no test cases in this test plan.', btrim(p_section);
  end if;

  return assign_test_cases_internal(v_ids, p_assignee, p_include_assigned, 'section', v_name);
end;
$$;

revoke all on function bulk_assign_test_cases(uuid[], uuid, boolean) from public, anon;
grant execute on function bulk_assign_test_cases(uuid[], uuid, boolean) to authenticated;
revoke all on function assign_test_section(uuid, text, uuid, boolean) from public, anon;
grant execute on function assign_test_section(uuid, text, uuid, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';
