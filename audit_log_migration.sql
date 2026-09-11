-- Activity / audit log: an append-only record of who changed what, and when.
--
-- Entries are written by the database itself: triggers on the tables people
-- change, plus one narrow function for exports (which happen in the browser).
-- The person is taken from the logged-in session (auth.uid()), never from the
-- client, so it cannot be spoofed. The app can read this table but has no
-- permission to insert, edit or delete, and a guard trigger rejects UPDATE,
-- DELETE and TRUNCATE outright, so history cannot be rewritten through the app
-- or the API.
--
-- Deliberately no foreign keys: the log must outlive the users, plans and rows
-- it describes, so names and titles are stored as they were at the time.

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  project_id uuid,
  actor_id uuid,
  actor_name text not null,
  action text not null,
  entity_type text not null,    -- test_case | test_plan | member | report
  entity_id uuid,
  entity_label text,
  plan_id uuid,
  plan_name text,
  field text,
  old_value text,
  new_value text,
  comment text,
  result text                   -- the result status involved, for filtering
);

create index if not exists idx_audit_log_project_time on audit_log (project_id, occurred_at desc, id desc);
create index if not exists idx_audit_log_actor on audit_log (project_id, actor_id);
create index if not exists idx_audit_log_plan on audit_log (project_id, plan_id);
create index if not exists idx_audit_log_action on audit_log (project_id, action);

-- ------------------------------------------------------------------ guard --

create or replace function audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'The activity log is append-only: entries cannot be changed or deleted.';
end;
$$;

drop trigger if exists trg_audit_log_no_update on audit_log;
create trigger trg_audit_log_no_update
  before update or delete on audit_log
  for each row execute function audit_log_immutable();

drop trigger if exists trg_audit_log_no_truncate on audit_log;
create trigger trg_audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function audit_log_immutable();

alter table audit_log enable row level security;

drop policy if exists "audit_log_select" on audit_log;
create policy "audit_log_select" on audit_log
  for select using (has_project_access(project_id));

-- No insert/update/delete policies, and no such grants either: read-only.
revoke all on audit_log from anon, authenticated;
grant select on audit_log to authenticated;

-- ----------------------------------------------------------------- writer --

create or replace function audit_result_label(p text)
returns text language sql immutable as $$
  select case p
    when 'not_tested' then 'Untested' when 'pass' then 'Pass' when 'fail' then 'Fail'
    when 'blocked' then 'Blocked' when 'retest' then 'Retest' when 'na' then 'N/A'
    else p end
$$;

-- The only way rows get into audit_log. Not callable from the app; triggers
-- and log_export (both owned by the database) call it.
create or replace function audit_write(
  p_project uuid, p_action text, p_entity_type text, p_entity_id uuid, p_entity_label text,
  p_plan_id uuid, p_plan_name text, p_field text, p_old text, p_new text, p_comment text, p_result text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_name text;
begin
  if v_actor is not null then
    select coalesce(nullif(name, ''), email) into v_name from profiles where id = v_actor;
  end if;
  insert into audit_log (project_id, actor_id, actor_name, action, entity_type, entity_id, entity_label,
                         plan_id, plan_name, field, old_value, new_value, comment, result)
  values (p_project, v_actor, coalesce(v_name, 'System'), p_action, p_entity_type, p_entity_id,
          left(p_entity_label, 500), p_plan_id, p_plan_name, p_field, p_old, p_new, p_comment, p_result);
end;
$$;

revoke all on function audit_write(uuid, text, text, uuid, text, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ------------------------------------------------- VMS test plan rows ------

create or replace function audit_vms_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r vms_test_plan_rows;
  v_plan_name text;
  v_label text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select name into v_plan_name from test_plans where id = r.plan_id;

  -- Rows removed because their whole plan was deleted are covered by the one
  -- "deleted test plan" entry, not one entry per row.
  if tg_op = 'DELETE' and v_plan_name is null then return old; end if;

  v_label := coalesce(nullif(btrim(r.scenario), ''), nullif(btrim(r.topic), ''), '(blank row)');

  if tg_op = 'INSERT' then
    perform audit_write(new.project_id, 'row_added', 'test_case', new.id, v_label, new.plan_id, v_plan_name,
                        null, null, null, null, new.result);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform audit_write(old.project_id, 'row_deleted', 'test_case', old.id, v_label, old.plan_id, v_plan_name,
                        null, null, null, null, old.result);
    return old;
  end if;

  if new.result is distinct from old.result then
    perform audit_write(new.project_id, 'result_changed', 'test_case', new.id, v_label, new.plan_id, v_plan_name,
      'Result', audit_result_label(old.result), audit_result_label(new.result),
      case when new.result = 'fail' then new.failure_comment
           when old.result = 'fail' and old.failure_comment is not null then 'Previous failure reason: ' || old.failure_comment
      end,
      new.result);
  elsif new.result = 'fail' and new.failure_comment is distinct from old.failure_comment then
    perform audit_write(new.project_id, 'failure_comment_edited', 'test_case', new.id, v_label, new.plan_id, v_plan_name,
      'Failure reason', old.failure_comment, new.failure_comment, null, new.result);
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

drop trigger if exists trg_audit_vms_row on vms_test_plan_rows;
create trigger trg_audit_vms_row
  after insert or update or delete on vms_test_plan_rows
  for each row execute function audit_vms_row();

-- ------------------------------------------------------------ test plans --

create or replace function audit_test_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rows integer;
  v_old_owner text;
  v_new_owner text;
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.project_id, 'plan_created', 'test_plan', new.id, new.name, new.id, new.name,
                        null, null, null, null, null);
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
  if new.status is distinct from old.status then
    perform audit_write(new.project_id, 'plan_edited', 'test_plan', new.id, new.name, new.id, new.name,
      'Status', initcap(old.status), initcap(new.status), null, null);
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

  return new;
end;
$$;

drop trigger if exists trg_audit_test_plan on test_plans;
create trigger trg_audit_test_plan
  after insert or update on test_plans
  for each row execute function audit_test_plan();

drop trigger if exists trg_audit_test_plan_delete on test_plans;
create trigger trg_audit_test_plan_delete
  before delete on test_plans
  for each row execute function audit_test_plan();

-- ------------------------------------------------------- project members --

create or replace function audit_project_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m project_members;
  v_label text;
begin
  if tg_op = 'DELETE' then m := old; else m := new; end if;
  select coalesce(nullif(name, ''), email) into v_label from profiles where id = m.user_id;
  v_label := coalesce(v_label, 'Removed user');

  if tg_op = 'INSERT' then
    perform audit_write(m.project_id, 'member_added', 'member', m.user_id, v_label, null, null,
                        'Role', null, initcap(m.role), null, null);
  elsif tg_op = 'DELETE' then
    perform audit_write(m.project_id, 'member_removed', 'member', m.user_id, v_label, null, null,
                        'Role', initcap(m.role), null, null, null);
  elsif new.role is distinct from old.role then
    perform audit_write(m.project_id, 'role_changed', 'member', m.user_id, v_label, null, null,
                        'Role', initcap(old.role), initcap(new.role), null, null);
  end if;
  return m;
end;
$$;

drop trigger if exists trg_audit_project_member on project_members;
create trigger trg_audit_project_member
  after insert or update or delete on project_members
  for each row execute function audit_project_member();

-- ---------------------------------------------------------------- exports --

-- Exports happen in the browser, so the app reports them here. The database
-- still stamps who and when, checks access to the plan, and only accepts an
-- export entry, so this cannot be used to write anything else into the log.
create or replace function log_export(
  p_plan_id uuid, p_format text, p_filename text, p_row_count integer,
  p_include_failure_comments boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_plan test_plans;
begin
  select * into v_plan from test_plans where id = p_plan_id;
  if v_plan.id is null then raise exception 'Unknown test plan'; end if;
  if not has_project_access(v_plan.project_id) then raise exception 'Not allowed'; end if;
  if lower(p_format) not in ('xlsx', 'csv') then raise exception 'Unsupported export format'; end if;

  perform audit_write(v_plan.project_id, 'report_exported', 'report', v_plan.id,
    left(coalesce(p_filename, ''), 200), v_plan.id, v_plan.name, 'Format', null, upper(p_format),
    format('%s row%s%s', p_row_count, case when p_row_count = 1 then '' else 's' end,
           case when p_include_failure_comments then ', with failure comments' else '' end),
    null);
end;
$$;

revoke all on function log_export(uuid, text, text, integer, boolean) from public, anon;
grant execute on function log_export(uuid, text, text, integer, boolean) to authenticated;

-- ------------------------------------------------------ filter options --

-- Distinct people and plans that appear in the log (latest name wins), so the
-- filters also cover users and plans that have since been removed.
create or replace view audit_log_facets with (security_invoker = true) as
select distinct on (project_id, kind, value) project_id, kind, value, label
from (
  select project_id, 'user'::text as kind, coalesce(actor_id::text, 'system') as value, actor_name as label, occurred_at
  from audit_log
  union all
  select project_id, 'plan', plan_id::text, plan_name, occurred_at
  from audit_log where plan_id is not null
) f
order by project_id, kind, value, occurred_at desc;

revoke all on audit_log_facets from anon, authenticated;
grant select on audit_log_facets to authenticated;

-- --------------------------------------------- one log from here onwards --

-- Result history used to go to vms_test_plan_row_history. The audit log now
-- records it, so this trigger keeps only its other job: stamping who failed a
-- row and when, and clearing stale failure details once a row is no longer
-- failed. The old table is left untouched as the record of earlier changes.
create or replace function vms_row_result_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
begin
  if new.result = 'fail' then
    if old.result is distinct from 'fail'
       or new.failure_comment is distinct from old.failure_comment then
      new.failed_by := coalesce(actor, old.failed_by);
      new.failed_at := now();
    end if;
  else
    new.failure_comment := null;
    new.failed_by := null;
    new.failed_at := null;
  end if;
  return new;
end;
$$;

-- Carry over the real result changes recorded before this log existed, with
-- their original people and times. Safe to re-run: already-copied entries skip.
insert into audit_log (occurred_at, project_id, actor_id, actor_name, action, entity_type, entity_id,
                       entity_label, plan_id, plan_name, field, old_value, new_value, comment, result)
select h.changed_at, h.project_id, h.changed_by,
       coalesce(nullif(p.name, ''), p.email, 'System'),
       'result_changed', 'test_case', h.row_id,
       coalesce(nullif(btrim(r.scenario), ''), nullif(btrim(r.topic), ''), '(blank row)'),
       r.plan_id, tp.name, 'Result',
       audit_result_label(h.old_result), audit_result_label(h.new_result),
       case when h.new_result = 'fail' then h.failure_comment
            when h.old_result = 'fail' and h.failure_comment is not null then 'Previous failure reason: ' || h.failure_comment
       end,
       h.new_result
from vms_test_plan_row_history h
left join profiles p on p.id = h.changed_by
left join vms_test_plan_rows r on r.id = h.row_id
left join test_plans tp on tp.id = r.plan_id
where not exists (
  select 1 from audit_log a
  where a.entity_id = h.row_id and a.occurred_at = h.changed_at and a.action = 'result_changed'
)
order by h.changed_at;
