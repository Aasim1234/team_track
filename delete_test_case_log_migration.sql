-- Test case deletion: a fuller activity log record.
--
-- Deleting a test case was already restricted to Delete Test Case (row-level
-- security policy vms_rows_delete) and already logged. Once the row is gone its
-- details are too, so the "Deleted test case" entry now also records the
-- Test Case ID, its last result and who it was assigned to. Nothing else about
-- the activity log changes.

begin;

create or replace function audit_vms_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r vms_test_plan_rows;
  v_plan_name text;
  v_label text;
  v_assignee text;
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
    if old.assigned_to is not null then
      select coalesce(nullif(name, ''), email) into v_assignee from profiles where id = old.assigned_to;
    end if;
    perform audit_write(old.project_id, 'row_deleted', 'test_case', old.id, v_label, old.plan_id, v_plan_name,
      'Test Case ID', 'TC-' || lpad(old.case_number::text, 4, '0'), null,
      concat_ws(' · ',
        'Result: ' || audit_result_label(coalesce(old.result, 'not_tested')),
        case when old.assigned_to is not null then 'was assigned to ' || coalesce(v_assignee, 'a removed user') end),
      old.result);
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

commit;
