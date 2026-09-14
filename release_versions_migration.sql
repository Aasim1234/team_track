-- Release Versions for test plans.
--
-- A release version (e.g. "12.70") is its own record per project, separate
-- from test plan names, so one release can hold many test plans. Every new
-- test plan must be linked to a release version chosen by the user; nothing is
-- generated or changed automatically. Existing test plans stay unlinked until
-- someone picks their release.
--
-- Permission "Manage Release Versions" (releases.manage) is needed to create,
-- rename or delete release versions and to change which release a test plan
-- belongs to. Admins have it; Managers get it by default. Everyone who can see
-- test plans can see their release version.
--
-- Activity log: release changes on a test plan (old -> new), and creating,
-- renaming (with every affected test plan) and deleting release versions.

begin;

-- ---------------------------------------------------------------- table --

create table if not exists release_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists release_versions_project_name_key on release_versions (project_id, lower(btrim(name)));
alter table release_versions enable row level security;

alter table test_plans add column if not exists release_version_id uuid references release_versions(id) on delete set null;
create index if not exists idx_test_plans_release_version on test_plans (release_version_id);

-- ----------------------------------------------------------- permission --

insert into permissions (key, category, label, description, sort_order) values
  ('releases.manage', 'Test Plans', 'Manage Release Versions',
   'Create, rename and delete release versions, and change which release a test plan belongs to.', 245)
on conflict (key) do update
  set category = excluded.category, label = excluded.label,
      description = excluded.description, sort_order = excluded.sort_order;

-- Built-in grants (Admin shows every permission; Manager gets this one).
alter table role_permissions disable trigger user;
insert into role_permissions (role_id, permission_key)
select r.id, 'releases.manage' from roles r where r.key in ('admin', 'manager')
on conflict do nothing;
alter table role_permissions enable trigger user;

-- --------------------------------------------------------- access rules --

drop policy if exists release_versions_select on release_versions;
drop policy if exists release_versions_insert on release_versions;
drop policy if exists release_versions_update on release_versions;
drop policy if exists release_versions_delete on release_versions;
create policy release_versions_select on release_versions for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_plans.view')));
create policy release_versions_insert on release_versions for insert to authenticated
  with check (has_project_access(project_id) and (select has_permission('releases.manage')));
create policy release_versions_update on release_versions for update to authenticated
  using (has_project_access(project_id) and (select has_permission('releases.manage')));
create policy release_versions_delete on release_versions for delete to authenticated
  using (has_project_access(project_id) and (select has_permission('releases.manage')));

revoke all on release_versions from anon, authenticated;
grant select, delete on release_versions to authenticated;
grant insert (project_id, name), update (name) on release_versions to authenticated;

-- Changing only a plan's release needs Manage Release Versions, not Edit Test Plan.
drop policy if exists test_plans_update on test_plans;
create policy test_plans_update on test_plans for update to authenticated
  using (has_project_access(project_id) and (
    (select has_permission('test_plans.edit')) or (select has_permission('test_plans.close'))
    or (select has_permission('releases.manage'))));

-- --------------------------------------------------------------- guards --

create or replace function release_version_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_plans integer;
begin
  if tg_op = 'DELETE' then
    -- A project being deleted takes its releases with it; otherwise a release
    -- still in use must be emptied first.
    if pg_trigger_depth() = 1 then
      select count(*) into v_plans from test_plans where release_version_id = old.id;
      if v_plans > 0 then
        raise exception 'Release version % is still used by % test plan%. Move them to another release version first.',
          old.name, v_plans, case when v_plans = 1 then '' else 's' end;
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

drop trigger if exists trg_release_version_guard on release_versions;
create trigger trg_release_version_guard
  before insert or update or delete on release_versions
  for each row execute function release_version_guard();

create or replace function test_plan_access_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
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
    if new.release_version_id is not null and not exists (
      select 1 from release_versions where id = new.release_version_id and project_id = new.project_id) then
      raise exception 'That release version belongs to a different project.';
    end if;
    return new;
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
    if not exists (select 1 from release_versions where id = new.release_version_id and project_id = new.project_id) then
      raise exception 'That release version belongs to a different project.';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------- activity log --

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
  -- Cascades (e.g. a whole project being deleted) aren't release decisions.
  if new.release_version_id is distinct from old.release_version_id and pg_trigger_depth() = 1 then
    select name into v_old_release from release_versions where id = old.release_version_id;
    select name into v_new_release from release_versions where id = new.release_version_id;
    perform audit_write(new.project_id, 'release_version_changed', 'test_plan', new.id, new.name, new.id, new.name,
      'Release Version', v_old_release, v_new_release, null, null);
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

commit;

notify pgrst, 'reload schema';
