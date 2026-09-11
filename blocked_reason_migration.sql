-- Blocked needs a reason, the same as Fail.
--
-- The reason lives in the existing failure_comment column, which now holds the
-- reason for whichever of Fail / Blocked a row currently has. Marking a row
-- Blocked (or changing / clearing its reason while Blocked) without a real
-- reason is rejected. Rows that were already Blocked before this rule existed
-- keep working as they are: they are not changed, and editing their text is
-- still allowed; the rule applies the next time someone sets them Blocked or
-- gives them a reason.

create or replace function vms_row_result_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  v_old_result text;
  v_old_comment text;
begin
  if tg_op = 'UPDATE' then
    v_old_result := old.result;
    v_old_comment := old.failure_comment;
    -- A reason belongs to the result it was given for; a new result needs its
    -- own, so a reason that was not re-supplied does not carry over.
    if new.result is distinct from old.result and new.failure_comment is not distinct from old.failure_comment then
      new.failure_comment := null;
    end if;
  end if;

  if new.result in ('fail', 'blocked') then
    if new.failure_comment is null or new.failure_comment !~ '[^[:space:]]' then
      if tg_op = 'UPDATE' and new.result = 'blocked' and v_old_result = 'blocked'
         and new.failure_comment is not distinct from v_old_comment then
        null;  -- blocked before reasons were required; left as it was
      else
        raise exception using
          errcode = '23514',
          message = case when new.result = 'fail'
                         then 'A failure reason is required when marking a test case as Failed.'
                         else 'A block reason is required when marking a test case as Blocked.' end;
      end if;
    end if;
    -- Restamp only when the result or its reason is new, so editing the Topic
    -- of a failed/blocked row does not rewrite these fields.
    if tg_op = 'INSERT' or v_old_result is distinct from new.result
       or new.failure_comment is distinct from v_old_comment then
      new.failed_by := coalesce(actor, case when tg_op = 'UPDATE' then old.failed_by end);
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

drop trigger if exists trg_vms_row_result_audit on vms_test_plan_rows;
create trigger trg_vms_row_result_audit
  before insert or update on vms_test_plan_rows
  for each row execute function vms_row_result_audit();

-- Activity log: block reasons are recorded the same way failure reasons are.
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
                        null, null, null, new.failure_comment, new.result);
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
      case when new.result in ('fail', 'blocked') then new.failure_comment
           when old.result = 'fail' and old.failure_comment is not null then 'Previous failure reason: ' || old.failure_comment
           when old.result = 'blocked' and old.failure_comment is not null then 'Previous block reason: ' || old.failure_comment
      end,
      new.result);
  elsif new.result in ('fail', 'blocked') and new.failure_comment is distinct from old.failure_comment then
    perform audit_write(new.project_id,
      case when new.result = 'fail' then 'failure_comment_edited' else 'block_reason_edited' end,
      'test_case', new.id, v_label, new.plan_id, v_plan_name,
      case when new.result = 'fail' then 'Failure reason' else 'Block reason' end,
      old.failure_comment, new.failure_comment, null, new.result);
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

-- Export log wording now covers both kinds of reason.
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
           case when p_include_failure_comments then ', with fail/block reasons' else '' end),
    null);
end;
$$;
