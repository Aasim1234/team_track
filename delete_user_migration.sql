-- Admins can delete a user's account from Administration → Users & Roles.
--
-- admin_delete_user(user id) removes the person's group memberships, project
-- access, profile and login, all in one transaction. The database refuses when:
--   * the caller isn't an Admin
--   * an Admin tries to delete their own account
--   * the user is an Admin (change their role first)
--   * the user still has test cases assigned (reassign them first, so no work
--     is silently unassigned)
--   * the user is still recorded as the creator/owner of records that must
--     keep their author (test plans, projects, test runs, comments, ...)
-- Their past actions stay in the Activity Log, which stores names, and the
-- deletion itself is logged ("Removed user").

begin;

create or replace function admin_delete_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_target profiles;
  v_role roles;
  v_label text;
  v_assigned integer;
  v_table text;
begin
  if v_actor is null or not is_app_admin() then
    raise exception 'Only an Admin can delete users.';
  end if;
  if p_user_id = v_actor then
    raise exception 'You can''t delete your own account.';
  end if;

  select * into v_target from profiles where id = p_user_id for update;
  if not found then
    raise exception 'This user has already been deleted.';
  end if;
  select * into v_role from roles where id = v_target.role_id;
  v_label := coalesce(nullif(v_target.name, ''), v_target.email);

  if v_role.key = 'admin' then
    raise exception '% is an Admin. Change their role before deleting their account.', v_label;
  end if;

  select count(*) into v_assigned from vms_test_plan_rows where assigned_to = p_user_id;
  if v_assigned > 0 then
    raise exception '% is assigned to % test case%. Reassign them to someone else before deleting this user.',
      v_label, v_assigned, case when v_assigned = 1 then '' else 's' end;
  end if;

  begin
    -- Memberships go first, while the profile still exists, so their log
    -- entries name the person.
    delete from user_group_members where user_id = p_user_id;
    delete from project_members where user_id = p_user_id;
    perform audit_write(null, 'user_removed', 'user', p_user_id, v_label, null, null,
      'Account', concat_ws(' · ', v_target.email, v_role.name), 'Deleted', null, null);
    delete from profiles where id = p_user_id;
    delete from auth.users where id = p_user_id;
  exception when foreign_key_violation then
    get stacked diagnostics v_table = table_name;
    raise exception '% can''t be deleted because they are still recorded in % (for example as its creator or owner). Remove their project access or change their role instead.',
      v_label, replace(coalesce(v_table, 'other records'), '_', ' ');
  end;

  return jsonb_build_object('id', p_user_id, 'name', v_label);
end;
$$;

revoke all on function admin_delete_user(uuid) from public, anon;
grant execute on function admin_delete_user(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
