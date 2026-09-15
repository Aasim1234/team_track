-- Release history and release reports.
--
-- Every release version is a historical record with its own report:
--
--   release_versions            lifecycle Active -> Testing -> Completed, then a
--                               Pass / Discard decision (Discard needs a reason)
--   release_decisions           every decision ever recorded, with its reason
--   release_plan_links          which test plans belonged to which release, and when
--   release_snapshots           saved copies of release data:
--     kind 'plan_departure'       a test plan's data at the moment it left a release
--                                 (moved to another release, or deleted), so the
--                                 release it left keeps it
--     kind 'release_completed'    the full report, saved when the release is completed
--   release_snapshot_plans / _runs / _cases / _activity
--                               the saved test plans, test runs, test cases with their
--                               results and fail/block reasons, and activity history
--
-- An Active or Testing release's report is live: its current test plans plus the
-- saved data of plans that left it. A Completed release's report is read only
-- from its saved snapshot, so later changes to test cases, plans, runs, results,
-- assignments or a plan's current release never change it. Saved history can't
-- be edited or deleted.
--
-- Permissions: releases.manage (create/rename versions, start testing, complete,
-- reopen) and the new releases.decide (mark Pass or Discard, change the reason).
-- Reading needs test_plans.view; exporting needs reports.export.
--
-- Existing data: links are rebuilt from the Activity Log. Plans that already
-- left a release get that release's copy rebuilt from current data with later
-- logged changes undone, and the copy says so.

begin;

-- ------------------------------------------------------------- helpers --

create or replace function person_label(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(name, ''), email) from profiles where id = p_id
$$;

create or replace function release_label(p text)
returns text language sql immutable as $$
  select case p
    when 'active' then 'Active' when 'testing' then 'Testing' when 'completed' then 'Completed'
    when 'pass' then 'Pass' when 'discard' then 'Discard' else p end
$$;

create or replace function audit_result_key(p_label text)
returns text language sql immutable as $$
  select case p_label
    when 'Untested' then 'not_tested' when 'Pass' then 'pass' when 'Fail' then 'fail'
    when 'Blocked' then 'blocked' when 'Retest' then 'retest' when 'N/A' then 'na' end
$$;

-- ------------------------------------------------------------ releases --

alter table release_versions
  add column if not exists status text not null default 'active',
  add column if not exists decision text,
  add column if not exists discard_reason text,
  add column if not exists release_date date,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references profiles(id) on delete set null,
  add column if not exists testing_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references profiles(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references profiles(id) on delete set null;

alter table release_versions drop constraint if exists release_versions_status_check;
alter table release_versions add constraint release_versions_status_check
  check (status in ('active', 'testing', 'completed'));
alter table release_versions drop constraint if exists release_versions_decision_check;
alter table release_versions add constraint release_versions_decision_check
  check (decision is null or (decision in ('pass', 'discard') and status = 'completed'));
-- A Discard decision can't exist without a reason; other decisions carry none.
alter table release_versions drop constraint if exists release_versions_discard_reason_check;
alter table release_versions add constraint release_versions_discard_reason_check
  check (case when decision = 'discard' then coalesce(discard_reason ~ '[^[:space:]]', false)
              else discard_reason is null end);

-- Name and release date are edited directly; status and decision only through
-- set_release_status / record_release_decision.
revoke update on release_versions from authenticated;
grant update (name, release_date) on release_versions to authenticated;

create table if not exists release_decisions (
  id uuid primary key default gen_random_uuid(),
  release_version_id uuid not null references release_versions(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  decision text not null check (decision in ('pass', 'discard')),
  reason text,
  decided_by uuid,
  decided_by_name text not null,
  decided_at timestamptz not null default now()
);
create index if not exists idx_release_decisions_release on release_decisions (release_version_id, decided_at desc);

create table if not exists release_plan_links (
  id uuid primary key default gen_random_uuid(),
  release_version_id uuid not null references release_versions(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  plan_id uuid references test_plans(id) on delete set null,
  source_plan_id uuid not null,            -- kept after the plan itself is deleted
  plan_name text not null,
  joined_at timestamptz not null default now(),
  joined_by_name text,
  left_at timestamptz,
  left_by_name text,
  left_reason text
);
create index if not exists idx_release_plan_links_release on release_plan_links (release_version_id);
create index if not exists idx_release_plan_links_plan on release_plan_links (source_plan_id);

create table if not exists release_snapshots (
  id uuid primary key default gen_random_uuid(),
  release_version_id uuid not null references release_versions(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in ('release_completed', 'plan_departure')),
  link_id uuid references release_plan_links(id) on delete cascade,
  release_name text not null,
  captured_at timestamptz not null default now(),
  captured_by uuid,
  captured_by_name text not null,
  note text,
  total_plans integer not null default 0,
  total_cases integer not null default 0,
  passed integer not null default 0,
  failed integer not null default 0,
  blocked integer not null default 0,
  retest integer not null default 0,
  not_tested integer not null default 0,
  na integer not null default 0,
  pass_rate numeric(5,1) not null default 0,
  progress numeric(5,1) not null default 0
);
create index if not exists idx_release_snapshots_release on release_snapshots (release_version_id, kind, captured_at desc);
create index if not exists idx_release_snapshots_link on release_snapshots (link_id);

create table if not exists release_snapshot_plans (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references release_snapshots(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  source_plan_id uuid not null,
  plan_name text not null,
  description text,
  plan_status text,
  owner_name text,
  created_by_name text,
  target_date date,
  joined_at timestamptz,
  left_at timestamptz,
  left_reason text,
  note text,
  sort_order integer not null default 0,
  total_cases integer not null default 0,
  passed integer not null default 0,
  failed integer not null default 0,
  blocked integer not null default 0,
  retest integer not null default 0,
  not_tested integer not null default 0,
  na integer not null default 0
);
create index if not exists idx_release_snapshot_plans_snapshot on release_snapshot_plans (snapshot_id);

create table if not exists release_snapshot_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_plan_id uuid not null references release_snapshot_plans(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  source_run_id uuid,
  run_name text not null,
  run_status text,
  created_at timestamptz,
  closed_at timestamptz,
  total integer not null default 0,
  passed integer not null default 0,
  failed integer not null default 0,
  blocked integer not null default 0,
  retest integer not null default 0,
  skipped integer not null default 0,
  untested integer not null default 0
);
create index if not exists idx_release_snapshot_runs_plan on release_snapshot_runs (snapshot_plan_id);

create table if not exists release_snapshot_cases (
  id uuid primary key default gen_random_uuid(),
  snapshot_plan_id uuid not null references release_snapshot_plans(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  source_row_id uuid,
  case_number bigint,
  topic text,
  scenario text,
  test_steps text,
  expected_result text,
  result text not null,
  reason text,
  failed_by_name text,
  failed_at timestamptz,
  assigned_to_name text,
  task_status text,
  sort_order integer
);
create index if not exists idx_release_snapshot_cases_plan on release_snapshot_cases (snapshot_plan_id, sort_order);

create table if not exists release_snapshot_activity (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references release_snapshots(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  source_audit_id bigint,
  occurred_at timestamptz not null,
  actor_name text,
  action text not null,
  entity_label text,
  plan_name text,
  field text,
  old_value text,
  new_value text,
  comment text,
  result text
);
create index if not exists idx_release_snapshot_activity_snapshot on release_snapshot_activity (snapshot_id, occurred_at desc);

-- Readable by anyone who can see the project's test plans; written only by the
-- functions below.
do $rls$
declare t text;
begin
  foreach t in array array['release_decisions', 'release_plan_links', 'release_snapshots', 'release_snapshot_plans',
                           'release_snapshot_runs', 'release_snapshot_cases', 'release_snapshot_activity'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('create policy %I on %I for select to authenticated using (has_project_access(project_id) and (select has_permission(''test_plans.view'')))', t || '_select', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end
$rls$;

-- ----------------------------------------------------------- permission --

insert into permissions (key, category, label, description, sort_order) values
  ('releases.decide', 'Test Plans', 'Decide Releases (Pass / Discard)',
   'Mark a completed release as Pass or Discard, and enter or change the discard reason.', 246)
on conflict (key) do update
  set category = excluded.category, label = excluded.label,
      description = excluded.description, sort_order = excluded.sort_order;

update permissions
   set description = 'Create, rename and delete release versions, change which release a test plan belongs to, and move a release through Active, Testing and Completed.'
 where key = 'releases.manage';

alter table role_permissions disable trigger user;
insert into role_permissions (role_id, permission_key)
select r.id, 'releases.decide' from roles r where r.key = 'admin'
on conflict do nothing;
alter table role_permissions enable trigger user;

-- -------------------------------------------------------- capture logic --

-- Recounts a snapshot's plans and totals from its saved test cases.
-- Pass rate = passed / executed (everything except Untested), the app-wide rule.
create or replace function release_refresh_snapshot_counts(p_snapshot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update release_snapshot_plans sp
     set total_cases = c.total, passed = c.passed, failed = c.failed, blocked = c.blocked,
         retest = c.retest, not_tested = c.not_tested, na = c.na
    from (
      select p.id,
             count(x.id) as total,
             count(x.id) filter (where x.result = 'pass') as passed,
             count(x.id) filter (where x.result = 'fail') as failed,
             count(x.id) filter (where x.result = 'blocked') as blocked,
             count(x.id) filter (where x.result = 'retest') as retest,
             count(x.id) filter (where x.result = 'not_tested') as not_tested,
             count(x.id) filter (where x.result = 'na') as na
        from release_snapshot_plans p
        left join release_snapshot_cases x on x.snapshot_plan_id = p.id
       where p.snapshot_id = p_snapshot_id
       group by p.id
    ) c
   where sp.id = c.id;

  update release_snapshots s
     set total_plans = t.plans, total_cases = t.total, passed = t.passed, failed = t.failed,
         blocked = t.blocked, retest = t.retest, not_tested = t.not_tested, na = t.na,
         pass_rate = case when t.total - t.not_tested > 0 then round(t.passed * 100.0 / (t.total - t.not_tested), 1) else 0 end,
         progress = case when t.total > 0 then round((t.total - t.not_tested) * 100.0 / t.total, 1) else 0 end
    from (
      select count(*) as plans, coalesce(sum(total_cases), 0) as total, coalesce(sum(passed), 0) as passed,
             coalesce(sum(failed), 0) as failed, coalesce(sum(blocked), 0) as blocked, coalesce(sum(retest), 0) as retest,
             coalesce(sum(not_tested), 0) as not_tested, coalesce(sum(na), 0) as na
        from release_snapshot_plans where snapshot_id = p_snapshot_id
    ) t
   where s.id = p_snapshot_id;
end;
$$;

-- Copies one test plan's current data (plan, runs, test cases) into a snapshot.
create or replace function release_capture_live_plan(p_snapshot_id uuid, p_link_id uuid, p_sort integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l release_plan_links;
  v_plan test_plans;
  v_sp uuid;
begin
  select * into l from release_plan_links where id = p_link_id;
  select * into v_plan from test_plans where id = l.source_plan_id;
  if v_plan.id is null then
    return null;
  end if;

  insert into release_snapshot_plans (snapshot_id, project_id, source_plan_id, plan_name, description, plan_status,
                                      owner_name, created_by_name, target_date, joined_at, left_at, left_reason, sort_order)
  values (p_snapshot_id, v_plan.project_id, v_plan.id, v_plan.name, v_plan.description, v_plan.status,
          person_label(v_plan.owner_id), person_label(v_plan.created_by), v_plan.target_date,
          l.joined_at, l.left_at, l.left_reason, p_sort)
  returning id into v_sp;

  insert into release_snapshot_cases (snapshot_plan_id, project_id, source_row_id, case_number, topic, scenario, test_steps,
                                      expected_result, result, reason, failed_by_name, failed_at, assigned_to_name, task_status, sort_order)
  select v_sp, v_plan.project_id, r.id, r.case_number, r.topic, r.scenario, r.test_steps, r.expected_result,
         coalesce(r.result, 'not_tested'),
         case when r.result in ('fail', 'blocked') then r.failure_comment end,
         case when r.result in ('fail', 'blocked') then person_label(r.failed_by) end,
         case when r.result in ('fail', 'blocked') then r.failed_at end,
         person_label(r.assigned_to), r.task_status, r.sort_order
    from vms_test_plan_rows r
   where r.plan_id = v_plan.id;

  insert into release_snapshot_runs (snapshot_plan_id, project_id, source_run_id, run_name, run_status, created_at, closed_at,
                                     total, passed, failed, blocked, retest, skipped, untested)
  select v_sp, v_plan.project_id, t.id, t.name, t.status, t.created_at, t.closed_at,
         count(s.run_case_id),
         count(s.run_case_id) filter (where s.current_status = 'passed'),
         count(s.run_case_id) filter (where s.current_status = 'failed'),
         count(s.run_case_id) filter (where s.current_status = 'blocked'),
         count(s.run_case_id) filter (where s.current_status = 'retest'),
         count(s.run_case_id) filter (where s.current_status = 'skipped'),
         count(s.run_case_id) filter (where s.current_status = 'untested')
    from test_runs t
    left join test_run_case_current_status s on s.run_id = t.id
   where t.test_plan_id = v_plan.id
   group by t.id;

  return v_sp;
end;
$$;

-- Copies a plan already saved in another snapshot (a plan that left the release).
create or replace function release_copy_snapshot_plan(p_snapshot_id uuid, p_from uuid, p_sort integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sp uuid;
begin
  insert into release_snapshot_plans (snapshot_id, project_id, source_plan_id, plan_name, description, plan_status,
                                      owner_name, created_by_name, target_date, joined_at, left_at, left_reason, note, sort_order)
  select p_snapshot_id, project_id, source_plan_id, plan_name, description, plan_status,
         owner_name, created_by_name, target_date, joined_at, left_at, left_reason, note, p_sort
    from release_snapshot_plans where id = p_from
  returning id into v_sp;

  insert into release_snapshot_cases (snapshot_plan_id, project_id, source_row_id, case_number, topic, scenario, test_steps,
                                      expected_result, result, reason, failed_by_name, failed_at, assigned_to_name, task_status, sort_order)
  select v_sp, project_id, source_row_id, case_number, topic, scenario, test_steps,
         expected_result, result, reason, failed_by_name, failed_at, assigned_to_name, task_status, sort_order
    from release_snapshot_cases where snapshot_plan_id = p_from;

  insert into release_snapshot_runs (snapshot_plan_id, project_id, source_run_id, run_name, run_status, created_at, closed_at,
                                     total, passed, failed, blocked, retest, skipped, untested)
  select v_sp, project_id, source_run_id, run_name, run_status, created_at, closed_at,
         total, passed, failed, blocked, retest, skipped, untested
    from release_snapshot_runs where snapshot_plan_id = p_from;

  return v_sp;
end;
$$;

-- The test plans that make up a release: one entry per plan (its latest link).
-- A plan still in the release is read live; a plan that left is read from the
-- copy saved when it left.
create or replace function release_plan_sources(p_release_id uuid)
returns table (link_id uuid, source_plan_id uuid, is_live boolean, departed_snapshot_plan_id uuid,
               joined_at timestamptz, left_at timestamptz, left_reason text, plan_name text)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (l.source_plan_id) l.*
      from release_plan_links l
     where l.release_version_id = p_release_id
     order by l.source_plan_id, l.joined_at desc
  )
  select l.id, l.source_plan_id,
         l.left_at is null and exists (
           select 1 from test_plans tp where tp.id = l.source_plan_id and tp.release_version_id = p_release_id),
         (select sp.id
            from release_snapshots s
            join release_snapshot_plans sp on sp.snapshot_id = s.id
           where s.kind = 'plan_departure' and s.link_id = l.id
           order by s.captured_at desc limit 1),
         l.joined_at, l.left_at, l.left_reason,
         coalesce((select tp.name from test_plans tp where tp.id = l.source_plan_id), l.plan_name)
    from latest l
$$;

-- Activity that belongs to a release: everything logged against the release
-- itself, plus test-plan and test-case activity while each plan was in it.
create or replace function release_activity(p_release_id uuid, p_until timestamptz)
returns setof audit_log language sql stable security definer set search_path = public as $$
  select a.*
    from audit_log a
   where a.occurred_at <= p_until
     and ((a.entity_type = 'release' and a.entity_id = p_release_id)
          or (a.action in ('result_changed', 'failure_comment_edited', 'block_reason_edited', 'row_added', 'row_deleted',
                           'row_edited', 'assigned', 'unassigned', 'bulk_assigned', 'section_assigned', 'task_completed',
                           'task_closed', 'task_reopened', 'plan_created', 'plan_edited', 'plan_deleted',
                           'release_version_changed', 'report_exported')
              and exists (select 1 from release_plan_links l
                           where l.release_version_id = p_release_id
                             and a.plan_id = l.source_plan_id
                             and a.occurred_at >= l.joined_at
                             and a.occurred_at <= coalesce(l.left_at, p_until))))
$$;

-- Saves a snapshot: one departing plan, or the whole release on completion.
create or replace function release_capture_snapshot(p_release_id uuid, p_kind text, p_link_id uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r release_versions;
  v_id uuid;
  src record;
  n integer := 0;
  v_until timestamptz := now();
begin
  perform set_config('app.release_capture', 'on', true);
  select * into r from release_versions where id = p_release_id;

  insert into release_snapshots (release_version_id, project_id, kind, link_id, release_name, captured_by, captured_by_name, note)
  values (r.id, r.project_id, p_kind, p_link_id, r.name, auth.uid(), coalesce(person_label(auth.uid()), 'System'), p_note)
  returning id into v_id;

  if p_kind = 'plan_departure' then
    perform release_capture_live_plan(v_id, p_link_id, 0);
  else
    for src in
      select * from release_plan_sources(r.id) s
       where s.is_live or s.departed_snapshot_plan_id is not null
       order by lower(s.plan_name)
    loop
      n := n + 1;
      if src.is_live then
        perform release_capture_live_plan(v_id, src.link_id, n);
      else
        perform release_copy_snapshot_plan(v_id, src.departed_snapshot_plan_id, n);
      end if;
    end loop;

    insert into release_snapshot_activity (snapshot_id, project_id, source_audit_id, occurred_at, actor_name, action,
                                           entity_label, plan_name, field, old_value, new_value, comment, result)
    select v_id, r.project_id, a.id, a.occurred_at, a.actor_name, a.action,
           a.entity_label, a.plan_name, a.field, a.old_value, a.new_value, a.comment, a.result
      from release_activity(r.id, v_until) a;
  end if;

  perform release_refresh_snapshot_counts(v_id);
  perform set_config('app.release_capture', 'off', true);
  return v_id;
end;
$$;

-- --------------------------------------------------------------- report --

create or replace function release_snapshot_plan_json(p_snapshot_plan_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'source_plan_id', sp.source_plan_id, 'name', sp.plan_name, 'description', sp.description, 'status', sp.plan_status,
    'owner_name', sp.owner_name, 'created_by_name', sp.created_by_name, 'target_date', sp.target_date,
    'joined_at', sp.joined_at, 'left_at', sp.left_at, 'left_reason', sp.left_reason,
    'departed', sp.left_at is not null, 'saved_at', s.captured_at, 'saved_note', coalesce(sp.note, s.note),
    'counts', jsonb_build_object('total', sp.total_cases, 'pass', sp.passed, 'fail', sp.failed, 'blocked', sp.blocked,
                                 'retest', sp.retest, 'not_tested', sp.not_tested, 'na', sp.na),
    'runs', coalesce((select jsonb_agg(jsonb_build_object(
                'name', x.run_name, 'status', x.run_status, 'created_at', x.created_at, 'closed_at', x.closed_at,
                'total', x.total, 'passed', x.passed, 'failed', x.failed, 'blocked', x.blocked,
                'retest', x.retest, 'skipped', x.skipped, 'untested', x.untested) order by x.created_at)
              from release_snapshot_runs x where x.snapshot_plan_id = sp.id), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(jsonb_build_object(
                'case_number', c.case_number, 'topic', c.topic, 'scenario', c.scenario, 'test_steps', c.test_steps,
                'expected_result', c.expected_result, 'result', c.result, 'reason', c.reason,
                'failed_by_name', c.failed_by_name, 'failed_at', c.failed_at,
                'assigned_to_name', c.assigned_to_name, 'task_status', c.task_status) order by c.sort_order, c.case_number)
              from release_snapshot_cases c where c.snapshot_plan_id = sp.id), '[]'::jsonb))
    from release_snapshot_plans sp
    join release_snapshots s on s.id = sp.snapshot_id
   where sp.id = p_snapshot_plan_id
$$;

create or replace function release_live_plan_json(p_plan_id uuid, p_joined timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'source_plan_id', tp.id, 'name', tp.name, 'description', tp.description, 'status', tp.status,
    'owner_name', person_label(tp.owner_id), 'created_by_name', person_label(tp.created_by), 'target_date', tp.target_date,
    'joined_at', p_joined, 'left_at', null, 'left_reason', null, 'departed', false, 'saved_at', null, 'saved_note', null,
    'counts', (select jsonb_build_object(
                 'total', count(*),
                 'pass', count(*) filter (where r.result = 'pass'),
                 'fail', count(*) filter (where r.result = 'fail'),
                 'blocked', count(*) filter (where r.result = 'blocked'),
                 'retest', count(*) filter (where r.result = 'retest'),
                 'not_tested', count(*) filter (where coalesce(r.result, 'not_tested') = 'not_tested'),
                 'na', count(*) filter (where r.result = 'na'))
                 from vms_test_plan_rows r where r.plan_id = tp.id),
    'runs', coalesce((select jsonb_agg(jsonb_build_object(
                'name', t.name, 'status', t.status, 'created_at', t.created_at, 'closed_at', t.closed_at,
                'total', k.total, 'passed', k.passed, 'failed', k.failed, 'blocked', k.blocked,
                'retest', k.retest, 'skipped', k.skipped, 'untested', k.untested) order by t.created_at)
              from test_runs t
              cross join lateral (
                select count(s.run_case_id) as total,
                       count(s.run_case_id) filter (where s.current_status = 'passed') as passed,
                       count(s.run_case_id) filter (where s.current_status = 'failed') as failed,
                       count(s.run_case_id) filter (where s.current_status = 'blocked') as blocked,
                       count(s.run_case_id) filter (where s.current_status = 'retest') as retest,
                       count(s.run_case_id) filter (where s.current_status = 'skipped') as skipped,
                       count(s.run_case_id) filter (where s.current_status = 'untested') as untested
                  from test_run_case_current_status s where s.run_id = t.id) k
             where t.test_plan_id = tp.id), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(jsonb_build_object(
                'case_number', r.case_number, 'topic', r.topic, 'scenario', r.scenario, 'test_steps', r.test_steps,
                'expected_result', r.expected_result, 'result', coalesce(r.result, 'not_tested'),
                'reason', case when r.result in ('fail', 'blocked') then r.failure_comment end,
                'failed_by_name', case when r.result in ('fail', 'blocked') then person_label(r.failed_by) end,
                'failed_at', case when r.result in ('fail', 'blocked') then r.failed_at end,
                'assigned_to_name', person_label(r.assigned_to), 'task_status', r.task_status) order by r.sort_order, r.case_number)
              from vms_test_plan_rows r where r.plan_id = tp.id), '[]'::jsonb))
    from test_plans tp
   where tp.id = p_plan_id
$$;

-- Headline numbers for one release: the saved report once completed, live otherwise.
create or replace function release_counts(p_release_id uuid)
returns table (total_plans integer, total_cases integer, passed integer, failed integer, blocked integer,
               retest integer, not_tested integer, na integer, pass_rate numeric, progress numeric, saved boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  r release_versions;
  s release_snapshots;
begin
  select * into r from release_versions where id = p_release_id;
  if r.status = 'completed' then
    select * into s from release_snapshots
     where release_version_id = r.id and kind = 'release_completed'
     order by captured_at desc limit 1;
  end if;

  if s.id is not null then
    return query select s.total_plans, s.total_cases, s.passed, s.failed, s.blocked, s.retest, s.not_tested, s.na,
                        s.pass_rate, s.progress, true;
    return;
  end if;

  return query
  with src as (
    select * from release_plan_sources(p_release_id) x where x.is_live or x.departed_snapshot_plan_id is not null
  ), cases as (
    select coalesce(v.result, 'not_tested') as res
      from src join vms_test_plan_rows v on v.plan_id = src.source_plan_id
     where src.is_live
    union all
    select c.result
      from src join release_snapshot_cases c on c.snapshot_plan_id = src.departed_snapshot_plan_id
     where not src.is_live
  ), t as (
    select (select count(*) from src)::integer as plans,
           count(*)::integer as total,
           (count(*) filter (where res = 'pass'))::integer as p,
           (count(*) filter (where res = 'fail'))::integer as f,
           (count(*) filter (where res = 'blocked'))::integer as b,
           (count(*) filter (where res = 'retest'))::integer as rt,
           (count(*) filter (where res = 'not_tested'))::integer as nt,
           (count(*) filter (where res = 'na'))::integer as n
      from cases
  )
  select t.plans, t.total, t.p, t.f, t.b, t.rt, t.nt, t.n,
         case when t.total - t.nt > 0 then round(t.p * 100.0 / (t.total - t.nt), 1) else 0 end,
         case when t.total > 0 then round((t.total - t.nt) * 100.0 / t.total, 1) else 0 end,
         false
    from t;
end;
$$;

-- The complete report for one release, used by the report page and the export.
create or replace function release_report(p_release_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r release_versions;
  s release_snapshots;
  c record;
  v_plans jsonb;
  v_activity jsonb;
begin
  select * into r from release_versions where id = p_release_id;
  if r.id is null or not has_project_access(r.project_id) or not has_permission('test_plans.view') then
    raise exception 'This release doesn''t exist or you don''t have access to it.';
  end if;

  if r.status = 'completed' then
    select * into s from release_snapshots
     where release_version_id = r.id and kind = 'release_completed'
     order by captured_at desc limit 1;
  end if;

  if s.id is not null then
    select coalesce(jsonb_agg(release_snapshot_plan_json(sp.id) order by sp.sort_order), '[]'::jsonb)
      into v_plans
      from release_snapshot_plans sp where sp.snapshot_id = s.id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.source_audit_id, 'occurred_at', a.occurred_at, 'actor_name', a.actor_name, 'action', a.action,
             'entity_label', a.entity_label, 'plan_name', a.plan_name, 'field', a.field, 'old_value', a.old_value,
             'new_value', a.new_value, 'comment', a.comment, 'result', a.result)
             order by a.occurred_at desc, a.source_audit_id desc), '[]'::jsonb)
      into v_activity
      from release_snapshot_activity a where a.snapshot_id = s.id;
  else
    select coalesce(jsonb_agg(x.p order by lower(x.p->>'name')), '[]'::jsonb)
      into v_plans
      from (
        select case when src.is_live then release_live_plan_json(src.source_plan_id, src.joined_at)
                    else release_snapshot_plan_json(src.departed_snapshot_plan_id) end as p
          from release_plan_sources(r.id) src
         where src.is_live or src.departed_snapshot_plan_id is not null
      ) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'occurred_at', a.occurred_at, 'actor_name', a.actor_name, 'action', a.action,
             'entity_label', a.entity_label, 'plan_name', a.plan_name, 'field', a.field, 'old_value', a.old_value,
             'new_value', a.new_value, 'comment', a.comment, 'result', a.result)
             order by a.occurred_at desc, a.id desc), '[]'::jsonb)
      into v_activity
      from release_activity(r.id, now()) a;
  end if;

  select * into c from release_counts(r.id);

  return jsonb_build_object(
    'release', jsonb_build_object(
      'id', r.id, 'name', r.name, 'status', r.status, 'decision', r.decision, 'discard_reason', r.discard_reason,
      'release_date', r.release_date, 'project_id', r.project_id,
      'project_name', (select name from projects where id = r.project_id),
      'created_at', r.created_at, 'created_by_name', person_label(r.created_by),
      'updated_at', r.updated_at, 'updated_by_name', person_label(r.updated_by),
      'testing_started_at', r.testing_started_at,
      'completed_at', r.completed_at, 'completed_by_name', person_label(r.completed_by),
      'decided_at', r.decided_at, 'decided_by_name', person_label(r.decided_by)),
    'source', case when s.id is not null then 'saved' else 'live' end,
    'saved', case when s.id is not null then jsonb_build_object(
      'id', s.id, 'captured_at', s.captured_at, 'captured_by_name', s.captured_by_name, 'note', s.note) end,
    'summary', jsonb_build_object(
      'total_plans', c.total_plans, 'total_cases', c.total_cases, 'pass', c.passed, 'fail', c.failed,
      'blocked', c.blocked, 'retest', c.retest, 'not_tested', c.not_tested, 'na', c.na,
      'executed', c.total_cases - c.not_tested, 'pass_rate', c.pass_rate, 'progress', c.progress),
    'plans', v_plans,
    'activity', v_activity,
    'decisions', coalesce((select jsonb_agg(jsonb_build_object(
        'decision', d.decision, 'reason', d.reason, 'decided_by_name', d.decided_by_name, 'decided_at', d.decided_at)
        order by d.decided_at desc)
      from release_decisions d where d.release_version_id = r.id), '[]'::jsonb),
    'saved_reports', coalesce((select jsonb_agg(jsonb_build_object(
        'captured_at', x.captured_at, 'captured_by_name', x.captured_by_name, 'total_cases', x.total_cases,
        'pass_rate', x.pass_rate) order by x.captured_at desc)
      from release_snapshots x where x.release_version_id = r.id and x.kind = 'release_completed'), '[]'::jsonb),
    'generated_at', now());
end;
$$;

-- Release History: every release in a project with its headline numbers.
create or replace function release_history(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not has_project_access(p_project_id) or not has_permission('test_plans.view') then
    raise exception 'You don''t have access to this project''s releases.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', rv.id, 'name', rv.name, 'status', rv.status, 'decision', rv.decision,
             'discard_reason', rv.discard_reason, 'release_date', rv.release_date,
             'created_at', rv.created_at, 'created_by_name', person_label(rv.created_by),
             'testing_started_at', rv.testing_started_at, 'completed_at', rv.completed_at, 'decided_at', rv.decided_at,
             'current_plans', (select count(*) from test_plans tp where tp.release_version_id = rv.id),
             'counts', to_jsonb(c))
           order by rv.created_at desc)
      from release_versions rv
      cross join lateral release_counts(rv.id) c
     where rv.project_id = p_project_id), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------ lifecycle --

create or replace function set_release_status(p_release_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r release_versions;
  v_snapshot uuid;
  s release_snapshots;
begin
  if not has_permission('releases.manage') then
    raise exception 'You don''t have permission to change a release''s status.';
  end if;
  select * into r from release_versions where id = p_release_id for update;
  if r.id is null or not has_project_access(r.project_id) then
    raise exception 'This release doesn''t exist or you don''t have access to it.';
  end if;
  if p_status = r.status then
    return jsonb_build_object('status', r.status);
  end if;

  if r.status = 'active' and p_status = 'testing' then
    update release_versions set status = 'testing', testing_started_at = now() where id = r.id;

  elsif r.status = 'testing' and p_status = 'completed' then
    if not exists (select 1 from release_plan_sources(r.id) x where x.is_live or x.departed_snapshot_plan_id is not null) then
      raise exception 'Release % has no test plans yet, so there is nothing to report.', r.name;
    end if;
    update release_versions set status = 'completed', completed_at = now(), completed_by = auth.uid() where id = r.id;
    v_snapshot := release_capture_snapshot(r.id, 'release_completed', null, null);
    select * into s from release_snapshots where id = v_snapshot;
    perform audit_write(r.project_id, 'release_report_saved', 'release', r.id, r.name, null, null,
      'Release Report', null, 'Saved',
      format('%s test case%s in %s test plan%s · %s passed, %s failed, %s blocked · %s%% pass rate',
             s.total_cases, case when s.total_cases = 1 then '' else 's' end,
             s.total_plans, case when s.total_plans = 1 then '' else 's' end,
             s.passed, s.failed, s.blocked, s.pass_rate), null);

  elsif r.status = 'completed' and p_status = 'testing' then
    if r.decision is not null then
      raise exception 'Release % is already marked %, so it can''t be reopened.', r.name, release_label(r.decision);
    end if;
    update release_versions set status = 'testing', completed_at = null, completed_by = null where id = r.id;

  else
    raise exception 'A release moves Active → Testing → Completed, so it can''t go from % to %.',
      release_label(r.status), coalesce(release_label(p_status), p_status);
  end if;

  select * into r from release_versions where id = p_release_id;
  return jsonb_build_object('status', r.status, 'snapshot_id', v_snapshot);
end;
$$;

create or replace function record_release_decision(p_release_id uuid, p_decision text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r release_versions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not has_permission('releases.decide') then
    raise exception 'You don''t have permission to mark releases Pass or Discard.';
  end if;
  select * into r from release_versions where id = p_release_id for update;
  if r.id is null or not has_project_access(r.project_id) then
    raise exception 'This release doesn''t exist or you don''t have access to it.';
  end if;
  if r.status <> 'completed' then
    raise exception 'Complete release % before marking it Pass or Discard.', r.name;
  end if;
  if p_decision is null or p_decision not in ('pass', 'discard') then
    raise exception 'Choose Pass or Discard.';
  end if;
  if p_decision = 'discard' and v_reason is null then
    raise exception 'Enter the reason for discarding release %.', r.name;
  end if;
  if p_decision = 'pass' then
    v_reason := null;
  end if;
  if r.decision is not distinct from p_decision and r.discard_reason is not distinct from v_reason then
    return jsonb_build_object('decision', r.decision);
  end if;

  update release_versions
     set decision = p_decision, discard_reason = v_reason, decided_at = now(), decided_by = auth.uid()
   where id = r.id;
  insert into release_decisions (release_version_id, project_id, decision, reason, decided_by, decided_by_name)
  values (r.id, r.project_id, p_decision, v_reason, auth.uid(), coalesce(person_label(auth.uid()), 'System'));

  return jsonb_build_object('decision', p_decision, 'discard_reason', v_reason);
end;
$$;

create or replace function log_release_export(p_release_id uuid, p_filename text, p_case_count integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  r release_versions;
begin
  if not has_permission('reports.export') then
    raise exception 'You don''t have permission to export reports.';
  end if;
  select * into r from release_versions where id = p_release_id;
  if r.id is null or not has_project_access(r.project_id) then
    raise exception 'This release doesn''t exist or you don''t have access to it.';
  end if;
  perform audit_write(r.project_id, 'report_exported', 'release', r.id, left(coalesce(p_filename, ''), 200), null, null,
    'Format', null, 'XLSX',
    format('Release %s report · %s test case%s', r.name, p_case_count, case when p_case_count = 1 then '' else 's' end),
    null);
end;
$$;

-- ----------------------------------------------------------------- guards --

create or replace function release_version_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_plans integer;
begin
  if tg_op = 'DELETE' then
    -- A project being deleted takes its releases with it.
    if pg_trigger_depth() = 1 then
      select count(*) into v_plans from test_plans where release_version_id = old.id;
      if v_plans > 0 then
        raise exception 'Release version % is still used by % test plan%. Move them to another release version first.',
          old.name, v_plans, case when v_plans = 1 then '' else 's' end;
      end if;
      if old.status <> 'active' or exists (select 1 from release_plan_links where release_version_id = old.id) then
        raise exception 'Release version % has test history, so it can''t be deleted.', old.name;
      end if;
    end if;
    return old;
  end if;

  new.name := btrim(new.name);
  if new.name = '' then
    raise exception 'Enter a release version, for example 12.70.';
  end if;

  if tg_op = 'INSERT' then
    if v_actor is not null then
      new.created_by := v_actor;
      new.created_at := now();
    end if;
  elsif pg_trigger_depth() = 1 then
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.name is distinct from old.name and old.status = 'completed' then
      raise exception 'Release % is completed, so its version can''t be renamed.', old.name;
    end if;
    if v_actor is not null then
      new.updated_at := now();
      new.updated_by := v_actor;
    end if;
  end if;
  return new;
end;
$$;

create or replace function test_plan_access_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_release release_versions;
begin
  if tg_op = 'INSERT' then
    if v_actor is not null then
      new.created_by := v_actor;
      if new.status = 'completed' and not has_permission('test_plans.close') then
        raise exception 'You don''t have permission to complete test plans.';
      end if;
      if new.release_version_id is null then
        raise exception 'Choose the release version this test plan is for.';
      end if;
    end if;
    if new.release_version_id is not null then
      select * into v_release from release_versions where id = new.release_version_id;
      if v_release.project_id is distinct from new.project_id then
        raise exception 'That release version belongs to a different project.';
      end if;
      if v_release.status = 'completed' then
        raise exception 'Release % is completed. Choose a release version that is still open.', v_release.name;
      end if;
    end if;
    return new;
  end if;

  -- A completed release's test plans are frozen in its report; nothing new joins it.
  if new.release_version_id is distinct from old.release_version_id and new.release_version_id is not null
     and pg_trigger_depth() = 1 then
    select * into v_release from release_versions where id = new.release_version_id;
    if v_release.status = 'completed' then
      raise exception 'Release % is completed. Choose a release version that is still open.', v_release.name;
    end if;
  end if;

  if v_actor is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if (new.name, new.description, new.owner_id, new.target_date, new.project_id)
     is distinct from (old.name, old.description, old.owner_id, old.target_date, old.project_id)
     and not has_permission('test_plans.edit') then
    raise exception 'You don''t have permission to edit test plans.';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'completed' or old.status = 'completed' then
      if not has_permission('test_plans.close') then
        raise exception 'You don''t have permission to complete or reopen test plans.';
      end if;
    elsif not has_permission('test_plans.edit') then
      raise exception 'You don''t have permission to change a test plan''s status.';
    end if;
  end if;

  if new.release_version_id is distinct from old.release_version_id then
    if not has_permission('releases.manage') then
      raise exception 'You don''t have permission to change a test plan''s release version.';
    end if;
    if new.release_version_id is null then
      raise exception 'A test plan''s release version can be changed, but not removed.';
    end if;
    if v_release.project_id is distinct from new.project_id then
      raise exception 'That release version belongs to a different project.';
    end if;
  end if;

  return new;
end;
$$;

-- Keeps release_plan_links current, and saves a plan's data for the release it
-- leaves (moved to another release, or the plan deleted).
create or replace function track_release_plan_links()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor_name text := coalesce(person_label(auth.uid()), 'System');
  v_new_release text;
  l release_plan_links;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op <> 'INSERT' and old.release_version_id is not null
     and (tg_op = 'DELETE' or new.release_version_id is distinct from old.release_version_id) then
    if tg_op = 'UPDATE' then
      select name into v_new_release from release_versions where id = new.release_version_id;
    end if;
    for l in
      update release_plan_links
         set left_at = now(), left_by_name = v_actor_name,
             left_reason = case when tg_op = 'DELETE' then 'Test plan deleted'
                                else 'Moved to release ' || coalesce(v_new_release, '—') end
       where release_version_id = old.release_version_id and source_plan_id = old.id and left_at is null
      returning *
    loop
      perform release_capture_snapshot(l.release_version_id, 'plan_departure', l.id, null);
    end loop;
  end if;

  if tg_op <> 'DELETE' and new.release_version_id is not null
     and (tg_op = 'INSERT' or new.release_version_id is distinct from old.release_version_id) then
    insert into release_plan_links (release_version_id, project_id, plan_id, source_plan_id, plan_name, joined_at, joined_by_name)
    values (new.release_version_id, new.project_id, new.id, new.id, new.name, now(), v_actor_name);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_track_release_plan_links on test_plans;
create trigger trg_track_release_plan_links
  after insert or update of release_version_id on test_plans
  for each row execute function track_release_plan_links();
drop trigger if exists trg_track_release_plan_links_delete on test_plans;
create trigger trg_track_release_plan_links_delete
  before delete on test_plans
  for each row execute function track_release_plan_links();

-- ---------------------------------------------------------- activity log --

create or replace function audit_release_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p record;
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.project_id, 'release_created', 'release', new.id, new.name, null, null,
                        'Release Version', null, new.name, null, null);
    return new;
  end if;

  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      perform audit_write(old.project_id, 'release_deleted', 'release', old.id, old.name, null, null,
                          'Release Version', old.name, null, null, null);
    end if;
    return old;
  end if;

  if new.name is distinct from old.name then
    perform audit_write(new.project_id, 'release_renamed', 'release', new.id, new.name, null, null,
                        'Release Version', old.name, new.name, null, null);
    for p in select id, name from test_plans where release_version_id = new.id order by name loop
      perform audit_write(new.project_id, 'release_version_changed', 'test_plan', p.id, p.name, p.id, p.name,
                          'Release Version', old.name, new.name, 'Release version renamed', null);
    end loop;
  end if;

  if new.status is distinct from old.status then
    perform audit_write(new.project_id, 'release_status_changed', 'release', new.id, new.name, null, null,
                        'Release Status', release_label(old.status), release_label(new.status),
                        case when old.status = 'completed' then 'Release reopened for testing' end, null);
  end if;

  if new.decision is distinct from old.decision then
    perform audit_write(new.project_id, 'release_decision', 'release', new.id, new.name, null, null,
                        'Release Decision', coalesce(release_label(old.decision), release_label(old.status)),
                        release_label(new.decision), new.discard_reason, null);
  elsif new.discard_reason is distinct from old.discard_reason then
    perform audit_write(new.project_id, 'release_decision', 'release', new.id, new.name, null, null,
                        'Discard Reason', old.discard_reason, new.discard_reason, null, null);
  end if;

  if new.release_date is distinct from old.release_date then
    perform audit_write(new.project_id, 'release_date_changed', 'release', new.id, new.name, null, null,
                        'Release Date', to_char(old.release_date, 'DD Mon YYYY'), to_char(new.release_date, 'DD Mon YYYY'), null, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_release_version on release_versions;
create trigger trg_audit_release_version
  after insert or update of name, status, decision, discard_reason, release_date or delete on release_versions
  for each row execute function audit_release_version();

-- ------------------------------------------------ history for existing data --

do $backfill$
declare
  tp record;
  e record;
  l record;
  x record;
  v_open release_plan_links;
  v_release uuid;
  v_snapshot uuid;
  v_sp uuid;
  v_undone integer;
  v_other integer;
  v_note text;
begin
  perform set_config('app.release_capture', 'on', true);

  -- Which release each existing plan was in, and when, from the Activity Log.
  for tp in select * from test_plans order by created_at loop
    continue when exists (select 1 from release_plan_links where source_plan_id = tp.id);
    v_open := null;

    for e in
      select * from audit_log
       where entity_type = 'test_plan' and entity_id = tp.id and field = 'Release Version'
         and action in ('plan_created', 'release_version_changed')
         and comment is distinct from 'Release version renamed'
       order by id
    loop
      if v_open.id is not null then
        update release_plan_links
           set left_at = e.occurred_at, left_by_name = e.actor_name,
               left_reason = case when e.new_value is null then 'Removed from the release' else 'Moved to release ' || e.new_value end
         where id = v_open.id;
        v_open := null;
      end if;
      if e.new_value is not null then
        select id into v_release from release_versions
         where project_id = tp.project_id and lower(btrim(name)) = lower(btrim(e.new_value));
        if v_release is not null then
          insert into release_plan_links (release_version_id, project_id, plan_id, source_plan_id, plan_name, joined_at, joined_by_name)
          values (v_release, tp.project_id, tp.id, tp.id, tp.name, e.occurred_at, e.actor_name)
          returning * into v_open;
        end if;
      end if;
    end loop;

    if v_open.id is not null and v_open.release_version_id is distinct from tp.release_version_id then
      update release_plan_links set left_at = now(), left_by_name = 'System', left_reason = 'Release history added'
       where id = v_open.id;
      v_open := null;
    end if;
    if tp.release_version_id is not null and v_open.id is null then
      insert into release_plan_links (release_version_id, project_id, plan_id, source_plan_id, plan_name, joined_at, joined_by_name)
      select tp.release_version_id, tp.project_id, tp.id, tp.id, tp.name, rv.created_at, 'System'
        from release_versions rv where rv.id = tp.release_version_id;
    end if;
  end loop;

  -- Plans that already left a release: rebuild that release's copy from current
  -- data, undoing the changes logged after the plan left.
  for l in
    select rl.* from release_plan_links rl
     where rl.left_at is not null
       and not exists (select 1 from release_snapshots s where s.link_id = rl.id)
       and exists (select 1 from test_plans p where p.id = rl.source_plan_id)
     order by rl.left_at
  loop
    v_snapshot := release_capture_snapshot(l.release_version_id, 'plan_departure', l.id, null);
    select id into v_sp from release_snapshot_plans where snapshot_id = v_snapshot;
    v_undone := 0;
    v_other := 0;

    delete from release_snapshot_cases c
     using vms_test_plan_rows r
     where c.snapshot_plan_id = v_sp and r.id = c.source_row_id and r.created_at > l.left_at;

    for x in
      select * from audit_log a
       where a.plan_id = l.source_plan_id and a.entity_type = 'test_case' and a.occurred_at > l.left_at
       order by a.id desc
    loop
      if x.action = 'result_changed' and audit_result_key(x.old_value) is not null then
        update release_snapshot_cases
           set result = audit_result_key(x.old_value),
               reason = case when audit_result_key(x.old_value) in ('fail', 'blocked')
                             then case when x.comment ~ '^Previous (failure|block) reason: '
                                       then regexp_replace(x.comment, '^Previous (failure|block) reason: ', '')
                                       else reason end
                        end,
               failed_by_name = null,
               failed_at = null
         where snapshot_plan_id = v_sp and source_row_id = x.entity_id;
        v_undone := v_undone + 1;
      elsif x.action in ('failure_comment_edited', 'block_reason_edited') then
        update release_snapshot_cases set reason = x.old_value where snapshot_plan_id = v_sp and source_row_id = x.entity_id;
        v_undone := v_undone + 1;
      elsif x.action = 'row_edited' and x.field in ('Topic', 'Scenario', 'Test Steps', 'Expected Result') then
        update release_snapshot_cases
           set topic = case when x.field = 'Topic' then x.old_value else topic end,
               scenario = case when x.field = 'Scenario' then x.old_value else scenario end,
               test_steps = case when x.field = 'Test Steps' then x.old_value else test_steps end,
               expected_result = case when x.field = 'Expected Result' then x.old_value else expected_result end
         where snapshot_plan_id = v_sp and source_row_id = x.entity_id;
        v_undone := v_undone + 1;
      elsif x.action <> 'row_added' then
        v_other := v_other + 1;
      end if;
    end loop;

    perform release_refresh_snapshot_counts(v_snapshot);
    v_note := format('Rebuilt from the Activity Log on %s, when release history was added: this test plan as it was when it left the release (%s later change%s undone%s).',
                     to_char(now(), 'DD Mon YYYY'), v_undone, case when v_undone = 1 then '' else 's' end,
                     case when v_other > 0 then format('; %s later change%s could not be undone', v_other, case when v_other = 1 then '' else 's' end) else '' end);
    update release_snapshots
       set captured_at = l.left_at, captured_by = null, captured_by_name = 'System', note = v_note
     where id = v_snapshot;
    update release_snapshot_plans set note = v_note where snapshot_id = v_snapshot;
  end loop;

  perform set_config('app.release_capture', 'off', true);
end
$backfill$;

-- ------------------------------------------------------ saved = permanent --

create or replace function release_history_immutable()
returns trigger language plpgsql as $$
begin
  -- Cascades (a whole project being deleted) and the capture functions pass.
  if pg_trigger_depth() > 1 or current_setting('app.release_capture', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Saved release history can''t be changed or deleted.';
end;
$$;

do $immutable$
declare t text;
begin
  foreach t in array array['release_decisions', 'release_snapshots', 'release_snapshot_plans',
                           'release_snapshot_runs', 'release_snapshot_cases', 'release_snapshot_activity'] loop
    execute format('drop trigger if exists %I on %I', 'trg_' || t || '_immutable', t);
    execute format('create trigger %I before update or delete on %I for each row execute function release_history_immutable()',
                   'trg_' || t || '_immutable', t);
  end loop;
end
$immutable$;

-- --------------------------------------------------------------- access --

revoke all on function person_label(uuid) from public, anon, authenticated;
revoke all on function release_refresh_snapshot_counts(uuid) from public, anon, authenticated;
revoke all on function release_capture_live_plan(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function release_copy_snapshot_plan(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function release_plan_sources(uuid) from public, anon, authenticated;
revoke all on function release_activity(uuid, timestamptz) from public, anon, authenticated;
revoke all on function release_capture_snapshot(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function release_snapshot_plan_json(uuid) from public, anon, authenticated;
revoke all on function release_live_plan_json(uuid, timestamptz) from public, anon, authenticated;
revoke all on function release_counts(uuid) from public, anon, authenticated;

revoke all on function release_report(uuid) from public, anon;
revoke all on function release_history(uuid) from public, anon;
revoke all on function set_release_status(uuid, text) from public, anon;
revoke all on function record_release_decision(uuid, text, text) from public, anon;
revoke all on function log_release_export(uuid, text, integer) from public, anon;
grant execute on function release_report(uuid) to authenticated;
grant execute on function release_history(uuid) to authenticated;
grant execute on function set_release_status(uuid, text) to authenticated;
grant execute on function record_release_decision(uuid, text, text) to authenticated;
grant execute on function log_release_export(uuid, text, integer) to authenticated;

commit;

notify pgrst, 'reload schema';
