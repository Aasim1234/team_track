-- A comment on any result, not just Fail and Blocked.
--
-- vms_test_plan_rows.failure_comment now holds the comment for whatever result
-- the test case carries: a note on a passed test ("passed after the 12.83 fix"),
-- as well as the reason a test failed or is blocked. What does not change:
--
--   * Fail still requires a reason, and Blocked still asks for one
--   * a comment belongs to the result it was given for, so changing the result
--     without supplying a new comment still clears the old one — a stale
--     failure reason never sticks to a passed test case
--
-- The activity log records comments on any result, and comments now travel into
-- release reports and the Excel exports whatever the result is.

begin;

create or replace function vms_row_result_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  v_old_result text;
  v_old_comment text;
begin
  if tg_op = 'UPDATE' then
    v_old_result := old.result;
    v_old_comment := old.failure_comment;
    -- A comment belongs to the result it was given for; a new result needs its
    -- own, so a comment that was not re-supplied does not carry over.
    if new.result is distinct from old.result and new.failure_comment is not distinct from old.failure_comment then
      new.failure_comment := null;
    end if;
  end if;

  new.failure_comment := nullif(btrim(coalesce(new.failure_comment, '')), '');

  if new.result in ('fail', 'blocked') then
    if new.failure_comment is null then
      if tg_op = 'UPDATE' and new.result = 'blocked' and v_old_result = 'blocked'
         and new.failure_comment is not distinct from v_old_comment then
        null;  -- blocked before reasons were required; left as it was
      else
        raise exception using
          errcode = '23514',
          message = case when new.result = 'fail'
                         then 'A failure reason is required when marking a test case as Failed.'
                         else 'A block reason is required when marking a test case as Blocked.' end;
      end if;
    end if;
    -- Restamp only when the result or its reason is new, so editing the Topic
    -- of a failed/blocked row does not rewrite these fields.
    if tg_op = 'INSERT' or v_old_result is distinct from new.result
       or new.failure_comment is distinct from v_old_comment then
      new.failed_by := coalesce(actor, case when tg_op = 'UPDATE' then old.failed_by end);
      new.failed_at := now();
    end if;
  else
    -- Any other result may carry a comment; only the failure stamp is cleared.
    new.failed_by := null;
    new.failed_at := null;
  end if;

  return new;
end;
$$;

create or replace function audit_vms_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r vms_test_plan_rows;
  v_plan_name text;
  v_label text;
  v_assignee text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select name into v_plan_name from test_plans where id = r.plan_id;

  -- Rows removed because their whole plan was deleted are covered by the one
  -- "deleted test plan" entry, not one entry per row.
  if tg_op = 'DELETE' and v_plan_name is null then return old; end if;

  v_label := coalesce(nullif(btrim(r.scenario), ''), nullif(btrim(r.topic), ''), '(blank row)');

  if tg_op = 'INSERT' then
    perform audit_write(new.project_id, 'row_added', 'test_case', new.id, v_label, new.plan_id, v_plan_name,
                        null, null, null, new.failure_comment, new.result);
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.assigned_to is not null then
      select coalesce(nullif(name, ''), email) into v_assignee from profiles where id = old.assigned_to;
    end if;
    perform audit_write(old.project_id, 'row_deleted', 'test_case', old.id, v_label, old.plan_id, v_plan_name,
      'Test Case ID', 'TC-' || lpad(old.case_number::text, 4, '0'), null,
      concat_ws(' · ',
        'Result: ' || audit_result_label(coalesce(old.result, 'not_tested')),
        case when old.assigned_to is not null then 'was assigned to ' || coalesce(v_assignee, 'a removed user') end),
      old.result);
    return old;
  end if;

  if new.result is distinct from old.result then
    perform audit_write(new.project_id, 'result_changed', 'test_case', new.id, v_label, new.plan_id, v_plan_name,
      'Result', audit_result_label(old.result), audit_result_label(new.result),
      -- the comment given with the new result, or a note of the one it replaces
      coalesce(new.failure_comment,
        case when old.result = 'fail' and old.failure_comment is not null then 'Previous failure reason: ' || old.failure_comment
             when old.result = 'blocked' and old.failure_comment is not null then 'Previous block reason: ' || old.failure_comment
             when old.failure_comment is not null then 'Previous comment: ' || old.failure_comment
        end),
      new.result);
  elsif new.failure_comment is distinct from old.failure_comment then
    perform audit_write(new.project_id,
      case new.result when 'fail' then 'failure_comment_edited'
                      when 'blocked' then 'block_reason_edited'
                      else 'comment_edited' end,
      'test_case', new.id, v_label, new.plan_id, v_plan_name,
      case new.result when 'fail' then 'Failure reason' when 'blocked' then 'Block reason' else 'Comment' end,
      old.failure_comment, new.failure_comment, null, new.result);
  end if;

  if new.topic is distinct from old.topic then
    perform audit_write(new.project_id, 'row_edited', 'test_case', new.id, v_label, new.plan_id, v_plan_name,
      'Topic', old.topic, new.topic, null, new.result);
  end if;
  if new.scenario is distinct from old.scenario then
    perform audit_write(new.project_id, 'row_edited', 'test_case', new.id, v_label, new.plan_id, v_plan_name,
      'Scenario', old.scenario, new.scenario, null, new.result);
  end if;
  if new.test_steps is distinct from old.test_steps then
    perform audit_write(new.project_id, 'row_edited', 'test_case', new.id, v_label, new.plan_id, v_plan_name,
      'Test Steps', old.test_steps, new.test_steps, null, new.result);
  end if;
  if new.expected_result is distinct from old.expected_result then
    perform audit_write(new.project_id, 'row_edited', 'test_case', new.id, v_label, new.plan_id, v_plan_name,
      'Expected Result', old.expected_result, new.expected_result, null, new.result);
  end if;

  return new;
end;
$$;

-- Release reports keep the comment whatever the result was.
create or replace function save_release_report(p_plan_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tp test_plans;
  v_release text;
  v_id uuid;
  v_actor uuid := auth.uid();
  rr release_reports;
begin
  select * into tp from test_plans where id = p_plan_id;
  select name into v_release from release_versions where id = tp.release_version_id;

  delete from release_reports where plan_id = tp.id and release_version_id = tp.release_version_id;

  insert into release_reports (project_id, plan_id, release_version_id, release_name, plan_name, status,
                               discard_reason, decided_by, decided_by_name)
  values (tp.project_id, tp.id, tp.release_version_id, v_release, tp.name, tp.status,
          tp.discard_reason, v_actor, coalesce(person_label(v_actor), 'System'))
  returning id into v_id;

  insert into release_report_results (report_id, project_id, test_case_id, case_number, topic, scenario, test_steps,
                                      expected_result, result, reason, recorded_by_name, recorded_at, assigned_to_name, sort_order)
  select v_id, tp.project_id, r.id, r.case_number, r.topic, r.scenario, r.test_steps, r.expected_result,
         coalesce(r.result, 'not_tested'),
         r.failure_comment,
         case when r.result in ('fail', 'blocked') then person_label(r.failed_by) end,
         case when r.result in ('fail', 'blocked') then r.failed_at end,
         person_label(r.assigned_to), r.sort_order
    from vms_test_plan_rows r
   where r.plan_id = tp.id;

  update release_reports s
     set total_cases = c.total, passed = c.passed, failed = c.failed, blocked = c.blocked,
         retest = c.retest, not_tested = c.not_tested, na = c.na,
         pass_rate = case when c.total - c.not_tested > 0 then round(c.passed * 100.0 / (c.total - c.not_tested), 1) else 0 end
    from (
      select count(*) as total,
             count(*) filter (where result = 'pass') as passed,
             count(*) filter (where result = 'fail') as failed,
             count(*) filter (where result = 'blocked') as blocked,
             count(*) filter (where result = 'retest') as retest,
             count(*) filter (where result = 'not_tested') as not_tested,
             count(*) filter (where result = 'na') as na
        from release_report_results where report_id = v_id
    ) c
   where s.id = v_id
  returning s.* into rr;

  perform audit_write(tp.project_id, 'release_report_saved', 'test_plan', tp.id, tp.name, tp.id, tp.name,
    'Release Report', null, 'Release ' || v_release,
    format('%s · %s test case%s · %s passed, %s failed, %s blocked · %s%% pass rate',
           plan_status_label(tp.status), rr.total_cases, case when rr.total_cases = 1 then '' else 's' end,
           rr.passed, rr.failed, rr.blocked, rr.pass_rate),
    null);
  return v_id;
end;
$$;

-- An imported comment is kept whatever the result is.
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
           k.result, k.reason,
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

commit;

notify pgrst, 'reload schema';
