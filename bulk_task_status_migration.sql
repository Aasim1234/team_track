-- Bulk complete / close / reopen for To-Do tasks.
--
-- The To-Do page can now select several tasks and update them in one action.
-- The rules are exactly the ones a single task already follows (vms_row_task_sync):
--
--   * you may update your own tasks; updating someone else's needs Assign Test Cases
--   * a task can only be completed once its test case has a result
--   * completing, closing or reopening needs an execute permission
--
-- Rather than failing the whole selection when one task doesn't qualify, this
-- skips those tasks and reports the counts, so the page can say exactly what
-- happened. Each test case still gets its own activity log entry (the task
-- trigger writes it), plus one summary entry for the bulk action.

begin;

create or replace function bulk_set_task_status(p_row_ids uuid[], p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_can_assign boolean;
  v_requested integer := coalesce(array_length(p_row_ids, 1), 0);
  v_target uuid[];
  v_updated integer := 0;
  v_not_allowed integer := 0;
  v_untested integer := 0;
  v_unchanged integer := 0;
  v_project uuid;
  v_plan uuid;
  v_plan_name text;
  v_plans integer;
  v_case_ids text;
  v_comment text;
begin
  if v_actor is null then
    raise exception 'Sign in to update tasks.';
  end if;
  if p_status not in ('completed', 'closed', 'open') then
    raise exception 'A task can be completed, closed or reopened.';
  end if;
  if not (has_permission('test_cases.execute') or has_permission('test_cases.execute_any')
          or has_permission('test_cases.assign')) then
    raise exception 'You don''t have permission to complete or close tasks.';
  end if;
  if v_requested = 0 then
    raise exception 'Select at least one task.';
  end if;

  v_can_assign := has_permission('test_cases.assign');

  select
    coalesce(array_agg(x.id) filter (where x.eligible), '{}'),
    count(*) filter (where not x.allowed)::int,
    count(*) filter (where x.allowed and x.no_result)::int,
    count(*) filter (where x.allowed and not x.no_result and x.task_status is not distinct from p_status)::int
  into v_target, v_not_allowed, v_untested, v_unchanged
  from (
    select v.id, v.task_status,
           (v.assigned_to = v_actor or v_can_assign) as allowed,
           (p_status = 'completed' and coalesce(v.result, 'not_tested') = 'not_tested') as no_result,
           (v.assigned_to = v_actor or v_can_assign)
             and not (p_status = 'completed' and coalesce(v.result, 'not_tested') = 'not_tested')
             and v.task_status is distinct from p_status as eligible
      from vms_test_plan_rows v
     where v.id = any (p_row_ids)
       and v.assigned_to is not null
       and has_project_access(v.project_id)
  ) x;

  v_updated := coalesce(array_length(v_target, 1), 0);

  if v_updated > 0 then
    select count(distinct plan_id) into v_plans from vms_test_plan_rows where id = any (v_target);
    select plan_id, project_id into v_plan, v_project
      from vms_test_plan_rows where id = any (v_target) order by case_number limit 1;
    select string_agg('TC-' || lpad(case_number::text, 4, '0'), ', ' order by case_number)
      into v_case_ids from vms_test_plan_rows where id = any (v_target);

    update vms_test_plan_rows set task_status = p_status where id = any (v_target);

    if v_plans = 1 then
      select name into v_plan_name from test_plans where id = v_plan;
    else
      v_plan := null;
    end if;

    v_comment := left(v_case_ids, 1800);
    if v_untested > 0 then
      v_comment := v_comment || format(' · %s left open: no result recorded yet', v_untested);
    end if;
    if v_not_allowed > 0 then
      v_comment := v_comment || format(' · %s belong to someone else and were left unchanged', v_not_allowed);
    end if;

    perform audit_write(v_project,
      case p_status when 'completed' then 'bulk_task_completed'
                    when 'closed' then 'bulk_task_closed'
                    else 'bulk_task_reopened' end,
      'test_case', null,
      format('%s task%s', v_updated, case when v_updated = 1 then '' else 's' end),
      v_plan, v_plan_name, 'Task', null, initcap(p_status), v_comment, null);
  end if;

  return jsonb_build_object(
    'requested', v_requested,
    'updated', v_updated,
    'skippedNoResult', v_untested,
    'skippedNotYours', v_not_allowed,
    'unchanged', v_unchanged,
    'status', p_status);
end;
$$;

revoke all on function bulk_set_task_status(uuid[], text) from public, anon;
grant execute on function bulk_set_task_status(uuid[], text) to authenticated;

commit;

notify pgrst, 'reload schema';
