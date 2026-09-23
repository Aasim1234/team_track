-- ============================================
-- TEST CASE COMMENTS (discussion on a test case)
-- Separate from the existing issue-scoped `comments` table.
-- Safe to re-run
-- ============================================

create table if not exists test_case_comments (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid references test_cases(id) on delete cascade not null,
  user_id uuid references profiles(id),
  body text not null,
  created_at timestamptz default now()
);

alter table test_case_comments enable row level security;

drop policy if exists "Members can view test case comments" on test_case_comments;
create policy "Members can view test case comments" on test_case_comments
  for select using (
    exists (
      select 1 from test_cases tc
      where tc.id = test_case_comments.test_case_id and public.has_project_access(tc.project_id)
    )
  );

drop policy if exists "Testers can add test case comments" on test_case_comments;
create policy "Testers can add test case comments" on test_case_comments
  for insert with check (
    exists (
      select 1 from test_cases tc
      where tc.id = test_case_comments.test_case_id
        and public.has_project_role(tc.project_id, 'admin', 'lead', 'tester')
    )
  );

create index if not exists idx_test_case_comments_test_case_id on test_case_comments(test_case_id);

-- ------------------------------------------------------------ Data API --
-- From 30 October 2026 Supabase no longer grants new tables in public to the
-- Data API roles automatically, so this migration names its own grants. These
-- are the permissions this project runs with today, so re-running this file
-- changes nothing. Row Level Security (above) is what restricts who sees what;
-- these grants only make the table reachable through the Data API at all.

grant all on public.test_case_comments to anon;
grant all on public.test_case_comments to authenticated;
grant all on public.test_case_comments to service_role;
