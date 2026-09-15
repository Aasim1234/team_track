-- Simple release status on test plans, and Release Reports.
--
-- Replaces the release-level lifecycle from release_history_migration.sql with:
--
--   Test Plan -> Release Version -> Status (Active, Under Testing, Pass, Discard)
--
-- * test_plans.status holds the status; Discard needs a reason (discard_reason).
-- * Marking a test plan Pass or Discard saves its release report: the plan's
--   test cases with their results and fail/block reasons at that moment
--   (release_reports + release_report_results). Reports -> Release Reports lists
--   them. One report per test plan per release version; marking it again
--   replaces it, and moving the plan back to Active / Under Testing for the same
--   release removes it until it is marked Pass or Discard again. Moving the plan
--   to another release version keeps the earlier release's report.
-- * Permissions: changing Status needs "Change Test Plan Status" (the existing
--   test_plans.close key, relabelled); changing Release Version needs
--   "Manage Release Versions".
--
-- Earlier data: the release-level status is carried onto its test plans
-- (Testing / Completed -> Under Testing). The copies saved by the old lifecycle
-- (release_snapshots and related tables) are left untouched but no longer used,
-- pending review.

begin;

-- ------------------------------------------- retire the release lifecycle --

drop trigger if exists trg_track_release_plan_links on test_plans;
drop trigger if exists trg_track_release_plan_links_delete on test_plans;
drop function if exists track_release_plan_links();
drop function if exists release_report(uuid);
drop function if exists release_history(uuid);
drop function if exists set_release_status(uuid, text);
drop function if exists record_release_decision(uuid, text, text);
drop function if exists log_release_export(uuid, text, integer);
drop function if exists release_counts(uuid);
drop function if exists release_live_plan_json(uuid, timestamptz);
drop function if exists release_snapshot_plan_json(uuid);
drop function if exists release_capture_snapshot(uuid, text, uuid, text);
drop function if exists release_activity(uuid, timestamptz);
drop function if exists release_plan_sources(uuid);
drop function if exists release_copy_snapshot_plan(uuid, uuid, integer);
drop function if exists release_capture_live_plan(uuid, uuid, integer);
drop function if exists release_refresh_snapshot_counts(uuid);
drop function if exists audit_result_key(text);

-- ------------------------------------------------------- test plan status --

create or replace function plan_status_label(p text)
returns text language sql immutable as $$
  select case p
    when 'active' then 'Active' when 'under_testing' then 'Under Testing'
    when 'pass' then 'Pass' when 'discard' then 'Discard' else p end
$$;

do $drop_status_check$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'test_plans'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table test_plans drop constraint %I', c.conname);
  end loop;
end
$drop_status_check$;

alter table test_plans
  add column if not exists discard_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references profiles(id) on delete set null;
alter table test_plans alter column status set default 'active';

-- ------------------------------------------------------- release reports --

create table if not exists release_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  plan_id uuid references test_plans(id) on delete set null,
  release_version_id uuid references release_versions(id) on delete set null,
  release_name text not null,
  plan_name text not null,
  status text not null check (status in ('pass', 'discard')),
  discard_reason text,
  decided_by uuid references profiles(id) on delete set null,
  decided_by_name text not null,
  decided_at timestamptz not null default now(),
  total_cases integer not null default 0,
  passed integer not null default 0,
  failed integer not null default 0,
  blocked integer not null default 0,
  retest integer not null default 0,
  not_tested integer not null default 0,
  na integer not null default 0,
  pass_rate numeric(5,1) not null default 0
);
create unique index if not exists release_reports_plan_release_key on release_reports (plan_id, release_version_id);
create index if not exists idx_release_reports_project on release_reports (project_id, decided_at desc);

create table if not exists release_report_results (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references release_reports(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  test_case_id uuid,            -- the vms_test_plan_rows row this result was recorded on
  case_number bigint,
  topic text,
  scenario text,
  test_steps text,
  expected_result text,
  result text not null,
  reason text,
  recorded_by_name text,
  recorded_at timestamptz,
  assigned_to_name text,
  sort_order integer
);
create index if not exists idx_release_report_results_report on release_report_results (report_id, sort_order);

do $rls$
declare t text;
begin
  foreach t in array array['release_reports', 'release_report_results'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('create policy %I on %I for select to authenticated using (has_project_access(project_id) and ((select has_permission(''reports.view'')) or (select has_permission(''test_plans.view''))))', t || '_select', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end
$rls$;

-- Saves (or replaces) the release report for a test plan marked Pass or Discard.
-- Pass rate = passed / executed (every result except Untested), the app-wide rule.
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
         case when r.result in ('fail', 'blocked') then r.failure_comment end,
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

create or replace function sync_release_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_release text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.status in ('pass', 'discard') then
    if tg_op = 'INSERT' or new.status is distinct from old.status
       or new.release_version_id is distinct from old.release_version_id then
      perform save_release_report(new.id);
    elsif new.discard_reason is distinct from old.discard_reason then
      update release_reports set discard_reason = new.discard_reason
       where plan_id = new.id and release_version_id = new.release_version_id;
    end if;
  elsif tg_op = 'UPDATE' and old.status in ('pass', 'discard')
        and new.release_version_id is not distinct from old.release_version_id then
    -- Back to Active / Under Testing for the same release: not a finished report yet.
    delete from release_reports
     where plan_id = new.id and release_version_id = new.release_version_id
    returning release_name into v_release;
    if found then
      perform audit_write(new.project_id, 'release_report_removed', 'test_plan', new.id, new.name, new.id, new.name,
        'Release Report', 'Release ' || v_release, null,
        format('Status changed to %s, so the report was removed from Reports until the plan is marked Pass or Discard again.',
               plan_status_label(new.status)),
        null);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_release_report on test_plans;
create trigger trg_sync_release_report
  after insert or update of status, release_version_id, discard_reason on test_plans
  for each row execute function sync_release_report();

create or replace function log_release_report_export(p_report_id uuid, p_filename text)
returns void language plpgsql security definer set search_path = public as $$
declare
  rr release_reports;
begin
  if not has_permission('reports.export') then
    raise exception 'You don''t have permission to export reports.';
  end if;
  select * into rr from release_reports where id = p_report_id;
  if rr.id is null or not has_project_access(rr.project_id) then
    raise exception 'This release report doesn''t exist or you don''t have access to it.';
  end if;
  perform audit_write(rr.project_id, 'report_exported', 'report', rr.id, left(coalesce(p_filename, ''), 200),
    rr.plan_id, rr.plan_name, 'Format', null, 'XLSX',
    format('Release %s report · %s · %s test cases', rr.release_name, plan_status_label(rr.status), rr.total_cases),
    null);
end;
$$;

-- ----------------------------------------------------------------- guards --

create or replace function test_plan_access_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_release release_versions;
begin
  new.status := coalesce(new.status, 'active');
  if new.status = 'discard' then
    new.discard_reason := nullif(btrim(coalesce(new.discard_reason, '')), '');
  else
    new.discard_reason := null;
  end if;

  if tg_op = 'INSERT' then
    if v_actor is not null then
      new.created_by := v_actor;
      if new.release_version_id is null then
        raise exception 'Choose the release version this test plan is for.';
      end if;
      if new.status in ('pass', 'discard') then
        raise exception 'A new test plan starts as Active or Under Testing.';
      end if;
    end if;
    if new.release_version_id is not null then
      select * into v_release from release_versions where id = new.release_version_id;
      if v_release.project_id is distinct from new.project_id then
        raise exception 'That release version belongs to a different project.';
      end if;
    end if;
    new.status_changed_at := now();
    new.status_changed_by := v_actor;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := v_actor;
  else
    new.status_changed_at := old.status_changed_at;
    new.status_changed_by := old.status_changed_by;
  end if;

  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.status = 'discard' and new.discard_reason is null then
    raise exception 'Enter the reason for discarding this test plan.';
  end if;
  if new.status in ('pass', 'discard') and new.release_version_id is null then
    raise exception 'Set this test plan''s release version before marking it Pass or Discard.';
  end if;

  if v_actor is null then
    return new;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if (new.name, new.description, new.owner_id, new.target_date, new.project_id)
     is distinct from (old.name, old.description, old.owner_id, old.target_date, old.project_id)
     and not has_permission('test_plans.edit') then
    raise exception 'You don''t have permission to edit test plans.';
  end if;

  if (new.status, new.discard_reason) is distinct from (old.status, old.discard_reason)
     and not has_permission('test_plans.close') then
    raise exception 'You don''t have permission to change a test plan''s status.';
  end if;

  if new.release_version_id is distinct from old.release_version_id then
    if not has_permission('releases.manage') then
      raise exception 'You don''t have permission to change a test plan''s release version.';
    end if;
    if new.release_version_id is null then
      raise exception 'A test plan''s release version can be changed, but not removed.';
    end if;
    select * into v_release from release_versions where id = new.release_version_id;
    if v_release.project_id is distinct from new.project_id then
      raise exception 'That release version belongs to a different project.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function audit_test_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rows integer;
  v_old_owner text;
  v_new_owner text;
  v_old_release text;
  v_new_release text;
begin
  if tg_op = 'INSERT' then
    select name into v_new_release from release_versions where id = new.release_version_id;
    perform audit_write(new.project_id, 'plan_created', 'test_plan', new.id, new.name, new.id, new.name,
                        case when v_new_release is not null then 'Release Version' end, null, v_new_release, null, null);
    return new;
  end if;

  -- Runs BEFORE the delete, while the plan's rows can still be counted.
  if tg_op = 'DELETE' then
    select count(*) into v_rows from vms_test_plan_rows where plan_id = old.id;
    perform audit_write(old.project_id, 'plan_deleted', 'test_plan', old.id, old.name, old.id, old.name,
      null, null, null,
      format('%s row%s removed with the plan', v_rows, case when v_rows = 1 then '' else 's' end), null);
    return old;
  end if;

  if new.name is distinct from old.name then
    perform audit_write(new.project_id, 'plan_edited', 'test_plan', new.id, new.name, new.id, new.name,
      'Name', old.name, new.name, null, null);
  end if;
  if new.description is distinct from old.description then
    perform audit_write(new.project_id, 'plan_edited', 'test_plan', new.id, new.name, new.id, new.name,
      'Description', old.description, new.description, null, null);
  end if;
  if new.target_date is distinct from old.target_date then
    perform audit_write(new.project_id, 'plan_edited', 'test_plan', new.id, new.name, new.id, new.name,
      'Target date', to_char(old.target_date, 'DD Mon YYYY'), to_char(new.target_date, 'DD Mon YYYY'), null, null);
  end if;
  if new.owner_id is distinct from old.owner_id then
    select coalesce(nullif(name, ''), email) into v_old_owner from profiles where id = old.owner_id;
    select coalesce(nullif(name, ''), email) into v_new_owner from profiles where id = new.owner_id;
    perform audit_write(new.project_id, 'plan_edited', 'test_plan', new.id, new.name, new.id, new.name,
      'Owner', v_old_owner, v_new_owner, null, null);
  end if;
  -- Cascades (e.g. a whole project being deleted) aren't release decisions.
  if new.release_version_id is distinct from old.release_version_id and pg_trigger_depth() = 1 then
    select name into v_old_release from release_versions where id = old.release_version_id;
    select name into v_new_release from release_versions where id = new.release_version_id;
    perform audit_write(new.project_id, 'release_version_changed', 'test_plan', new.id, new.name, new.id, new.name,
      'Release Version', v_old_release, v_new_release, null, null);
  end if;

  select name into v_new_release from release_versions where id = new.release_version_id;
  if new.status is distinct from old.status then
    perform audit_write(new.project_id, 'plan_status_changed', 'test_plan', new.id, new.name, new.id, new.name,
      'Status', plan_status_label(old.status), plan_status_label(new.status),
      concat_ws(' · ', 'Release ' || v_new_release, case when new.status = 'discard' then 'Reason: ' || new.discard_reason end),
      null);
  elsif new.discard_reason is distinct from old.discard_reason then
    perform audit_write(new.project_id, 'plan_status_changed', 'test_plan', new.id, new.name, new.id, new.name,
      'Discard Reason', old.discard_reason, new.discard_reason, 'Release ' || v_new_release, null);
  end if;

  return new;
end;
$$;

-- ------------------------------------------- carry release status onto plans --

update test_plans tp
   set status = case when rv.status in ('testing', 'completed') then 'under_testing' else 'active' end
  from release_versions rv
 where rv.id = tp.release_version_id
   and tp.status is distinct from (case when rv.status in ('testing', 'completed') then 'under_testing' else 'active' end);
update test_plans set status = 'active' where status not in ('active', 'under_testing', 'pass', 'discard');

alter table test_plans add constraint test_plans_status_check
  check (status in ('active', 'under_testing', 'pass', 'discard'));
alter table test_plans add constraint test_plans_discard_reason_check
  check (case when status = 'discard' then coalesce(discard_reason ~ '[^[:space:]]', false)
              else discard_reason is null end);

-- ------------------------------------------------------ release versions --

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
      if exists (select 1 from release_reports where release_version_id = old.id) then
        raise exception 'Release version % has release reports, so it can''t be deleted.', old.name;
      end if;
      if exists (select 1 from release_snapshots where release_version_id = old.id) then
        raise exception 'Release version % has saved report copies awaiting review, so it can''t be deleted yet.', old.name;
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
  elsif pg_trigger_depth() = 1 and v_actor is not null then
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

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
    -- Every test plan in this release now shows the new version, so each gets its own record.
    for p in select id, name from test_plans where release_version_id = new.id order by name loop
      perform audit_write(new.project_id, 'release_version_changed', 'test_plan', p.id, p.name, p.id, p.name,
                          'Release Version', old.name, new.name, 'Release version renamed', null);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_release_version on release_versions;
create trigger trg_audit_release_version
  after insert or update of name or delete on release_versions
  for each row execute function audit_release_version();

drop function if exists release_label(text);
drop table if exists release_decisions;   -- never used: no release decision was recorded

alter table release_versions
  drop constraint if exists release_versions_status_check,
  drop constraint if exists release_versions_decision_check,
  drop constraint if exists release_versions_discard_reason_check,
  drop column if exists status,
  drop column if exists decision,
  drop column if exists discard_reason,
  drop column if exists release_date,
  drop column if exists updated_at,
  drop column if exists updated_by,
  drop column if exists testing_started_at,
  drop column if exists completed_at,
  drop column if exists completed_by,
  drop column if exists decided_at,
  drop column if exists decided_by;

revoke update on release_versions from authenticated;
grant update (name) on release_versions to authenticated;

-- ------------------------------------------------------------ permissions --

alter table role_permissions disable trigger user;
delete from role_permissions where permission_key = 'releases.decide';
alter table role_permissions enable trigger user;
delete from permissions where key = 'releases.decide';

update permissions
   set label = 'Change Test Plan Status',
       description = 'Set a test plan''s status: Active, Under Testing, Pass or Discard. Pass and Discard save the plan''s release report to Reports.'
 where key = 'test_plans.close';
update permissions
   set description = 'Create, rename and delete release versions, and change which release version a test plan is for.'
 where key = 'releases.manage';

-- --------------------------------------------------------------- archive --

comment on table release_snapshots is
  'Not used by the app since the simple release status (release_status_migration.sql). Holds copies saved by the earlier release lifecycle, kept for review.';
comment on table release_plan_links is
  'Not used by the app since the simple release status (release_status_migration.sql). Kept with release_snapshots for review.';

revoke all on function save_release_report(uuid) from public, anon, authenticated;
revoke all on function sync_release_report() from public, anon, authenticated;
revoke all on function log_release_report_export(uuid, text) from public, anon;
grant execute on function log_release_report_export(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
