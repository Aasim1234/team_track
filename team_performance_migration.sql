-- Team Performance, computed from the data the app actually stores.
--
-- The page used to read the legacy issues / sprints / activity_log tables
-- (all empty) and the imported test_results rows, so every figure came out as
-- 0. Real work now lives in:
--
--   vms_test_plan_rows   assigned test cases and their To-Do task status
--                        (assigned_to / assigned_at, task_status / _at / _by, result)
--   audit_log            what each person actually did and when
--                        (result_changed, assigned, task_completed, ...)
--   test_plans           target_date, which is what makes a task overdue
--   project_members      which projects someone works on
--   profiles / roles     the people and their app role
--
-- team_performance() returns the summary tiles and one row per person;
-- member_performance() adds that person's timeline, daily execution counts and
-- project split. Both are computed in SQL so the page shows the same numbers to
-- everyone allowed to see it (reading audit_log directly needs the Activity Log
-- permission, which not every user with "View Users" has).
--
-- "Today" is the caller's day: the page passes its own time zone.
--
-- Definitions (no estimates, no placeholders):
--   Assigned        test cases assigned to the person
--   Completed       assigned test cases whose To-Do task is completed
--   Remaining       assigned test cases still open
--   In Progress     open tasks the assignee has recorded a result on since it
--                   was assigned to them
--   Pending         open tasks they haven't recorded anything on yet
--   Overdue         open tasks in a test plan whose target date has passed
--   Tests Executed  results this person recorded (audit log result changes)
--   Bugs Reported   results they recorded as Fail or Blocked
--   Bugs Fixed      results they moved from Fail/Blocked to Pass
--   Productivity    completed ÷ assigned
--   Avg Time to Close  assigned_at → task completed/closed, in days
--   Pass Rate       Pass results ÷ results they recorded
--   Performance     average of task completion and pass rate (the parts that exist)

begin;

create or replace function team_performance(p_timezone text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_day_start timestamptz;
  v_today date;
begin
  if not has_permission('users.view') then
    raise exception 'You don''t have permission to view team performance.';
  end if;

  begin
    v_day_start := date_trunc('day', now() at time zone p_timezone) at time zone p_timezone;
    v_today := (now() at time zone p_timezone)::date;
  exception when others then      -- unknown time zone name: fall back to the server's day
    v_day_start := date_trunc('day', now());
    v_today := current_date;
  end;

  return (
    with tasks as (
      -- "started" means the assignee recorded a result after the test case was
      -- assigned to them. The result column alone won't do: most rows arrived
      -- from the source sheet already carrying a result.
      select v.id, v.assigned_to, v.assigned_at, v.task_status, v.task_status_at, v.project_id,
             coalesce(v.result, 'not_tested') as result, tp.target_date,
             exists (
               select 1 from audit_log a
                where a.entity_type = 'test_case' and a.entity_id = v.id
                  and a.action in ('result_changed', 'failure_comment_edited', 'block_reason_edited')
                  and (v.assigned_at is null or a.occurred_at >= v.assigned_at)) as started
        from vms_test_plan_rows v
        left join test_plans tp on tp.id = v.plan_id
       where v.assigned_to is not null
    ),
    events as (
      select a.actor_id, a.action, a.occurred_at, a.old_value, a.result
        from audit_log a
       where a.actor_id is not null
    ),
    per_task as (
      select t.assigned_to as member_id,
             count(*)::int as assigned,
             count(*) filter (where t.task_status = 'completed')::int as completed,
             count(*) filter (where t.task_status = 'closed')::int as closed,
             count(*) filter (where coalesce(t.task_status, 'open') = 'open')::int as remaining,
             count(*) filter (where coalesce(t.task_status, 'open') = 'open' and t.started)::int as in_progress,
             count(*) filter (where coalesce(t.task_status, 'open') = 'open' and not t.started)::int as pending,
             count(*) filter (where coalesce(t.task_status, 'open') = 'open' and t.target_date is not null and t.target_date < v_today)::int as overdue,
             count(*) filter (where t.task_status = 'completed' and t.task_status_at >= v_day_start)::int as completed_today
        from tasks t
       group by t.assigned_to
    ),
    per_event as (
      select e.actor_id as member_id,
             count(*) filter (where e.action = 'result_changed')::int as executions,
             count(*) filter (where e.action = 'result_changed' and e.occurred_at >= v_day_start)::int as executions_today,
             count(*) filter (where e.action = 'result_changed' and e.result = 'pass')::int as passed,
             count(*) filter (where e.action = 'result_changed' and e.result = 'pass' and e.occurred_at >= v_day_start)::int as passed_today,
             count(*) filter (where e.action = 'result_changed' and e.result = 'fail' and e.occurred_at >= v_day_start)::int as failed_today,
             count(*) filter (where e.action = 'result_changed' and e.result = 'blocked' and e.occurred_at >= v_day_start)::int as blocked_today,
             count(*) filter (where e.action = 'result_changed' and e.result in ('fail', 'blocked'))::int as bugs_reported,
             count(*) filter (where e.action = 'result_changed' and e.result in ('fail', 'blocked') and e.occurred_at >= v_day_start)::int as bugs_reported_today,
             count(*) filter (where e.action = 'result_changed' and e.result = 'pass' and e.old_value in ('Fail', 'Blocked'))::int as bugs_fixed,
             count(*) filter (where e.action = 'result_changed' and e.result = 'pass' and e.old_value in ('Fail', 'Blocked') and e.occurred_at >= v_day_start)::int as bugs_fixed_today,
             count(*) filter (where e.occurred_at >= v_day_start)::int as actions_today,
             max(e.occurred_at) as last_activity
        from events e
       group by e.actor_id
    ),
    per_project as (
      select pm.user_id as member_id,
             count(distinct pm.project_id)::int as project_count,
             jsonb_agg(jsonb_build_object('projectId', pm.project_id, 'key', pj.key, 'name', pj.name) order by pj.name) as badges
        from project_members pm
        join projects pj on pj.id = pm.project_id
       group by pm.user_id
    ),
    people as (
      select p.id,
             coalesce(nullif(p.name, ''), p.email) as name,
             p.email,
             coalesce(r.name, 'No role') as role,
             coalesce(t.assigned, 0) as assigned, coalesce(t.completed, 0) as completed,
             coalesce(t.closed, 0) as closed, coalesce(t.remaining, 0) as remaining,
             coalesce(t.in_progress, 0) as in_progress, coalesce(t.pending, 0) as pending,
             coalesce(t.overdue, 0) as overdue, coalesce(t.completed_today, 0) as completed_today,
             coalesce(e.executions, 0) as executions, coalesce(e.executions_today, 0) as executions_today,
             coalesce(e.passed, 0) as passed, coalesce(e.passed_today, 0) as passed_today,
             coalesce(e.failed_today, 0) as failed_today, coalesce(e.blocked_today, 0) as blocked_today,
             coalesce(e.bugs_reported, 0) as bugs_reported, coalesce(e.bugs_reported_today, 0) as bugs_reported_today,
             coalesce(e.bugs_fixed, 0) as bugs_fixed, coalesce(e.bugs_fixed_today, 0) as bugs_fixed_today,
             coalesce(e.actions_today, 0) as actions_today, e.last_activity,
             coalesce(pr.project_count, 0) as project_count, coalesce(pr.badges, '[]'::jsonb) as badges
        from profiles p
        left join roles r on r.id = p.role_id
        left join per_task t on t.member_id = p.id
        left join per_event e on e.member_id = p.id
        left join per_project pr on pr.member_id = p.id
    ),
    scored as (
      select x.*,
             case when x.assigned > 0 then round(x.completed * 100.0 / x.assigned)::int end as task_completion_pct,
             case when x.executions > 0 then round(x.passed * 100.0 / x.executions)::int end as pass_rate
        from people x
    )
    select jsonb_build_object(
      'generatedAt', now(),
      'timezone', p_timezone,
      'summary', (
        select jsonb_build_object(
          'totalMembers', (select count(*) from profiles),
          'totalAssigned', (select count(*) from tasks),
          'unassignedCases', (select count(*) from vms_test_plan_rows where assigned_to is null),
          'completedToday', (select count(*) from tasks where task_status = 'completed' and task_status_at >= v_day_start),
          'inProgress', (select count(*) from tasks where coalesce(task_status, 'open') = 'open' and started),
          'pending', (select count(*) from tasks where coalesce(task_status, 'open') = 'open' and not started),
          'overdue', (select count(*) from tasks where coalesce(task_status, 'open') = 'open' and target_date is not null and target_date < v_today),
          'completed', (select count(*) from tasks where task_status = 'completed'),
          'productivity', (select case when count(*) > 0 then round(count(*) filter (where task_status = 'completed') * 100.0 / count(*))::int else 0 end from tasks),
          'testsExecuted', (select count(*) from events where action = 'result_changed'),
          'testsExecutedToday', (select count(*) from events where action = 'result_changed' and occurred_at >= v_day_start),
          'avgCloseDays', (
            select coalesce(round(avg(extract(epoch from task_status_at - assigned_at) / 86400.0)::numeric, 1), 0)
              from tasks where task_status in ('completed', 'closed') and task_status_at is not null and assigned_at is not null),
          'plansWithTargetDate', (select count(*) from test_plans where target_date is not null))),
      'members', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'email', s.email, 'role', s.role,
          'projectBadges', s.badges, 'activeProjects', s.project_count,
          'total', s.assigned, 'completed', s.completed, 'closed', s.closed, 'remaining', s.remaining,
          'inProgress', s.in_progress, 'pending', s.pending, 'overdue', s.overdue,
          'completedToday', s.completed_today,
          'testsExecuted', s.executions, 'testsExecutedToday', s.executions_today,
          'testsPassedToday', s.passed_today, 'testsFailedToday', s.failed_today, 'testsBlockedToday', s.blocked_today,
          'bugsReported', s.bugs_reported, 'bugsReportedToday', s.bugs_reported_today,
          'bugsFixed', s.bugs_fixed, 'bugsFixedToday', s.bugs_fixed_today,
          'actionsToday', s.actions_today, 'lastActivity', s.last_activity,
          'taskCompletionPct', coalesce(s.task_completion_pct, 0),
          'passRate', s.pass_rate,
          'qualityScore', s.pass_rate,
          'performanceScore', (
            select coalesce(round(avg(v))::int, 0)
              from (values (s.task_completion_pct), (s.pass_rate)) as parts(v) where v is not null),
          'status', case
            when s.last_activity is null then 'offline'
            when s.last_activity > now() - interval '15 minutes' then 'working'
            when s.last_activity > now() - interval '2 hours' then 'idle'
            else 'offline' end
        ) order by s.name), '[]'::jsonb)
        from scored s)));
end;
$$;

create or replace function member_performance(p_member uuid, p_timezone text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_team jsonb;
  v_member jsonb;
  v_day_start timestamptz;
begin
  if not has_permission('users.view') then
    raise exception 'You don''t have permission to view team performance.';
  end if;

  v_team := team_performance(p_timezone);
  select m into v_member from jsonb_array_elements(v_team->'members') m where (m->>'id')::uuid = p_member;
  if v_member is null then
    raise exception 'That team member no longer exists.';
  end if;

  begin
    v_day_start := date_trunc('day', now() at time zone p_timezone) at time zone p_timezone;
  exception when others then
    v_day_start := date_trunc('day', now());
  end;

  return jsonb_build_object(
    'generatedAt', now(),
    'member', v_member,
    -- what this person did, newest first
    'timeline', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'at', a.occurred_at, 'action', a.action, 'label', a.entity_label,
        'plan', a.plan_name, 'field', a.field, 'old', a.old_value, 'new', a.new_value,
        'result', a.result, 'comment', a.comment) order by a.occurred_at desc, a.id desc), '[]'::jsonb)
      from (
        select * from audit_log where actor_id = p_member order by occurred_at desc, id desc limit 50
      ) a),
    -- results recorded per day, last 14 days in the caller's time zone
    'executionsByDay', (
      select coalesce(jsonb_agg(jsonb_build_object('label', to_char(d.day, 'DD Mon'), 'date', d.day, 'value', d.n) order by d.day), '[]'::jsonb)
      from (
        select (v_day_start - make_interval(days => offs))::date as day,
               (select count(*) from audit_log a
                 where a.actor_id = p_member and a.action = 'result_changed'
                   and a.occurred_at >= v_day_start - make_interval(days => offs)
                   and a.occurred_at < v_day_start - make_interval(days => offs - 1))::int as n
          from generate_series(13, 0, -1) as offs
      ) d),
    -- every action per day for the activity heatmap
    'activityByDay', (
      select coalesce(jsonb_agg(jsonb_build_object('date', x.day, 'count', x.n) order by x.day), '[]'::jsonb)
      from (
        select (a.occurred_at at time zone p_timezone)::date as day, count(*)::int as n
          from audit_log a
         where a.actor_id = p_member and a.occurred_at >= now() - interval '1 year'
         group by 1
      ) x),
    'projectAllocation', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'projectId', x.project_id, 'name', x.name, 'key', x.key,
        'done', x.done, 'total', x.total,
        'pct', case when x.total > 0 then round(x.done * 100.0 / x.total)::int else 0 end) order by x.name), '[]'::jsonb)
      from (
        select pj.id as project_id, pj.name, pj.key,
               count(v.id)::int as total,
               count(v.id) filter (where v.task_status = 'completed')::int as done
          from project_members pm
          join projects pj on pj.id = pm.project_id
          left join vms_test_plan_rows v on v.project_id = pj.id and v.assigned_to = p_member
         where pm.user_id = p_member
         group by pj.id, pj.name, pj.key
      ) x));
end;
$$;

revoke all on function team_performance(text) from public, anon;
revoke all on function member_performance(uuid, text) from public, anon;
grant execute on function team_performance(text) to authenticated;
grant execute on function member_performance(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
