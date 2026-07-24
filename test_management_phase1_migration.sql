-- ============================================
-- TEST MANAGEMENT PLATFORM — PHASE 1
-- RBAC foundation + Test Case Repository
-- (test_suites -> sections -> test_cases -> steps, with version history)
-- Safe to re-run
-- ============================================

-- ============================================
-- 1. PROJECT MEMBERSHIP + RBAC HELPERS
-- ============================================

create table if not exists project_members (
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text not null default 'tester' check (role in ('admin', 'lead', 'tester', 'viewer')),
  added_at timestamptz default now(),
  primary key (project_id, user_id)
);

alter table project_members enable row level security;

-- SECURITY DEFINER: these are called from inside RLS policies on project_members
-- itself (and on every table below), so they must bypass RLS on project_members
-- to avoid any ambiguity/recursion — same pattern already used by this database's
-- own create_notification/log_issue_activity functions.
create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_project_role(p_project_id uuid, variadic p_roles text[])
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid() and role = any(p_roles)
  );
$$;

drop policy if exists "Members can view project membership" on project_members;
create policy "Members can view project membership" on project_members
  for select using (public.has_project_access(project_id));

drop policy if exists "Admins manage project membership" on project_members;
create policy "Admins manage project membership" on project_members
  for all using (public.has_project_role(project_id, 'admin'))
  with check (public.has_project_role(project_id, 'admin'));

create index if not exists idx_project_members_user_id on project_members(user_id);

-- Auto-add the creator as admin so newly created projects are never orphaned.
create or replace function public.add_creator_as_project_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by is not null then
    insert into project_members (project_id, user_id, role)
    values (new.id, new.created_by, 'admin')
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_add_creator_as_admin on projects;
create trigger trg_add_creator_as_admin
  after insert on projects
  for each row execute function public.add_creator_as_project_admin();

-- Backfill: every existing profile becomes admin on every existing project,
-- so nobody currently using the app loses access when RBAC is introduced.
insert into project_members (project_id, user_id, role)
select p.id, pr.id, 'admin'
from projects p cross join profiles pr
on conflict (project_id, user_id) do nothing;

-- ============================================
-- 2. TEST SUITES
-- ============================================

create table if not exists test_suites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table test_suites enable row level security;

drop policy if exists "Members can view test suites" on test_suites;
create policy "Members can view test suites" on test_suites
  for select using (public.has_project_access(project_id));

drop policy if exists "Testers can create test suites" on test_suites;
create policy "Testers can create test suites" on test_suites
  for insert with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Testers can update test suites" on test_suites;
create policy "Testers can update test suites" on test_suites
  for update using (public.has_project_role(project_id, 'admin', 'lead', 'tester'))
  with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Leads can delete test suites" on test_suites;
create policy "Leads can delete test suites" on test_suites
  for delete using (public.has_project_role(project_id, 'admin', 'lead'));

create index if not exists idx_test_suites_project_id on test_suites(project_id);

-- ============================================
-- 3. SECTIONS (arbitrary nesting via parent_section_id)
-- ============================================

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid references test_suites(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade,
  parent_section_id uuid references sections(id) on delete cascade,
  name text not null,
  description text,
  sort_order int default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create or replace function public.set_section_project_id()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is null then
    select project_id into new.project_id from test_suites where id = new.suite_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_section_project_id on sections;
create trigger trg_set_section_project_id
  before insert on sections
  for each row execute function public.set_section_project_id();

alter table sections enable row level security;

drop policy if exists "Members can view sections" on sections;
create policy "Members can view sections" on sections
  for select using (public.has_project_access(project_id));

drop policy if exists "Testers can create sections" on sections;
create policy "Testers can create sections" on sections
  for insert with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Testers can update sections" on sections;
create policy "Testers can update sections" on sections
  for update using (public.has_project_role(project_id, 'admin', 'lead', 'tester'))
  with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Leads can delete sections" on sections;
create policy "Leads can delete sections" on sections
  for delete using (public.has_project_role(project_id, 'admin', 'lead'));

create index if not exists idx_sections_suite_id on sections(suite_id);
create index if not exists idx_sections_parent_section_id on sections(parent_section_id);
create index if not exists idx_sections_project_id on sections(project_id);

-- ============================================
-- 4. TEST CASES
-- ============================================

create table if not exists test_cases (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references sections(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade,
  human_id text,
  title text not null,
  preconditions text,
  objective text,
  test_type text not null default 'functional' check (test_type in (
    'functional', 'regression', 'smoke', 'sanity', 'integration', 'system',
    'ui', 'api', 'performance', 'security', 'compatibility', 'uat', 'exploratory'
  )),
  priority text not null default 'medium' check (priority in ('critical', 'high', 'medium', 'low')),
  estimate text,
  case_references text,
  requirement_ids text[] default '{}',
  automation_status text not null default 'not_automated' check (automation_status in (
    'not_automated', 'planned', 'in_progress', 'automated', 'not_applicable'
  )),
  owner_id uuid references profiles(id),
  tags text[] default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_by uuid references profiles(id),
  updated_at timestamptz default now()
);

create or replace function public.before_test_case_insert()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is null then
    select project_id into new.project_id from sections where id = new.section_id;
  end if;

  if new.human_id is null then
    select 'C' || (coalesce(max(substring(human_id from 2)::int), 0) + 1)
      into new.human_id
      from test_cases
      where project_id = new.project_id and human_id ~ '^C[0-9]+$';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_before_test_case_insert on test_cases;
create trigger trg_before_test_case_insert
  before insert on test_cases
  for each row execute function public.before_test_case_insert();

create or replace function public.set_test_case_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_test_case_updated_at on test_cases;
create trigger trg_set_test_case_updated_at
  before update on test_cases
  for each row execute function public.set_test_case_updated_at();

-- Append-only version history, populated by a SECURITY DEFINER trigger (below)
-- since regular users get no direct insert policy on it.
create table if not exists test_case_versions (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid references test_cases(id) on delete cascade not null,
  version_number int not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz default now(),
  field_name text not null,
  old_value text,
  new_value text
);

create or replace function public.log_test_case_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  v_version int;
begin
  if TG_OP = 'INSERT' then
    insert into test_case_versions (test_case_id, version_number, changed_by, field_name, new_value)
    values (new.id, 1, actor, 'created', new.title);
    return new;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from test_case_versions where test_case_id = new.id;

  if new.title is distinct from old.title then
    insert into test_case_versions (test_case_id, version_number, changed_by, field_name, old_value, new_value)
    values (new.id, v_version, actor, 'title', old.title, new.title);
  end if;

  if new.preconditions is distinct from old.preconditions then
    insert into test_case_versions (test_case_id, version_number, changed_by, field_name, old_value, new_value)
    values (new.id, v_version, actor, 'preconditions', old.preconditions, new.preconditions);
  end if;

  if new.objective is distinct from old.objective then
    insert into test_case_versions (test_case_id, version_number, changed_by, field_name, old_value, new_value)
    values (new.id, v_version, actor, 'objective', old.objective, new.objective);
  end if;

  if new.test_type is distinct from old.test_type then
    insert into test_case_versions (test_case_id, version_number, changed_by, field_name, old_value, new_value)
    values (new.id, v_version, actor, 'test_type', old.test_type, new.test_type);
  end if;

  if new.priority is distinct from old.priority then
    insert into test_case_versions (test_case_id, version_number, changed_by, field_name, old_value, new_value)
    values (new.id, v_version, actor, 'priority', old.priority, new.priority);
  end if;

  if new.automation_status is distinct from old.automation_status then
    insert into test_case_versions (test_case_id, version_number, changed_by, field_name, old_value, new_value)
    values (new.id, v_version, actor, 'automation_status', old.automation_status, new.automation_status);
  end if;

  if new.owner_id is distinct from old.owner_id then
    insert into test_case_versions (test_case_id, version_number, changed_by, field_name, old_value, new_value)
    values (
      new.id, v_version, actor, 'owner_id',
      (select name from profiles where id = old.owner_id),
      (select name from profiles where id = new.owner_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_test_case_version on test_cases;
create trigger trg_log_test_case_version
  after insert or update on test_cases
  for each row execute function public.log_test_case_version();

alter table test_cases enable row level security;

drop policy if exists "Members can view test cases" on test_cases;
create policy "Members can view test cases" on test_cases
  for select using (public.has_project_access(project_id));

drop policy if exists "Testers can create test cases" on test_cases;
create policy "Testers can create test cases" on test_cases
  for insert with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Testers can update test cases" on test_cases;
create policy "Testers can update test cases" on test_cases
  for update using (public.has_project_role(project_id, 'admin', 'lead', 'tester'))
  with check (public.has_project_role(project_id, 'admin', 'lead', 'tester'));

drop policy if exists "Leads can delete test cases" on test_cases;
create policy "Leads can delete test cases" on test_cases
  for delete using (public.has_project_role(project_id, 'admin', 'lead'));

create index if not exists idx_test_cases_section_id on test_cases(section_id);
create index if not exists idx_test_cases_project_id on test_cases(project_id);
create index if not exists idx_test_cases_owner_id on test_cases(owner_id);

alter table test_case_versions enable row level security;

drop policy if exists "Members can view test case history" on test_case_versions;
create policy "Members can view test case history" on test_case_versions
  for select using (
    exists (
      select 1 from test_cases tc
      where tc.id = test_case_versions.test_case_id and public.has_project_access(tc.project_id)
    )
  );

create index if not exists idx_test_case_versions_test_case_id on test_case_versions(test_case_id);

-- ============================================
-- 5. TEST CASE STEPS
-- ============================================

create table if not exists test_case_steps (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid references test_cases(id) on delete cascade not null,
  step_number int not null default 1,
  action text not null,
  test_data text,
  expected_result text,
  created_at timestamptz default now()
);

alter table test_case_steps enable row level security;

drop policy if exists "Members can view test case steps" on test_case_steps;
create policy "Members can view test case steps" on test_case_steps
  for select using (
    exists (
      select 1 from test_cases tc
      where tc.id = test_case_steps.test_case_id and public.has_project_access(tc.project_id)
    )
  );

drop policy if exists "Testers can manage test case steps" on test_case_steps;
create policy "Testers can manage test case steps" on test_case_steps
  for all using (
    exists (
      select 1 from test_cases tc
      where tc.id = test_case_steps.test_case_id
        and public.has_project_role(tc.project_id, 'admin', 'lead', 'tester')
    )
  )
  with check (
    exists (
      select 1 from test_cases tc
      where tc.id = test_case_steps.test_case_id
        and public.has_project_role(tc.project_id, 'admin', 'lead', 'tester')
    )
  );

create index if not exists idx_test_case_steps_test_case_id on test_case_steps(test_case_id);

-- ============================================
-- 6. TEST CASE ATTACHMENTS (separate from issue attachments)
-- ============================================

create table if not exists test_case_attachments (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid references test_cases(id) on delete cascade not null,
  file_name text not null,
  file_url text not null,
  file_type text not null,
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table test_case_attachments enable row level security;

drop policy if exists "Members can view test case attachments" on test_case_attachments;
create policy "Members can view test case attachments" on test_case_attachments
  for select using (
    exists (
      select 1 from test_cases tc
      where tc.id = test_case_attachments.test_case_id and public.has_project_access(tc.project_id)
    )
  );

drop policy if exists "Testers can manage test case attachments" on test_case_attachments;
create policy "Testers can manage test case attachments" on test_case_attachments
  for all using (
    exists (
      select 1 from test_cases tc
      where tc.id = test_case_attachments.test_case_id
        and public.has_project_role(tc.project_id, 'admin', 'lead', 'tester')
    )
  )
  with check (
    exists (
      select 1 from test_cases tc
      where tc.id = test_case_attachments.test_case_id
        and public.has_project_role(tc.project_id, 'admin', 'lead', 'tester')
    )
  );

create index if not exists idx_test_case_attachments_test_case_id on test_case_attachments(test_case_id);

insert into storage.buckets (id, name, public)
values ('test-case-attachments', 'test-case-attachments', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload test case attachments" on storage.objects;
create policy "Authenticated users can upload test case attachments"
  on storage.objects for insert
  with check (bucket_id = 'test-case-attachments' and auth.role() = 'authenticated');

drop policy if exists "Anyone can view test case attachments" on storage.objects;
create policy "Anyone can view test case attachments"
  on storage.objects for select
  using (bucket_id = 'test-case-attachments');

drop policy if exists "Authenticated users can delete test case attachments" on storage.objects;
create policy "Authenticated users can delete test case attachments"
  on storage.objects for delete
  using (bucket_id = 'test-case-attachments' and auth.role() = 'authenticated');
