-- ============================================
-- FULL DATABASE SETUP FOR TEAM TRACKER
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- 1. TABLES
create table if not exists profiles (
  id uuid references auth.users primary key,
  name text not null,
  email text not null,
  role text default 'member',
  created_at timestamp default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key text not null unique,
  description text,
  created_by uuid references profiles(id),
  created_at timestamp default now()
);

create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text,
  type text default 'task',
  status text default 'todo',
  priority text default 'medium',
  assignee_id uuid references profiles(id),
  reporter_id uuid references profiles(id),
  due_date date,
  label text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references issues(id) on delete cascade,
  user_id uuid references profiles(id),
  body text not null,
  created_at timestamp default now()
);

-- 2. AUTO-CREATE PROFILE ON SIGNUP
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. ROW LEVEL SECURITY
alter table profiles enable row level security;
alter table projects enable row level security;
alter table issues enable row level security;
alter table comments enable row level security;

drop policy if exists "Authenticated users full access" on profiles;
drop policy if exists "Authenticated users full access" on projects;
drop policy if exists "Authenticated users full access" on issues;
drop policy if exists "Authenticated users full access" on comments;

create policy "Authenticated users full access" on profiles
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on projects
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on issues
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on comments
  for all using (auth.role() = 'authenticated');

-- 4. PERFORMANCE INDEXES
create index if not exists idx_issues_project_id on issues(project_id);
create index if not exists idx_issues_status on issues(status);
create index if not exists idx_issues_assignee_id on issues(assignee_id);
create index if not exists idx_comments_issue_id on comments(issue_id);
