-- Marking a VMS test plan row as Failed must always carry a reason.
--
-- Enforced in the database, not just the UI: the app talks to PostgREST
-- directly, so a CHECK constraint is the only thing a hand-rolled API call
-- cannot walk around.

alter table vms_test_plan_rows
  add column if not exists failure_comment text,
  add column if not exists failed_by uuid references profiles(id) on delete set null,
  add column if not exists failed_at timestamptz;

-- Every result change is recorded, so a failure reason survives the row later
-- being flipped to Pass.
create table if not exists vms_test_plan_row_history (
  id uuid primary key default gen_random_uuid(),
  row_id uuid references vms_test_plan_rows(id) on delete cascade not null,
  project_id uuid not null,
  old_result text,
  new_result text,
  failure_comment text,
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz default now()
);

create index if not exists idx_vms_row_history_row on vms_test_plan_row_history(row_id, changed_at desc);

-- The four failures that came in from the source sheet have no reason recorded
-- there. Say exactly that rather than inventing one, so the constraint below
-- can be fully valid and those rows stay editable.
update vms_test_plan_rows
set failure_comment = 'Imported from source sheet — no failure reason was recorded.'
where result = 'fail' and (failure_comment is null or btrim(failure_comment) = '');

alter table vms_test_plan_rows drop constraint if exists vms_rows_fail_needs_comment;
alter table vms_test_plan_rows
  add constraint vms_rows_fail_needs_comment
  check (result is distinct from 'fail' or (failure_comment is not null and btrim(failure_comment) <> ''));

-- Stamps who failed it and when, clears stale failure data once a row is no
-- longer failed, and writes the audit row.
create or replace function vms_row_result_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
begin
  if new.result = 'fail' then
    -- Restamp only when the failure itself is new or its reason changed, so
    -- editing the Topic of a failed row does not rewrite its audit fields.
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

  if new.result is distinct from old.result then
    insert into vms_test_plan_row_history (row_id, project_id, old_result, new_result, failure_comment, changed_by)
    values (new.id, new.project_id, old.result, new.result,
            case when new.result = 'fail' then new.failure_comment else old.failure_comment end,
            actor);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vms_row_result_audit on vms_test_plan_rows;
create trigger trg_vms_row_result_audit
  before update on vms_test_plan_rows
  for each row execute function vms_row_result_audit();

alter table vms_test_plan_row_history enable row level security;

drop policy if exists "vms_row_history_select" on vms_test_plan_row_history;
create policy "vms_row_history_select" on vms_test_plan_row_history
  for select using (has_project_access(project_id));
