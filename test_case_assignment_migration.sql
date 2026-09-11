-- Test case assignment ("Assign to me"), enforced by the database.
--
-- Rules (checked on every insert/update, so the API cannot bypass them):
--   * Anyone who can edit test cases may take a FREE test case for themselves.
--   * The assignee may release (unassign) their own test case.
--   * Only a project Admin or Lead may assign a test case to someone else,
--     reassign it, or remove someone else's assignment (an "override").
--   * While a test case is assigned, only the assignee or an Admin/Lead may
--     change its result, failure reason or text.
-- Every assign / unassign / reassign is written to the activity log.

alter table vms_test_plan_rows
  add column if not exists assigned_to uuid references profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz;

create index if not exists idx_vms_rows_plan_assigned_to on vms_test_plan_rows (plan_id, assigned_to);

create or replace function vms_row_assignment_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_project uuid;
  v_manager boolean;
  v_owner text;
begin
  v_project := coalesce(new.project_id, (select project_id from test_plans where id = new.plan_id));

  if tg_op = 'INSERT' then
    if new.assigned_to is not null then
      if v_actor is not null and new.assigned_to <> v_actor and not has_project_role(v_project, 'admin', 'lead') then
        raise exception 'Only an Admin or Lead can assign a test case to someone else.';
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

  -- Changes made outside the app (no signed-in user) are not restricted.
  if v_actor is not null then
    v_manager := has_project_role(v_project, 'admin', 'lead');
    if old.assigned_to is not null then
      select coalesce(nullif(name, ''), email, 'another user') into v_owner from profiles where id = old.assigned_to;
      v_owner := coalesce(v_owner, 'another user');
    end if;

    if new.assigned_to is distinct from old.assigned_to and not v_manager then
      if old.assigned_to is null and new.assigned_to = v_actor then
        null;  -- taking a free test case
      elsif old.assigned_to = v_actor and new.assigned_to is null then
        null;  -- releasing your own test case
      elsif old.assigned_to is null then
        raise exception 'You can only assign a test case to yourself. Only an Admin or Lead can assign it to someone else.';
      else
        raise exception 'This test case is assigned to %. Only % or an Admin/Lead can unassign or reassign it.', v_owner, v_owner;
      end if;
    end if;

    if old.assigned_to is not null and old.assigned_to <> v_actor and not v_manager
       and (new.result, new.failure_comment, new.topic, new.scenario, new.test_steps,
            new.expected_result, new.plan_id, new.sort_order)
           is distinct from
           (old.result, old.failure_comment, old.topic, old.scenario, old.test_steps,
            old.expected_result, old.plan_id, old.sort_order) then
      raise exception 'This test case is assigned to %. Only % or an Admin/Lead can update it.', v_owner, v_owner;
    end if;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is not null
       and not exists (select 1 from project_members where project_id = v_project and user_id = new.assigned_to) then
      raise exception 'That person is not a member of this project.';
    end if;
    new.assigned_at := case when new.assigned_to is null then null else now() end;
  else
    new.assigned_at := old.assigned_at;  -- the timestamp cannot be edited directly
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vms_row_assignment_guard on vms_test_plan_rows;
create trigger trg_vms_row_assignment_guard
  before insert or update on vms_test_plan_rows
  for each row execute function vms_row_assignment_guard();

-- ------------------------------------------------------- activity log --

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
    v_comment := 'Override by Admin/Lead (was assigned to ' || v_old_name || ')';
  end if;

  perform audit_write(new.project_id, v_action, 'test_case', new.id, v_label, new.plan_id, v_plan_name,
                      'Assigned to', v_old_name, v_new_name, v_comment, new.result);
  return new;
end;
$$;

drop trigger if exists trg_audit_vms_row_assignment on vms_test_plan_rows;
create trigger trg_audit_vms_row_assignment
  after insert or update of assigned_to on vms_test_plan_rows
  for each row execute function audit_vms_row_assignment();

notify pgrst, 'reload schema';
