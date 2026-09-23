-- Data API grants for every table, view and sequence in public.
--
-- From 30 October 2026 Supabase no longer grants new tables in public to the
-- Data API roles (anon, authenticated, service_role) automatically. Tables that
-- already exist keep their grants, so this project is unaffected today — but a
-- rebuild (a new project, a preview branch, or "supabase db reset") would
-- create tables the app can't read or write.
--
-- Each migration that creates a table now names its own grants. This file is
-- the catch-all: it restates the permissions this project has right now,
-- including the tables the app deliberately keeps read-only or hidden from
-- anon. Running it changes nothing on the live database; run it last after a
-- rebuild to reproduce the same permissions.
--
-- Column-level grants (for example: only some columns of test_plans may be
-- updated) are listed as they are, because the guard triggers rely on them.

begin;


-- activity_log (table)
grant all on public.activity_log to anon;
grant all on public.activity_log to authenticated;
grant all on public.activity_log to service_role;

-- attachments (table)
grant all on public.attachments to anon;
grant all on public.attachments to authenticated;
grant all on public.attachments to service_role;

-- audit_log (table)
revoke all on public.audit_log from anon;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

-- audit_log_facets (view)
revoke all on public.audit_log_facets from anon;
grant select on public.audit_log_facets to authenticated;
grant all on public.audit_log_facets to service_role;

-- comments (table)
grant all on public.comments to anon;
grant all on public.comments to authenticated;
grant all on public.comments to service_role;

-- goals (table)
grant all on public.goals to anon;
grant all on public.goals to authenticated;
grant all on public.goals to service_role;

-- issues (table)
grant all on public.issues to anon;
grant all on public.issues to authenticated;
grant all on public.issues to service_role;

-- label_definitions (table)
grant all on public.label_definitions to anon;
grant all on public.label_definitions to authenticated;
grant all on public.label_definitions to service_role;

-- notifications (table)
grant all on public.notifications to anon;
grant all on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- permissions (table)
revoke all on public.permissions from anon;
grant select on public.permissions to authenticated;
grant all on public.permissions to service_role;

-- plan_projects (table)
grant all on public.plan_projects to anon;
grant all on public.plan_projects to authenticated;
grant all on public.plan_projects to service_role;

-- plans (table)
grant all on public.plans to anon;
grant all on public.plans to authenticated;
grant all on public.plans to service_role;

-- profiles (table)
grant references, select, trigger, truncate on public.profiles to anon;
grant references, select, trigger, truncate on public.profiles to authenticated;
grant update (name, role_id) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- project_docs (table)
grant all on public.project_docs to anon;
grant all on public.project_docs to authenticated;
grant all on public.project_docs to service_role;

-- project_members (table)
grant all on public.project_members to anon;
grant all on public.project_members to authenticated;
grant all on public.project_members to service_role;

-- project_repos (table)
grant all on public.project_repos to anon;
grant all on public.project_repos to authenticated;
grant all on public.project_repos to service_role;

-- projects (table)
grant all on public.projects to anon;
grant all on public.projects to authenticated;
grant all on public.projects to service_role;

-- release_plan_links (table)
revoke all on public.release_plan_links from anon;
grant select on public.release_plan_links to authenticated;
grant all on public.release_plan_links to service_role;

-- release_report_results (table)
revoke all on public.release_report_results from anon;
grant select on public.release_report_results to authenticated;
grant all on public.release_report_results to service_role;

-- release_reports (table)
revoke all on public.release_reports from anon;
grant select on public.release_reports to authenticated;
grant all on public.release_reports to service_role;

-- release_snapshot_activity (table)
revoke all on public.release_snapshot_activity from anon;
grant select on public.release_snapshot_activity to authenticated;
grant all on public.release_snapshot_activity to service_role;

-- release_snapshot_cases (table)
revoke all on public.release_snapshot_cases from anon;
grant select on public.release_snapshot_cases to authenticated;
grant all on public.release_snapshot_cases to service_role;

-- release_snapshot_plans (table)
revoke all on public.release_snapshot_plans from anon;
grant select on public.release_snapshot_plans to authenticated;
grant all on public.release_snapshot_plans to service_role;

-- release_snapshot_runs (table)
revoke all on public.release_snapshot_runs from anon;
grant select on public.release_snapshot_runs to authenticated;
grant all on public.release_snapshot_runs to service_role;

-- release_snapshots (table)
revoke all on public.release_snapshots from anon;
grant select on public.release_snapshots to authenticated;
grant all on public.release_snapshots to service_role;

-- release_versions (table)
revoke all on public.release_versions from anon;
grant delete, select on public.release_versions to authenticated;
grant insert (name, project_id) on public.release_versions to authenticated;
grant update (name) on public.release_versions to authenticated;
grant all on public.release_versions to service_role;

-- role_permissions (table)
revoke all on public.role_permissions from anon;
grant delete, select on public.role_permissions to authenticated;
grant insert (permission_key, role_id) on public.role_permissions to authenticated;
grant all on public.role_permissions to service_role;

-- roles (table)
revoke all on public.roles from anon;
grant delete, select on public.roles to authenticated;
grant insert (description, name) on public.roles to authenticated;
grant update (description, name) on public.roles to authenticated;
grant all on public.roles to service_role;

-- sections (table)
grant all on public.sections to anon;
grant all on public.sections to authenticated;
grant all on public.sections to service_role;

-- sprints (table)
grant all on public.sprints to anon;
grant all on public.sprints to authenticated;
grant all on public.sprints to service_role;

-- starred_projects (table)
grant all on public.starred_projects to anon;
grant all on public.starred_projects to authenticated;
grant all on public.starred_projects to service_role;

-- storage_usage (view)
grant all on public.storage_usage to anon;
grant all on public.storage_usage to authenticated;
grant all on public.storage_usage to service_role;

-- test_case_attachments (table)
grant all on public.test_case_attachments to anon;
grant all on public.test_case_attachments to authenticated;
grant all on public.test_case_attachments to service_role;

-- test_case_comments (table)
grant all on public.test_case_comments to anon;
grant all on public.test_case_comments to authenticated;
grant all on public.test_case_comments to service_role;

-- test_case_steps (table)
grant all on public.test_case_steps to anon;
grant all on public.test_case_steps to authenticated;
grant all on public.test_case_steps to service_role;

-- test_case_versions (table)
grant all on public.test_case_versions to anon;
grant all on public.test_case_versions to authenticated;
grant all on public.test_case_versions to service_role;

-- test_cases (table)
grant all on public.test_cases to anon;
grant all on public.test_cases to authenticated;
grant all on public.test_cases to service_role;

-- test_plan_items (table)
grant all on public.test_plan_items to anon;
grant all on public.test_plan_items to authenticated;
grant all on public.test_plan_items to service_role;

-- test_plans (table)
grant all on public.test_plans to anon;
grant all on public.test_plans to authenticated;
grant all on public.test_plans to service_role;

-- test_results (table)
grant all on public.test_results to anon;
grant all on public.test_results to authenticated;
grant all on public.test_results to service_role;

-- test_run_case_current_status (view)
grant all on public.test_run_case_current_status to anon;
grant all on public.test_run_case_current_status to authenticated;
grant all on public.test_run_case_current_status to service_role;

-- test_run_cases (table)
grant all on public.test_run_cases to anon;
grant all on public.test_run_cases to authenticated;
grant all on public.test_run_cases to service_role;

-- test_runs (table)
grant all on public.test_runs to anon;
grant all on public.test_runs to authenticated;
grant all on public.test_runs to service_role;

-- test_suites (table)
grant all on public.test_suites to anon;
grant all on public.test_suites to authenticated;
grant all on public.test_suites to service_role;

-- user_group_members (table)
revoke all on public.user_group_members from anon;
grant delete, select on public.user_group_members to authenticated;
grant insert (group_id, user_id) on public.user_group_members to authenticated;
grant all on public.user_group_members to service_role;

-- user_groups (table)
revoke all on public.user_groups from anon;
grant delete, select on public.user_groups to authenticated;
grant insert (description, name) on public.user_groups to authenticated;
grant update (description, name) on public.user_groups to authenticated;
grant all on public.user_groups to service_role;

-- vms_test_plan_row_history (table)
grant all on public.vms_test_plan_row_history to anon;
grant all on public.vms_test_plan_row_history to authenticated;
grant all on public.vms_test_plan_row_history to service_role;

-- vms_test_plan_rows (table)
grant all on public.vms_test_plan_rows to anon;
grant all on public.vms_test_plan_rows to authenticated;
grant all on public.vms_test_plan_rows to service_role;

-- sequences (nextval for generated ids)
grant all on sequence public.audit_log_id_seq to anon, authenticated, service_role;
grant all on sequence public.vms_case_number_seq to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
