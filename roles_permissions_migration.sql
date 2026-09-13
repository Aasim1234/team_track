-- User Roles & Permissions.
--
-- Every user has one app-wide role (profiles.role_id). A role is a set of
-- permissions (role_permissions); Admin always has every permission. The four
-- built-in roles (Admin, Manager, Tester, Viewer) are fixed. Admins can create
-- custom roles and choose exactly which permissions they have.
--
-- All of it is enforced here, in the database. Row-level security on every
-- table decides who may read, add, change or delete rows, and guard triggers
-- check the finer rules (edit vs execute vs assign on a test case, completing
-- a test plan, changing roles). The app hides what a user can't do, but hiding
-- is not what protects the data.
--
-- Safety rules for roles and permissions:
--   * nobody can change their own role or their own role's permissions;
--   * only an Admin can give or take away the Admin role;
--   * a non-Admin can only grant permissions, or assign roles, within what
--     they already have themselves;
--   * there is always at least one Admin.
-- Role, permission and group changes are written to the activity log.
--
-- The whole file runs as one transaction: access rules are dropped and
-- recreated, so it must apply completely or not at all.

begin;

-- ----------------------------------------------------------- catalogue --

create table if not exists permissions (
  key text primary key,
  category text not null,
  label text not null,
  description text not null default '',
  sort_order integer not null
);

insert into permissions (key, category, label, description, sort_order) values
  ('test_cases.view',          'Test Cases',     'View Test Cases',          'See test cases and their results.', 100),
  ('test_cases.create',        'Test Cases',     'Add Test Case',            'Add new test cases to a test plan.', 110),
  ('test_cases.edit',          'Test Cases',     'Edit Test Case',           'Change a test case''s topic, scenario, steps and expected result.', 120),
  ('test_cases.delete',        'Test Cases',     'Delete Test Case',         'Permanently remove test cases.', 130),
  ('test_cases.assign',        'Test Cases',     'Assign Test Case',         'Assign test cases to anyone, reassign them, and override other people''s assignments.', 140),
  ('test_cases.self_assign',   'Test Cases',     'Assign to Me',             'Take an unassigned test case for yourself.', 150),
  ('test_cases.execute',       'Test Cases',     'Execute Test Case',        'Run test cases assigned to you: record results and fail/block reasons, and complete the task.', 160),
  ('test_cases.execute_any',   'Test Cases',     'Execute Any Test Case',    'Also run test cases that aren''t assigned to you.', 170),
  ('test_plans.view',          'Test Plans',     'View Test Plans',          'See test plans.', 200),
  ('test_plans.create',        'Test Plans',     'Create Test Plan',         'Create new test plans.', 210),
  ('test_plans.edit',          'Test Plans',     'Edit Test Plan',           'Change a test plan''s name, description, owner, target date and status.', 220),
  ('test_plans.delete',        'Test Plans',     'Delete Test Plan',         'Delete test plans and everything in them.', 230),
  ('test_plans.close',         'Test Plans',     'Complete/Close Test Plan', 'Mark a test plan as completed, or reopen it.', 240),
  ('test_runs.view',           'Test Runs',      'View Test Runs',           'See test runs.', 300),
  ('test_runs.create',         'Test Runs',      'Create Test Run',          'Create new test runs.', 310),
  ('test_runs.edit',           'Test Runs',      'Edit Test Run',            'Change test runs, their cases, and which test plan they belong to.', 320),
  ('test_runs.delete',         'Test Runs',      'Delete Test Run',          'Delete test runs.', 325),
  ('test_runs.execute',        'Test Runs',      'Execute Tests',            'Work through the cases in a test run.', 330),
  ('test_runs.update_results', 'Test Runs',      'Update Test Results',      'Record results in test runs.', 340),
  ('projects.view',            'Projects',       'View Project',             'Open the projects you are a member of.', 400),
  ('projects.create',          'Projects',       'Create Project',           'Create new projects.', 410),
  ('projects.edit',            'Projects',       'Edit Project',             'Rename projects and change their details.', 420),
  ('projects.delete',          'Projects',       'Delete Project',           'Delete projects and everything in them.', 430),
  ('reports.view',             'Reports',        'View Reports',             'Open reports and coverage.', 500),
  ('reports.create',           'Reports',        'Create Reports',           'Create reports.', 510),
  ('reports.export',           'Reports',        'Export Reports',           'Export test plans and reports to Excel or CSV.', 520),
  ('users.view',               'Users & Roles',  'View Users',               'See users, groups and roles.', 600),
  ('users.add',                'Users & Roles',  'Add Users',                'Give users access to projects.', 610),
  ('users.edit',               'Users & Roles',  'Edit Users',               'Edit user details, project access and groups.', 620),
  ('users.assign_roles',       'Users & Roles',  'Assign Roles',             'Change which role a user has.', 630),
  ('roles.manage',             'Users & Roles',  'Manage Permissions',       'Create custom roles and choose their permissions.', 640),
  ('admin.settings',           'Administration', 'Manage Settings',          'Change site settings and customizations.', 700),
  ('admin.integrations',       'Administration', 'Manage Integrations',      'Link and unlink repositories and other integrations.', 710),
  ('admin.data',               'Administration', 'Manage Data/Exports',      'Manage stored files and bulk data exports.', 720),
  ('admin.audit_logs',         'Administration', 'View Activity/Audit Logs', 'Read the activity and audit log.', 730)
on conflict (key) do update
  set category = excluded.category, label = excluded.label,
      description = excluded.description, sort_order = excluded.sort_order;

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  key text unique,                       -- set for built-in roles only
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists roles_name_key on roles (lower(name));

insert into roles (key, name, description, is_system) values
  ('admin',   'Admin',   'Full access to the entire application.', true),
  ('manager', 'Manager', 'Manages test plans, test runs, test cases and assignments, and views reports. Cannot manage system settings, users or roles.', true),
  ('tester',  'Tester',  'Works on test cases assigned to them: executes them, records results and fail/block reasons, and completes tasks.', true),
  ('viewer',  'Viewer',  'Read-only access. Cannot create, edit, delete, assign or execute anything.', true)
on conflict (key) do update
  set name = excluded.name, description = excluded.description, is_system = true;

create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

-- Built-in role grants. Re-running this file resets them to exactly this list
-- without writing activity log entries.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_audit_role_permission') then
    alter table role_permissions disable trigger user;
  end if;
end $$;

delete from role_permissions rp using roles r where rp.role_id = r.id and r.is_system;

insert into role_permissions (role_id, permission_key)
select r.id, p.key from roles r cross join permissions p where r.key = 'admin';

insert into role_permissions (role_id, permission_key)
select r.id, g.permission_key
from (values
  ('manager', 'test_cases.view'), ('manager', 'test_cases.create'), ('manager', 'test_cases.edit'),
  ('manager', 'test_cases.delete'), ('manager', 'test_cases.assign'), ('manager', 'test_cases.self_assign'),
  ('manager', 'test_cases.execute'), ('manager', 'test_cases.execute_any'),
  ('manager', 'test_plans.view'), ('manager', 'test_plans.create'), ('manager', 'test_plans.edit'),
  ('manager', 'test_plans.delete'), ('manager', 'test_plans.close'),
  ('manager', 'test_runs.view'), ('manager', 'test_runs.create'), ('manager', 'test_runs.edit'),
  ('manager', 'test_runs.delete'), ('manager', 'test_runs.execute'), ('manager', 'test_runs.update_results'),
  ('manager', 'projects.view'),
  ('manager', 'reports.view'), ('manager', 'reports.create'), ('manager', 'reports.export'),
  ('manager', 'users.view'),
  ('manager', 'admin.audit_logs'),

  ('tester', 'test_cases.view'), ('tester', 'test_cases.self_assign'), ('tester', 'test_cases.execute'),
  ('tester', 'test_plans.view'),
  ('tester', 'test_runs.view'), ('tester', 'test_runs.execute'), ('tester', 'test_runs.update_results'),
  ('tester', 'projects.view'),
  ('tester', 'reports.view'),

  ('viewer', 'test_cases.view'), ('viewer', 'test_plans.view'), ('viewer', 'test_runs.view'),
  ('viewer', 'projects.view'), ('viewer', 'reports.view')
) as g(role_key, permission_key)
join roles r on r.key = g.role_key;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_audit_role_permission') then
    alter table role_permissions enable trigger user;
  end if;
end $$;

-- ---------------------------------------------------------- user roles --

alter table profiles add column if not exists role_id uuid references roles(id);

-- Existing users keep the access they have today: their strongest project
-- role becomes their app role (admin -> Admin, lead -> Manager, tester ->
-- Tester, viewer -> Viewer). Anyone without a membership starts as Tester.
update profiles p
set role_id = (select id from roles where key = coalesce((
  select case
           when bool_or(pm.role = 'admin') then 'admin'
           when bool_or(pm.role = 'lead') then 'manager'
           when bool_or(pm.role = 'tester') then 'tester'
           when bool_or(pm.role = 'viewer') then 'viewer'
         end
  from project_members pm where pm.user_id = p.id), 'tester'))
where p.role_id is null;

alter table profiles alter column role_id set not null;
create index if not exists idx_profiles_role on profiles (role_id);

-- project_members.role is no longer used for permissions; it only needs a value.
alter table project_members alter column role set default 'tester';

-- ------------------------------------------------------------- groups --

create table if not exists user_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists user_groups_name_key on user_groups (lower(name));

create table if not exists user_group_members (
  group_id uuid not null references user_groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table permissions enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table user_groups enable row level security;
alter table user_group_members enable row level security;

-- ------------------------------------------------------------ helpers --

create or replace function is_app_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles p join roles r on r.id = p.role_id
    where p.id = auth.uid() and r.key = 'admin'
  );
$$;

create or replace function has_permission(p_key text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles p join roles r on r.id = p.role_id
    where p.id = auth.uid()
      and (r.key = 'admin'
           or exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_key = p_key))
  );
$$;

-- What the app needs to know about the signed-in user, in one call.
create or replace function my_permissions()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'role', jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name),
    'is_admin', r.key = 'admin',
    'permissions', coalesce((
      select jsonb_agg(pm.key order by pm.sort_order)
      from permissions pm
      where r.key = 'admin'
         or exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_key = pm.key)
    ), '[]'::jsonb))
  from profiles p join roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

-- Admins can open every project; everyone else needs to be a member.
create or replace function has_project_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from project_members where project_id = p_project_id and user_id = auth.uid())
      or is_app_admin();
$$;

revoke all on function is_app_admin() from anon;
revoke all on function has_permission(text) from anon;
revoke all on function my_permissions() from anon;

-- --------------------------------------------------- profiles (users) --

create or replace function profile_access_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old_key text;
  v_new_key text;
begin
  if tg_op = 'INSERT' then
    if new.role_id is null then
      new.role_id := (select id from roles where key = 'tester');
    end if;
    return new;
  end if;

  new.id := old.id;
  -- System changes and cascades (e.g. clearing references to a deleted role
  -- creator) are not restricted.
  if v_actor is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  new.email := old.email;
  new.created_at := old.created_at;
  new.role := old.role;

  if new.name is distinct from old.name and old.id <> v_actor and not has_permission('users.edit') then
    raise exception 'You don''t have permission to edit other users.';
  end if;

  if new.role_id is distinct from old.role_id then
    if old.id = v_actor then
      raise exception 'You can''t change your own role.';
    end if;
    if not has_permission('users.assign_roles') then
      raise exception 'You don''t have permission to assign roles.';
    end if;
    if new.role_id is null then
      raise exception 'Every user needs a role.';
    end if;
    select key into v_old_key from roles where id = old.role_id;
    select key into v_new_key from roles where id = new.role_id;
    if (v_old_key = 'admin' or v_new_key = 'admin') and not is_app_admin() then
      raise exception 'Only an Admin can give or remove the Admin role.';
    end if;
    if not is_app_admin() and exists (
      select 1 from role_permissions rp where rp.role_id = new.role_id and not has_permission(rp.permission_key)) then
      raise exception 'You can only assign roles whose permissions you have yourself.';
    end if;
    if v_old_key = 'admin' and v_new_key is distinct from 'admin' and not exists (
      select 1 from profiles p join roles r on r.id = p.role_id where r.key = 'admin' and p.id <> old.id) then
      raise exception 'At least one Admin is required.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profile_access_guard on profiles;
create trigger trg_profile_access_guard
  before insert or update on profiles
  for each row execute function profile_access_guard();

create or replace function audit_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text := coalesce(nullif(new.name, ''), new.email);
  v_old text;
  v_new text;
begin
  select name into v_new from roles where id = new.role_id;
  if tg_op = 'INSERT' then
    perform audit_write(null, 'user_joined', 'user', new.id, v_label, null, null, 'Role', null, v_new, 'Signed up', null);
  elsif new.role_id is distinct from old.role_id then
    select name into v_old from roles where id = old.role_id;
    perform audit_write(null, 'role_assigned', 'user', new.id, v_label, null, null, 'Role', v_old, v_new, null, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_profile on profiles;
create trigger trg_audit_profile
  after insert or update of role_id on profiles
  for each row execute function audit_profile();

-- ------------------------------------------------------------- roles --

create or replace function role_access_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_users integer;
begin
  if tg_op = 'INSERT' then
    if v_actor is not null then
      new.key := null;
      new.is_system := false;
      new.created_by := v_actor;
      new.created_at := now();
    end if;
    new.name := btrim(new.name);
    if new.name = '' then raise exception 'A role needs a name.'; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if pg_trigger_depth() > 1 then return new; end if;
    if v_actor is not null then
      if old.is_system then raise exception 'Built-in roles can''t be changed.'; end if;
      new.key := old.key;
      new.is_system := old.is_system;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
    new.name := btrim(new.name);
    if new.name = '' then raise exception 'A role needs a name.'; end if;
    return new;
  end if;

  if v_actor is not null and old.is_system then
    raise exception 'Built-in roles can''t be deleted.';
  end if;
  select count(*) into v_users from profiles where role_id = old.id;
  if v_users > 0 then
    raise exception '% % this role. Give them another role first.',
      v_users || case when v_users = 1 then ' user' else ' users' end,
      case when v_users = 1 then 'still has' else 'still have' end;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_role_access_guard on roles;
create trigger trg_role_access_guard
  before insert or update or delete on roles
  for each row execute function role_access_guard();

create or replace function audit_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit_write(null, 'role_created', 'role', new.id, new.name, null, null, 'Role', null, new.name, nullif(new.description, ''), null);
    return new;
  elsif tg_op = 'DELETE' then
    perform audit_write(null, 'role_deleted', 'role', old.id, old.name, null, null, 'Role', old.name, null, null, null);
    return old;
  end if;
  if new.name is distinct from old.name then
    perform audit_write(null, 'role_updated', 'role', new.id, new.name, null, null, 'Name', old.name, new.name, null, null);
  end if;
  if new.description is distinct from old.description then
    perform audit_write(null, 'role_updated', 'role', new.id, new.name, null, null, 'Description', old.description, new.description, null, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_role on roles;
create trigger trg_audit_role
  after insert or update of name, description or delete on roles
  for each row execute function audit_role();

-- ---------------------------------------------------- role permissions --

create or replace function role_permission_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_role roles;
  v_role_id uuid;
  v_key text;
begin
  if tg_op = 'DELETE' then
    v_role_id := old.role_id; v_key := old.permission_key;
  else
    v_role_id := new.role_id; v_key := new.permission_key;
  end if;

  if v_actor is not null then
    select * into v_role from roles where id = v_role_id;
    if v_role.id is not null then          -- not a role that is being deleted
      if v_role.is_system then
        raise exception 'Permissions of built-in roles can''t be changed.';
      end if;
      if exists (select 1 from profiles where id = v_actor and role_id = v_role_id) then
        raise exception 'You can''t change the permissions of your own role.';
      end if;
      if tg_op = 'INSERT' and not has_permission(v_key) then
        raise exception 'You can only grant permissions that you have yourself.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_role_permission_guard on role_permissions;
create trigger trg_role_permission_guard
  before insert or delete on role_permissions
  for each row execute function role_permission_guard();

create or replace function audit_role_permission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role_id uuid;
  v_key text;
  v_role_name text;
  v_perm text;
begin
  if tg_op = 'DELETE' then v_role_id := old.role_id; v_key := old.permission_key;
  else v_role_id := new.role_id; v_key := new.permission_key; end if;

  select name into v_role_name from roles where id = v_role_id;
  if v_role_name is null then            -- the whole role is being deleted
    return null;
  end if;
  select category || ' › ' || label into v_perm from permissions where key = v_key;

  if tg_op = 'INSERT' then
    perform audit_write(null, 'permission_granted', 'role', v_role_id, v_role_name, null, null,
                        coalesce(v_perm, v_key), 'Not allowed', 'Allowed', null, null);
  else
    perform audit_write(null, 'permission_revoked', 'role', v_role_id, v_role_name, null, null,
                        coalesce(v_perm, v_key), 'Allowed', 'Not allowed', null, null);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_role_permission on role_permissions;
create trigger trg_audit_role_permission
  after insert or delete on role_permissions
  for each row execute function audit_role_permission();

-- ------------------------------------------------------------ groups --

create or replace function user_group_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
  elsif pg_trigger_depth() = 1 and auth.uid() is not null then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.name := btrim(new.name);
  if new.name = '' then raise exception 'A group needs a name.'; end if;
  return new;
end;
$$;

drop trigger if exists trg_user_group_guard on user_groups;
create trigger trg_user_group_guard
  before insert or update on user_groups
  for each row execute function user_group_guard();

create or replace function user_group_member_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.added_by := auth.uid();
    new.added_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_group_member_guard on user_group_members;
create trigger trg_user_group_member_guard
  before insert on user_group_members
  for each row execute function user_group_member_guard();

create or replace function audit_user_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit_write(null, 'group_created', 'group', new.id, new.name, null, null, 'Group', null, new.name, nullif(new.description, ''), null);
    return new;
  elsif tg_op = 'DELETE' then
    perform audit_write(null, 'group_deleted', 'group', old.id, old.name, null, null, 'Group', old.name, null, null, null);
    return old;
  end if;
  if new.name is distinct from old.name then
    perform audit_write(null, 'group_updated', 'group', new.id, new.name, null, null, 'Name', old.name, new.name, null, null);
  end if;
  if new.description is distinct from old.description then
    perform audit_write(null, 'group_updated', 'group', new.id, new.name, null, null, 'Description', old.description, new.description, null, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_user_group on user_groups;
create trigger trg_audit_user_group
  after insert or update of name, description or delete on user_groups
  for each row execute function audit_user_group();

create or replace function audit_user_group_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_user_id uuid;
  v_group text;
  v_member text;
begin
  if tg_op = 'DELETE' then v_group_id := old.group_id; v_user_id := old.user_id;
  else v_group_id := new.group_id; v_user_id := new.user_id; end if;

  select name into v_group from user_groups where id = v_group_id;
  if v_group is null then return null; end if;   -- the whole group is being deleted
  select coalesce(nullif(name, ''), email) into v_member from profiles where id = v_user_id;
  v_member := coalesce(v_member, 'Removed user');

  if tg_op = 'INSERT' then
    perform audit_write(null, 'group_member_added', 'group', v_group_id, v_group, null, null, 'Member', null, v_member, null, null);
  else
    perform audit_write(null, 'group_member_removed', 'group', v_group_id, v_group, null, null, 'Member', v_member, null, null, null);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_user_group_member on user_group_members;
create trigger trg_audit_user_group_member
  after insert or delete on user_group_members
  for each row execute function audit_user_group_member();

-- ----------------------------------------------------- new signups --

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    (select id from public.roles where key = 'tester')
  )
  on conflict (id) do nothing;

  -- Join every existing project so the account can open them straight away.
  -- What they may do there is decided by their role (Tester for new signups).
  insert into public.project_members (project_id, user_id)
  select p.id, new.id from public.projects p
  on conflict (project_id, user_id) do nothing;

  return new;
end;
$$;

-- Membership no longer carries a role, so the log records only who joined or left.
create or replace function audit_project_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m project_members;
  v_label text;
begin
  if tg_op = 'DELETE' then m := old; else m := new; end if;
  if tg_op = 'UPDATE' then return m; end if;
  select coalesce(nullif(name, ''), email) into v_label from profiles where id = m.user_id;
  v_label := coalesce(v_label, 'Removed user');

  if tg_op = 'INSERT' then
    perform audit_write(m.project_id, 'member_added', 'member', m.user_id, v_label, null, null,
                        'Project access', null, 'Added', null, null);
  else
    perform audit_write(m.project_id, 'member_removed', 'member', m.user_id, v_label, null, null,
                        'Project access', 'Added', 'Removed', null, null);
  end if;
  return m;
end;
$$;

-- --------------------------------------------------- test case rules --

-- Which part of a test case someone may change depends on their permissions:
--   text (topic, scenario, steps, expected result)    -> Edit Test Case
--   result / fail or block reason                       -> Execute Test Case on
--       their own assigned case, Execute Any Test Case on an unassigned one,
--       or Assign Test Case (override) on someone else's
--   To-Do task (complete / close / reopen)             -> their own assigned case
--       with an execute permission, or Assign Test Case
--   assignment: take a free case -> Assign to Me; hand back your own -> always;
--       anything else -> Assign Test Case
create or replace function vms_row_access_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_assign boolean;
  v_exec boolean;
  v_exec_any boolean;
  v_mine boolean;
begin
  if v_actor is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.result, 'not_tested') <> 'not_tested' and not has_permission('test_cases.execute_any') then
      raise exception 'You don''t have permission to record a result for this test case.';
    end if;
    if new.assigned_to = v_actor and not (has_permission('test_cases.self_assign') or has_permission('test_cases.assign')) then
      raise exception 'You don''t have permission to assign test cases to yourself.';
    end if;
    return new;
  end if;

  v_mine := old.assigned_to is not distinct from v_actor;
  v_assign := has_permission('test_cases.assign');

  if (new.topic, new.scenario, new.test_steps, new.expected_result, new.sort_order, new.plan_id)
     is distinct from (old.topic, old.scenario, old.test_steps, old.expected_result, old.sort_order, old.plan_id)
     and not has_permission('test_cases.edit') then
    raise exception 'You don''t have permission to edit test cases.';
  end if;

  if (new.result, new.failure_comment) is distinct from (old.result, old.failure_comment) then
    v_exec := has_permission('test_cases.execute');
    v_exec_any := has_permission('test_cases.execute_any');
    if not (v_exec or v_exec_any) then
      raise exception 'You don''t have permission to execute test cases.';
    elsif v_mine then
      null;
    elsif old.assigned_to is null then
      if not v_exec_any then
        raise exception 'You can only execute test cases assigned to you. Use "Assign to me" first.';
      end if;
    elsif not v_assign then
      raise exception 'This test case is assigned to someone else.';
    end if;
  end if;

  if new.task_status is distinct from old.task_status and not (
       v_assign or (v_mine and (has_permission('test_cases.execute') or has_permission('test_cases.execute_any')))) then
    raise exception 'You don''t have permission to complete, close or reopen this task.';
  end if;

  if new.assigned_to is distinct from old.assigned_to and not v_assign then
    if old.assigned_to is null and new.assigned_to = v_actor then
      if not has_permission('test_cases.self_assign') then
        raise exception 'You don''t have permission to assign test cases to yourself.';
      end if;
    elsif v_mine and new.assigned_to is null then
      null;  -- anyone may hand back their own test case
    else
      raise exception 'You don''t have permission to assign test cases to other people or change their assignments.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vms_row_access_guard on vms_test_plan_rows;
create trigger trg_vms_row_access_guard
  before insert or update on vms_test_plan_rows
  for each row execute function vms_row_access_guard();

-- Membership checks and assignment timestamps. Permission decisions now live
-- in vms_row_access_guard; this keeps the "someone else's test case is theirs"
-- lock for people who can't assign.
create or replace function vms_row_assignment_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_project uuid;
  v_owner text;
begin
  v_project := coalesce(new.project_id, (select project_id from test_plans where id = new.plan_id));

  if tg_op = 'INSERT' then
    if new.assigned_to is not null then
      if v_actor is not null and new.assigned_to <> v_actor and not has_permission('test_cases.assign') then
        raise exception 'You don''t have permission to assign test cases to other people.';
      end if;
      if not exists (select 1 from project_members where project_id = v_project and user_id = new.assigned_to) then
        raise exception 'That person is not a member of this project.';
      end if;
      new.assigned_at := now();
    else
      new.assigned_at := null;
    end if;
    return new;
  end if;

  if v_actor is not null and pg_trigger_depth() = 1
     and old.assigned_to is not null and old.assigned_to <> v_actor
     and not has_permission('test_cases.assign')
     and (new.topic, new.scenario, new.test_steps, new.expected_result, new.plan_id, new.sort_order)
         is distinct from
         (old.topic, old.scenario, old.test_steps, old.expected_result, old.plan_id, old.sort_order) then
    select coalesce(nullif(name, ''), email) into v_owner from profiles where id = old.assigned_to;
    v_owner := coalesce(v_owner, 'another user');
    raise exception 'This test case is assigned to %. Only % or an Admin/Manager can change it.', v_owner, v_owner;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is not null
       and not exists (select 1 from project_members where project_id = v_project and user_id = new.assigned_to) then
      raise exception 'That person is not a member of this project.';
    end if;
    new.assigned_at := case when new.assigned_to is null then null else now() end;
  else
    new.assigned_at := old.assigned_at;
  end if;

  return new;
end;
$$;

create or replace function vms_row_task_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_owner text;
begin
  if tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is null then
      new.assigned_by := null;
      new.task_status := null;
      new.task_status_at := null;
      new.task_status_by := null;
    else
      new.assigned_by := v_actor;
      new.task_status := 'open';
      new.task_status_at := now();
      new.task_status_by := v_actor;
    end if;
    return new;
  end if;

  new.assigned_by := case when new.assigned_by is null and pg_trigger_depth() > 1 then null else old.assigned_by end;

  if new.task_status is distinct from old.task_status then
    if new.assigned_to is null then
      raise exception 'This test case is not assigned to anyone, so it has no task to update.';
    end if;
    if new.task_status is null then
      raise exception 'A task can be completed, closed or reopened, but not removed. Unassign the test case instead.';
    end if;
    if v_actor is not null and v_actor <> new.assigned_to and not has_permission('test_cases.assign') then
      select coalesce(nullif(name, ''), email) into v_owner from profiles where id = new.assigned_to;
      v_owner := coalesce(v_owner, 'another user');
      raise exception 'This task belongs to %. Only % or an Admin/Manager can complete, close or reopen it.', v_owner, v_owner;
    end if;
    if new.task_status = 'completed' and coalesce(new.result, 'not_tested') = 'not_tested' then
      raise exception 'Record a result for this test case before completing the task.';
    end if;
    new.task_status_at := now();
    new.task_status_by := v_actor;
  else
    new.task_status_at := old.task_status_at;
    new.task_status_by := case when new.task_status_by is null and pg_trigger_depth() > 1 then null else old.task_status_by end;
  end if;

  return new;
end;
$$;

create or replace function audit_vms_row_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old uuid;
  v_old_name text;
  v_new_name text;
  v_plan_name text;
  v_label text;
  v_action text;
  v_comment text;
begin
  if tg_op = 'UPDATE' then v_old := old.assigned_to; end if;
  if v_old is not distinct from new.assigned_to then return new; end if;

  if v_old is not null then
    select coalesce(nullif(name, ''), email) into v_old_name from profiles where id = v_old;
    v_old_name := coalesce(v_old_name, 'Removed user');
  end if;
  if new.assigned_to is not null then
    select coalesce(nullif(name, ''), email) into v_new_name from profiles where id = new.assigned_to;
  end if;
  select name into v_plan_name from test_plans where id = new.plan_id;
  v_label := coalesce(nullif(btrim(new.scenario), ''), nullif(btrim(new.topic), ''), '(blank row)');

  if v_old is null then
    v_action := 'assigned';
  elsif new.assigned_to is null then
    v_action := 'unassigned';
  else
    v_action := 'reassigned';
  end if;

  -- An override is any change to someone else's existing assignment.
  if v_actor is null then
    v_comment := 'Changed outside the app';
  elsif v_old is not null and v_old <> v_actor then
    v_comment := 'Admin/Manager override (was assigned to ' || v_old_name || ')';
  elsif v_old is null and new.assigned_to <> v_actor then
    v_comment := 'Assigned by an Admin/Manager';
  end if;

  perform audit_write(new.project_id, v_action, 'test_case', new.id, v_label, new.plan_id, v_plan_name,
                      'Assigned to', v_old_name, v_new_name, v_comment, new.result);
  return new;
end;
$$;

-- --------------------------------------------------- test plan rules --

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

  return new;
end;
$$;

drop trigger if exists trg_test_plan_access_guard on test_plans;
create trigger trg_test_plan_access_guard
  before insert or update on test_plans
  for each row execute function test_plan_access_guard();

-- Exports are recorded server-side and now need Export Reports.
create or replace function log_export(
  p_plan_id uuid, p_format text, p_filename text, p_row_count integer,
  p_include_failure_comments boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_plan test_plans;
begin
  if not has_permission('reports.export') then
    raise exception 'You don''t have permission to export reports.';
  end if;
  select * into v_plan from test_plans where id = p_plan_id;
  if v_plan.id is null then raise exception 'Unknown test plan'; end if;
  if not has_project_access(v_plan.project_id) then raise exception 'Not allowed'; end if;
  if lower(p_format) not in ('xlsx', 'csv') then raise exception 'Unsupported export format'; end if;

  perform audit_write(v_plan.project_id, 'report_exported', 'report', v_plan.id,
    left(coalesce(p_filename, ''), 200), v_plan.id, v_plan.name, 'Format', null, upper(p_format),
    format('%s row%s%s', p_row_count, case when p_row_count = 1 then '' else 's' end,
           case when p_include_failure_comments then ', with fail/block reasons' else '' end),
    null);
end;
$$;

-- Only triggers (running as the database owner) may create notifications.
revoke all on function create_notification(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- ------------------------------------------------------ access rules --

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'projects', 'project_members', 'profiles', 'permissions', 'roles', 'role_permissions',
      'user_groups', 'user_group_members', 'test_plans', 'test_plan_items', 'vms_test_plan_rows',
      'vms_test_plan_row_history', 'test_cases', 'test_case_steps', 'test_case_comments',
      'test_case_attachments', 'test_case_versions', 'test_suites', 'sections', 'test_runs',
      'test_run_cases', 'test_results', 'audit_log', 'label_definitions', 'project_repos',
      'project_docs', 'plans', 'plan_projects', 'goals', 'sprints', 'issues', 'comments',
      'attachments', 'activity_log', 'notifications', 'starred_projects')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Users, roles, permissions, groups
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or (select has_permission('users.edit')) or (select has_permission('users.assign_roles')));

create policy permissions_select on permissions for select to authenticated using (true);

create policy roles_select on roles for select to authenticated using (true);
create policy roles_insert on roles for insert to authenticated with check ((select has_permission('roles.manage')));
create policy roles_update on roles for update to authenticated using ((select has_permission('roles.manage')));
create policy roles_delete on roles for delete to authenticated using ((select has_permission('roles.manage')));

create policy role_permissions_select on role_permissions for select to authenticated using (true);
create policy role_permissions_insert on role_permissions for insert to authenticated with check ((select has_permission('roles.manage')));
create policy role_permissions_delete on role_permissions for delete to authenticated using ((select has_permission('roles.manage')));

create policy user_groups_select on user_groups for select to authenticated using ((select has_permission('users.view')));
create policy user_groups_insert on user_groups for insert to authenticated with check ((select has_permission('users.edit')));
create policy user_groups_update on user_groups for update to authenticated using ((select has_permission('users.edit')));
create policy user_groups_delete on user_groups for delete to authenticated using ((select has_permission('users.edit')));

create policy user_group_members_select on user_group_members for select to authenticated using ((select has_permission('users.view')));
create policy user_group_members_insert on user_group_members for insert to authenticated with check ((select has_permission('users.edit')));
create policy user_group_members_delete on user_group_members for delete to authenticated using ((select has_permission('users.edit')));

-- Projects and membership
create policy projects_select on projects for select to authenticated
  using ((has_project_access(id) or created_by = auth.uid()) and (select has_permission('projects.view')));
create policy projects_insert on projects for insert to authenticated with check ((select has_permission('projects.create')));
create policy projects_update on projects for update to authenticated
  using (has_project_access(id) and (select has_permission('projects.edit')));
create policy projects_delete on projects for delete to authenticated
  using (has_project_access(id) and (select has_permission('projects.delete')));

create policy project_members_select on project_members for select to authenticated
  using (has_project_access(project_id) or (select has_permission('users.view')));
create policy project_members_insert on project_members for insert to authenticated with check ((select has_permission('users.add')));
create policy project_members_update on project_members for update to authenticated using ((select has_permission('users.edit')));
create policy project_members_delete on project_members for delete to authenticated using ((select has_permission('users.edit')));

create policy starred_projects_own on starred_projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_select on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Test plans
create policy test_plans_select on test_plans for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_plans.view')));
create policy test_plans_insert on test_plans for insert to authenticated
  with check (has_project_access(project_id) and (select has_permission('test_plans.create')));
create policy test_plans_update on test_plans for update to authenticated
  using (has_project_access(project_id) and ((select has_permission('test_plans.edit')) or (select has_permission('test_plans.close'))));
create policy test_plans_delete on test_plans for delete to authenticated
  using (has_project_access(project_id) and (select has_permission('test_plans.delete')));

create policy test_plan_items_select on test_plan_items for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_plans.view')));
create policy test_plan_items_write on test_plan_items for all to authenticated
  using (has_project_access(project_id) and (select has_permission('test_plans.edit')))
  with check (has_project_access(project_id) and (select has_permission('test_plans.edit')));

-- VMS test cases
create policy vms_rows_select on vms_test_plan_rows for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.view')));
create policy vms_rows_insert on vms_test_plan_rows for insert to authenticated
  with check (has_project_access(project_id) and (select has_permission('test_cases.create')));
create policy vms_rows_update on vms_test_plan_rows for update to authenticated
  using (has_project_access(project_id) and (
    (select has_permission('test_cases.edit')) or (select has_permission('test_cases.execute'))
    or (select has_permission('test_cases.execute_any')) or (select has_permission('test_cases.assign'))
    or (select has_permission('test_cases.self_assign'))));
create policy vms_rows_delete on vms_test_plan_rows for delete to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.delete')));

create policy vms_row_history_select on vms_test_plan_row_history for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.view')));

-- Test case library
create policy test_cases_select on test_cases for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.view')));
create policy test_cases_insert on test_cases for insert to authenticated
  with check (has_project_access(project_id) and (select has_permission('test_cases.create')));
create policy test_cases_update on test_cases for update to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.edit')));
create policy test_cases_delete on test_cases for delete to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.delete')));

create policy test_case_steps_select on test_case_steps for select to authenticated
  using (exists (select 1 from test_cases tc where tc.id = test_case_id and has_project_access(tc.project_id))
         and (select has_permission('test_cases.view')));
create policy test_case_steps_write on test_case_steps for all to authenticated
  using (exists (select 1 from test_cases tc where tc.id = test_case_id and has_project_access(tc.project_id))
         and (select has_permission('test_cases.edit')))
  with check (exists (select 1 from test_cases tc where tc.id = test_case_id and has_project_access(tc.project_id))
         and (select has_permission('test_cases.edit')));

create policy test_case_comments_select on test_case_comments for select to authenticated
  using (exists (select 1 from test_cases tc where tc.id = test_case_id and has_project_access(tc.project_id))
         and (select has_permission('test_cases.view')));
create policy test_case_comments_insert on test_case_comments for insert to authenticated
  with check (exists (select 1 from test_cases tc where tc.id = test_case_id and has_project_access(tc.project_id))
         and ((select has_permission('test_cases.edit')) or (select has_permission('test_cases.execute'))));

create policy test_case_attachments_select on test_case_attachments for select to authenticated
  using (exists (select 1 from test_cases tc where tc.id = test_case_id and has_project_access(tc.project_id))
         and (select has_permission('test_cases.view')));
create policy test_case_attachments_write on test_case_attachments for all to authenticated
  using (exists (select 1 from test_cases tc where tc.id = test_case_id and has_project_access(tc.project_id))
         and (select has_permission('test_cases.edit')))
  with check (exists (select 1 from test_cases tc where tc.id = test_case_id and has_project_access(tc.project_id))
         and (select has_permission('test_cases.edit')));

create policy test_case_versions_select on test_case_versions for select to authenticated
  using (exists (select 1 from test_cases tc where tc.id = test_case_id and has_project_access(tc.project_id))
         and (select has_permission('test_cases.view')));

create policy test_suites_select on test_suites for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.view')));
create policy test_suites_insert on test_suites for insert to authenticated
  with check (has_project_access(project_id) and (select has_permission('test_cases.edit')));
create policy test_suites_update on test_suites for update to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.edit')));
create policy test_suites_delete on test_suites for delete to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.delete')));

create policy sections_select on sections for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.view')));
create policy sections_insert on sections for insert to authenticated
  with check (has_project_access(project_id) and (select has_permission('test_cases.edit')));
create policy sections_update on sections for update to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.edit')));
create policy sections_delete on sections for delete to authenticated
  using (has_project_access(project_id) and (select has_permission('test_cases.delete')));

-- Test runs
create policy test_runs_select on test_runs for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_runs.view')));
create policy test_runs_insert on test_runs for insert to authenticated
  with check (has_project_access(project_id) and (select has_permission('test_runs.create')));
create policy test_runs_update on test_runs for update to authenticated
  using (has_project_access(project_id) and ((select has_permission('test_runs.edit')) or (select has_permission('test_runs.execute'))));
create policy test_runs_delete on test_runs for delete to authenticated
  using (has_project_access(project_id) and (select has_permission('test_runs.delete')));

create policy test_run_cases_select on test_run_cases for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_runs.view')));
create policy test_run_cases_insert on test_run_cases for insert to authenticated
  with check (has_project_access(project_id) and (select has_permission('test_runs.edit')));
create policy test_run_cases_update on test_run_cases for update to authenticated
  using (has_project_access(project_id) and ((select has_permission('test_runs.edit')) or (select has_permission('test_runs.execute'))));
create policy test_run_cases_delete on test_run_cases for delete to authenticated
  using (has_project_access(project_id) and (select has_permission('test_runs.edit')));

create policy test_results_select on test_results for select to authenticated
  using (has_project_access(project_id) and (select has_permission('test_runs.view')));
create policy test_results_insert on test_results for insert to authenticated
  with check (has_project_access(project_id) and (select has_permission('test_runs.update_results')));

-- Activity log: read-only, and only with View Activity/Audit Logs. Entries
-- about users, roles and groups belong to no project.
create policy audit_log_select on audit_log for select to authenticated
  using ((select has_permission('admin.audit_logs')) and (project_id is null or has_project_access(project_id)));

-- Administration
create policy label_definitions_select on label_definitions for select to authenticated using (true);
create policy label_definitions_write on label_definitions for all to authenticated
  using ((select has_permission('admin.settings'))) with check ((select has_permission('admin.settings')));

create policy project_repos_select on project_repos for select to authenticated
  using (has_project_access(project_id) or (select has_permission('admin.integrations')));
create policy project_repos_write on project_repos for all to authenticated
  using ((select has_permission('admin.integrations')) or (has_project_access(project_id) and (select has_permission('projects.edit'))))
  with check ((select has_permission('admin.integrations')) or (has_project_access(project_id) and (select has_permission('projects.edit'))));

create policy attachments_select on attachments for select to authenticated using (true);
create policy attachments_insert on attachments for insert to authenticated with check ((select has_permission('projects.edit')));
create policy attachments_delete on attachments for delete to authenticated
  using ((select has_permission('admin.data')) or (select has_permission('projects.edit')));

-- Older project features (issues, sprints, docs, goals, plans): readable by
-- project members, changed only by people who can edit projects.
create policy issues_select on issues for select to authenticated using (has_project_access(project_id));
create policy issues_write on issues for all to authenticated
  using (has_project_access(project_id) and (select has_permission('projects.edit')))
  with check (has_project_access(project_id) and (select has_permission('projects.edit')));
create policy sprints_select on sprints for select to authenticated using (has_project_access(project_id));
create policy sprints_write on sprints for all to authenticated
  using (has_project_access(project_id) and (select has_permission('projects.edit')))
  with check (has_project_access(project_id) and (select has_permission('projects.edit')));
create policy goals_select on goals for select to authenticated using (has_project_access(project_id));
create policy goals_write on goals for all to authenticated
  using (has_project_access(project_id) and (select has_permission('projects.edit')))
  with check (has_project_access(project_id) and (select has_permission('projects.edit')));
create policy project_docs_select on project_docs for select to authenticated using (has_project_access(project_id));
create policy project_docs_write on project_docs for all to authenticated
  using (has_project_access(project_id) and (select has_permission('projects.edit')))
  with check (has_project_access(project_id) and (select has_permission('projects.edit')));
create policy comments_select on comments for select to authenticated using (true);
create policy comments_write on comments for all to authenticated
  using ((select has_permission('projects.edit'))) with check ((select has_permission('projects.edit')));
create policy plans_select on plans for select to authenticated using (true);
create policy plans_write on plans for all to authenticated
  using ((select has_permission('projects.edit'))) with check ((select has_permission('projects.edit')));
create policy plan_projects_select on plan_projects for select to authenticated using (true);
create policy plan_projects_write on plan_projects for all to authenticated
  using ((select has_permission('projects.edit'))) with check ((select has_permission('projects.edit')));
create policy activity_log_select on activity_log for select to authenticated using (true);

-- File storage
drop policy if exists "Authenticated users can upload attachments" on storage.objects;
drop policy if exists "Authenticated users can delete attachments" on storage.objects;
drop policy if exists "Authenticated users can upload test case attachments" on storage.objects;
drop policy if exists "Authenticated users can delete test case attachments" on storage.objects;
create policy "Issue attachments: upload with Edit Project" on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-attachments' and (select public.has_permission('projects.edit')));
create policy "Issue attachments: delete with Edit Project or Manage Data" on storage.objects for delete to authenticated
  using (bucket_id = 'issue-attachments' and ((select public.has_permission('projects.edit')) or (select public.has_permission('admin.data'))));
create policy "Test case attachments: upload with Edit Test Case" on storage.objects for insert to authenticated
  with check (bucket_id = 'test-case-attachments' and (select public.has_permission('test_cases.edit')));
create policy "Test case attachments: delete with Edit Test Case" on storage.objects for delete to authenticated
  using (bucket_id = 'test-case-attachments' and (select public.has_permission('test_cases.edit')));

-- ----------------------------------------------- column-level grants --

-- Users can only ever write these columns; everything else is set by the
-- database (and guarded by the triggers above).
revoke insert, update, delete on profiles from anon, authenticated;
grant update (name, role_id) on profiles to authenticated;

revoke all on permissions from anon, authenticated;
grant select on permissions to authenticated;

revoke all on roles from anon, authenticated;
grant select, delete on roles to authenticated;
grant insert (name, description), update (name, description) on roles to authenticated;

revoke all on role_permissions from anon, authenticated;
grant select, delete on role_permissions to authenticated;
grant insert (role_id, permission_key) on role_permissions to authenticated;

revoke all on user_groups from anon, authenticated;
grant select, delete on user_groups to authenticated;
grant insert (name, description), update (name, description) on user_groups to authenticated;

revoke all on user_group_members from anon, authenticated;
grant select, delete on user_group_members to authenticated;
grant insert (group_id, user_id) on user_group_members to authenticated;

commit;

notify pgrst, 'reload schema';
