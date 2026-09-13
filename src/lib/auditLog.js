import { supabase } from './supabaseClient'

// Everything the activity log records. Keys match the `action` values the
// database triggers write (see audit_log_migration.sql).
export const AUDIT_ACTIONS = {
  result_changed: { label: 'Changed result' },
  failure_comment_edited: { label: 'Edited failure reason' },
  block_reason_edited: { label: 'Edited block reason' },
  row_edited: { label: 'Edited test case' },
  row_added: { label: 'Added test case' },
  row_deleted: { label: 'Deleted test case' },
  assigned: { label: 'Assigned test case' },
  unassigned: { label: 'Unassigned test case' },
  reassigned: { label: 'Reassigned test case' },
  task_completed: { label: 'Completed task' },
  task_closed: { label: 'Closed task' },
  task_reopened: { label: 'Reopened task' },
  plan_created: { label: 'Created test plan' },
  plan_edited: { label: 'Edited test plan' },
  plan_deleted: { label: 'Deleted test plan' },
  report_exported: { label: 'Exported report' },
  member_added: { label: 'Added member' },
  role_changed: { label: 'Changed role' },
  member_removed: { label: 'Removed member' },
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "11 Sep 2026, 2:15 PM", in the viewer's local time.
export function formatAuditTime(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const hours = d.getHours()
  const h12 = hours % 12 || 12
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}

// Exports happen in the browser, so they are reported to the database, which
// stamps the user and time itself. Returns the error, if any.
export async function logExport({ planId, format, filename, rowCount, includeFailureComments }) {
  const { error } = await supabase.rpc('log_export', {
    p_plan_id: planId,
    p_format: format,
    p_filename: filename,
    p_row_count: rowCount,
    p_include_failure_comments: Boolean(includeFailureComments),
  })
  return error
}
