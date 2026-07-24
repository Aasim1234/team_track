-- ============================================
-- BUG FIXES: correct timestamps + stable issue numbers
-- Safe to re-run
-- ============================================

-- 1. Fix timestamp columns to include timezone (fixes "wrong time ago" bug)
alter table profiles alter column created_at type timestamptz using created_at at time zone 'UTC';
alter table projects alter column created_at type timestamptz using created_at at time zone 'UTC';
alter table issues alter column created_at type timestamptz using created_at at time zone 'UTC';
alter table issues alter column updated_at type timestamptz using updated_at at time zone 'UTC';
alter table comments alter column created_at type timestamptz using created_at at time zone 'UTC';

-- 2. Add a stable, sequential per-project issue number (like TEST-1, TEST-2...)
alter table issues add column if not exists issue_number integer;

-- Backfill existing issues with sequential numbers per project, ordered by creation time
with numbered as (
  select id, row_number() over (partition by project_id order by created_at asc) as rn
  from issues
  where issue_number is null
)
update issues
set issue_number = numbered.rn
from numbered
where issues.id = numbered.id;

-- 3. Auto-assign issue_number on insert going forward
create or replace function public.set_issue_number()
returns trigger as $$
begin
  if new.issue_number is null then
    select coalesce(max(issue_number), 0) + 1 into new.issue_number
    from issues where project_id = new.project_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_issue_number on issues;
create trigger trg_set_issue_number
  before insert on issues
  for each row execute procedure public.set_issue_number();

create unique index if not exists idx_issues_project_number on issues(project_id, issue_number);
