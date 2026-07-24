// Single source of truth for status colors across the whole app.
// Every domain (priority, automation status, issue status, role, run result...)
// picks a color NAME here rather than owning its own hex/class strings, so two
// unrelated domains that both want "red" always render identically.

export const COLOR_MAP = {
  green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500', bar: 'bg-green-500' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500', bar: 'bg-blue-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500', bar: 'bg-orange-500' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', bar: 'bg-red-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500', bar: 'bg-purple-500' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400', bar: 'bg-gray-400' },
}

export const TEST_RUN_RESULT = {
  passed: { label: 'Passed', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
  blocked: { label: 'Blocked', color: 'orange' },
  retest: { label: 'Retest', color: 'purple' },
  skipped: { label: 'Skipped', color: 'gray' },
  untested: { label: 'Untested', color: 'gray' },
}

export const TEST_CASE_PRIORITY = {
  critical: { label: 'Critical', color: 'red' },
  high: { label: 'High', color: 'orange' },
  medium: { label: 'Medium', color: 'blue' },
  low: { label: 'Low', color: 'gray' },
}

export const TEST_CASE_TYPE = {
  functional: { label: 'Functional', color: 'blue' },
  regression: { label: 'Regression', color: 'purple' },
  smoke: { label: 'Smoke', color: 'orange' },
  sanity: { label: 'Sanity', color: 'orange' },
  integration: { label: 'Integration', color: 'blue' },
  system: { label: 'System', color: 'blue' },
  ui: { label: 'UI', color: 'blue' },
  api: { label: 'API', color: 'blue' },
  performance: { label: 'Performance', color: 'purple' },
  security: { label: 'Security', color: 'red' },
  compatibility: { label: 'Compatibility', color: 'gray' },
  uat: { label: 'UAT', color: 'green' },
  exploratory: { label: 'Exploratory', color: 'gray' },
}

export const AUTOMATION_STATUS = {
  automated: { label: 'Automated', color: 'green' },
  in_progress: { label: 'In Progress', color: 'blue' },
  planned: { label: 'Planned', color: 'orange' },
  not_automated: { label: 'Not Automated', color: 'gray' },
  not_applicable: { label: 'N/A', color: 'gray' },
}

export const ISSUE_STATUS = {
  todo: { label: 'To Do', color: 'gray' },
  in_progress: { label: 'In Progress', color: 'blue' },
  in_review: { label: 'In Review', color: 'purple' },
  done: { label: 'Done', color: 'green' },
}

export const PROJECT_MEMBER_ROLE = {
  admin: { label: 'Admin', color: 'red' },
  lead: { label: 'Lead', color: 'orange' },
  tester: { label: 'Tester', color: 'blue' },
  viewer: { label: 'Viewer', color: 'gray' },
}

export const RUN_STATUS = {
  active: { label: 'Active', color: 'blue' },
  closed: { label: 'Closed', color: 'gray' },
}

export const GOAL_STATUS = {
  on_track: { label: 'On Track', color: 'green' },
  at_risk: { label: 'At Risk', color: 'orange' },
  off_track: { label: 'Off Track', color: 'red' },
  done: { label: 'Done', color: 'blue' },
}

export function resolveStatus(domain, value) {
  const entry = domain?.[value]
  if (!entry) return { label: value ?? '—', ...COLOR_MAP.gray }
  return { label: entry.label, ...COLOR_MAP[entry.color] }
}
