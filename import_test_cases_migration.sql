-- Bulk import of test cases into one test plan.
--
-- The page uploads a sheet, checks it and shows a preview; this function is
-- what actually writes the test cases, so an import is all-or-nothing and obeys
-- the same rules as adding a row by hand:
--
--   * Add Test Cases permission, and access to the plan's project
--   * Scenario, Test Steps and Expected Result must have something in them
--   * RESULT must be one of the app's results; a Fail needs a reason
--   * recording a result at all needs Execute Any Test Case, exactly as the
--     row guard requires when someone types a result in the grid
--
-- Imported rows are ordinary test cases: they get their own TC number, appear
-- in the plan, in counts, exports and reports, and can be assigned, executed,
-- edited and deleted like any other.
--
-- Duplicates (same Topic + Scenario already in this plan, compared without
-- case or padding) are either skipped or imported, whichever the user chose.

begin;

create or replace function import_test_cases(p_plan_id uuid, p_rows jsonb, p_skip_duplicates boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_plan test_plans;
  v_total integer;
  v_bad record;
  v_results integer;
  v_next integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_first bigint;
  v_last bigint;
  v_topics integer;
begin
  if v_actor is null then
    raise exception 'Sign in to import test cases.';
  end if;
  select * into v_plan from test_plans where id = p_plan_id;
  if v_plan.id is null or not has_project_access(v_plan.project_id) then
    raise exception 'That test plan doesn''t exist or you don''t have access to it.';
  end if;
  if not has_permission('test_cases.create') then
    raise exception 'You don''t have permission to add test cases.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'There are no test cases to import.';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then
    raise exception 'There are no test cases to import.';
  end if;
  if v_total > 5000 then
    raise exception 'Import up to 5000 test cases at a time; this file has %.', v_total;
  end if;

  -- The rows as the caller sent them, numbered so messages can name the row.
  -- The page validates first; these are the same checks at the source, so a
  -- crafted request can't write half a sheet of empty test cases.
  select * into v_bad from (
    select ord::integer as pos,
           btrim(coalesce(r->>'scenario', '')) as scenario,
           btrim(coalesce(r->>'test_steps', '')) as test_steps,
           btrim(coalesce(r->>'expected_result', '')) as expected_result,
           coalesce(nullif(btrim(coalesce(r->>'result', '')), ''), 'not_tested') as result,
           nullif(btrim(coalesce(r->>'reason', '')), '') as reason
      from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
  ) x
   where x.scenario = '' or x.test_steps = '' or x.expected_result = ''
      or x.result not in ('not_tested', 'pass', 'fail', 'blocked', 'retest', 'na')
      or (x.result = 'fail' and x.reason is null)
   order by x.pos limit 1;
  if v_bad.pos is not null then
    raise exception 'Row % of the file can''t be imported: %', v_bad.pos,
      case when v_bad.scenario = '' then 'Scenario is empty'
           when v_bad.test_steps = '' then 'Test Steps are empty'
           when v_bad.expected_result = '' then 'Expected Result is empty'
           when v_bad.result = 'fail' and v_bad.reason is null then 'a failed test case needs a reason'
           else format('%s is not a valid RESULT', v_bad.result) end;
  end if;

  select count(*) into v_results
    from jsonb_array_elements(p_rows) r
   where coalesce(nullif(btrim(coalesce(r->>'result', '')), ''), 'not_tested') <> 'not_tested';
  if v_results > 0 and not has_permission('test_cases.execute_any') then
    raise exception 'You can import test cases, but not their results. Set RESULT to Untested for all % rows, or ask an Admin to import them.', v_results;
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_next from vms_test_plan_rows where plan_id = p_plan_id;

  with incoming as (
    select ord::integer as pos,
           btrim(coalesce(r->>'topic', '')) as topic,
           btrim(coalesce(r->>'scenario', '')) as scenario,
           btrim(coalesce(r->>'test_steps', '')) as test_steps,
           btrim(coalesce(r->>'expected_result', '')) as expected_result,
           coalesce(nullif(btrim(coalesce(r->>'result', '')), ''), 'not_tested') as result,
           nullif(btrim(coalesce(r->>'reason', '')), '') as reason
      from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
  ), marked as (
    select i.*, exists (
             select 1 from vms_test_plan_rows v
              where v.plan_id = p_plan_id
                and lower(btrim(coalesce(v.topic, ''))) = lower(i.topic)
                and lower(btrim(coalesce(v.scenario, ''))) = lower(i.scenario)) as duplicate
      from incoming i
  ), kept as (
    select *, row_number() over (order by pos) as seq from marked
     where not p_skip_duplicates or not duplicate
  ), added as (
    insert into vms_test_plan_rows (plan_id, project_id, topic, scenario, test_steps, expected_result,
                                    result, failure_comment, sort_order)
    select p_plan_id, v_plan.project_id, k.topic, k.scenario, k.test_steps, k.expected_result,
           k.result,
           case when k.result in ('fail', 'blocked') then k.reason end,
           v_next + (k.seq - 1)::integer
      from kept k
    returning case_number, topic
  )
  select count(*)::integer, min(case_number), max(case_number), count(distinct topic)::integer
    into v_imported, v_first, v_last, v_topics
    from added;

  select count(*)::integer into v_skipped
    from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
   where p_skip_duplicates
     and exists (
       select 1 from vms_test_plan_rows v
        where v.plan_id = p_plan_id
          and lower(btrim(coalesce(v.topic, ''))) = lower(btrim(coalesce(r->>'topic', '')))
          and lower(btrim(coalesce(v.scenario, ''))) = lower(btrim(coalesce(r->>'scenario', '')))
          and v.sort_order < v_next);

  if v_imported > 0 then
    perform audit_write(v_plan.project_id, 'cases_imported', 'test_plan', v_plan.id, v_plan.name,
      v_plan.id, v_plan.name, 'Test Cases', null,
      format('%s imported', v_imported),
      format('TC-%s to TC-%s · %s topic%s%s',
             lpad(v_first::text, 4, '0'), lpad(v_last::text, 4, '0'),
             v_topics, case when v_topics = 1 then '' else 's' end,
             case when v_skipped > 0 then format(' · %s duplicate%s skipped', v_skipped, case when v_skipped = 1 then '' else 's' end) else '' end),
      null);
  end if;

  return jsonb_build_object(
    'imported', v_imported,
    'skipped', v_skipped,
    'total', v_total,
    'plan', v_plan.name,
    'firstCase', v_first,
    'lastCase', v_last);
end;
$$;

revoke all on function import_test_cases(uuid, jsonb, boolean) from public, anon;
grant execute on function import_test_cases(uuid, jsonb, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';
