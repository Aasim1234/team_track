-- The Dashboard, from the data the app actually holds.
--
-- It used to read the legacy tables — test_cases, test_runs, test_results,
-- issues, sprints — which is why it showed 768 test cases, 0 active runs and an
-- empty execution trend while the real work (VMS test plans, their test cases
-- and To-Do tasks) had moved on.
--
-- dashboard_summary() answers with everything the page needs, for the projects
-- the caller can see:
--
--   totals      projects, test plans, test cases, and the result mix
--   coverage    test cases by result (the donut)
--   trend       results recorded per day for the last 14 days (activity log)
--   plans       each test plan with its release version, status and progress
--   projects    per project: test cases, plans and how far execution has got
--   myTasks     the caller's open To-Do tasks
--   due         test plans with a target date, soonest first
--
-- Pass rate is the app-wide rule: passed ÷ executed, where executed is every
-- result except Untested.

begin;

create or replace function dashboard_summary(p_timezone text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_day_start timestamptz;
begin
  if v_actor is null then
    raise exception 'Sign in to see the dashboard.';
  end if;

  begin
    v_day_start := date_trunc('day', now() at time zone p_timezone) at time zone p_timezone;
  exception when others then
    v_day_start := date_trunc('day', now());
  end;

  return (
    with projects_seen as (
      select p.* from projects p
       where has_project_access(p.id) and (select has_permission('projects.view'))
    ),
    plans as (
      select tp.*, rv.name as release_name
        from test_plans tp
        left join release_versions rv on rv.id = tp.release_version_id
       where tp.project_id in (select id from projects_seen)
    ),
    cases as (
      select v.id, v.plan_id, v.project_id, v.assigned_to, v.task_status, v.case_number,
             v.topic, v.scenario, coalesce(v.result, 'not_tested') as result
        from vms_test_plan_rows v
       where v.project_id in (select id from projects_seen)
    ),
    mix as (
      select count(*)::int as total,
             count(*) filter (where result = 'pass')::int as pass,
             count(*) filter (where result = 'fail')::int as fail,
             count(*) filter (where result = 'blocked')::int as blocked,
             count(*) filter (where result = 'retest')::int as retest,
             count(*) filter (where result = 'na')::int as na,
             count(*) filter (where result = 'not_tested')::int as not_tested
        from cases
    )
    select jsonb_build_object(
      'generatedAt', now(),
      'totals', (
        select jsonb_build_object(
          'projects', (select count(*) from projects_seen),
          'testCases', m.total,
          'testPlans', (select count(*) from plans),
          'plansUnderTesting', (select count(*) from plans where status = 'under_testing'),
          'executed', m.total - m.not_tested,
          'passRate', case when m.total - m.not_tested > 0
                           then round(m.pass * 100.0 / (m.total - m.not_tested), 1) else 0 end,
          'progress', case when m.total > 0 then round((m.total - m.not_tested) * 100.0 / m.total, 1) else 0 end,
          'assignedToMe', (select count(*) from cases where assigned_to = v_actor and coalesce(task_status, 'open') = 'open'),
          'resultsToday', (select count(*) from audit_log a
                            where a.action = 'result_changed' and a.occurred_at >= v_day_start
                              and a.project_id in (select id from projects_seen)))
        from mix m),
      'coverage', (select jsonb_build_object('pass', pass, 'fail', fail, 'blocked', blocked,
                                             'retest', retest, 'na', na, 'not_tested', not_tested) from mix),
      -- results recorded per day, oldest first
      'trend', (
        select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'value', d.n) order by d.day), '[]'::jsonb)
        from (
          select (v_day_start - make_interval(days => offs))::date as day,
                 (select count(*)::int from audit_log a
                   where a.action = 'result_changed'
                     and a.project_id in (select id from projects_seen)
                     and a.occurred_at >= v_day_start - make_interval(days => offs)
                     and a.occurred_at < v_day_start - make_interval(days => offs - 1)) as n
            from generate_series(13, 0, -1) as offs
        ) d),
      'plans', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pl.id, 'name', pl.name, 'projectId', pl.project_id,
          'projectName', (select name from projects_seen ps where ps.id = pl.project_id),
          'release', pl.release_name, 'status', pl.status,
          'total', c.total, 'executed', c.total - c.not_tested, 'passed', c.pass,
          'progress', case when c.total > 0 then round((c.total - c.not_tested) * 100.0 / c.total)::int else 0 end)
          order by pl.name), '[]'::jsonb)
        from plans pl
        cross join lateral (
          select count(*)::int as total,
                 count(*) filter (where result = 'not_tested')::int as not_tested,
                 count(*) filter (where result = 'pass')::int as pass
            from cases c where c.plan_id = pl.id) c),
      'projects', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', ps.id, 'name', ps.name, 'key', ps.key, 'description', ps.description,
          'testCases', c.total, 'executed', c.total - c.not_tested, 'passed', c.pass,
          'plans', (select count(*) from plans pl where pl.project_id = ps.id),
          'progress', case when c.total > 0 then round((c.total - c.not_tested) * 100.0 / c.total)::int else 0 end)
          order by ps.created_at desc), '[]'::jsonb)
        from projects_seen ps
        cross join lateral (
          select count(*)::int as total,
                 count(*) filter (where result = 'not_tested')::int as not_tested,
                 count(*) filter (where result = 'pass')::int as pass
            from cases c where c.project_id = ps.id) c),
      'myTasks', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id, 'caseNumber', t.case_number, 'scenario', t.scenario, 'topic', t.topic,
          'result', t.result, 'planId', t.plan_id, 'projectId', t.project_id,
          'planName', (select name from plans pl where pl.id = t.plan_id))
          order by t.case_number), '[]'::jsonb)
        from (select * from cases where assigned_to = v_actor and coalesce(task_status, 'open') = 'open'
               order by case_number limit 6) t),
      'due', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pl.id, 'name', pl.name, 'projectId', pl.project_id, 'targetDate', pl.target_date,
          'release', pl.release_name, 'status', pl.status)
          order by pl.target_date), '[]'::jsonb)
        from (select * from plans where target_date is not null and status in ('active', 'under_testing')
               order by target_date limit 6) pl)));
end;
$$;

revoke all on function dashboard_summary(text) from public, anon;
grant execute on function dashboard_summary(text) to authenticated;

commit;

notify pgrst, 'reload schema';
