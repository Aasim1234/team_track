const ROLE_RANK = { admin: 4, lead: 3, tester: 2, viewer: 1 }

export function toDate(dateStr) {
  if (!dateStr) return null
  const hasOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(dateStr)
  const d = new Date(hasOffset ? dateStr : `${dateStr}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isToday(dateStr) {
  const d = toDate(dateStr)
  return d ? d.toDateString() === new Date().toDateString() : false
}

export function timeAgo(dateStr) {
  const d = toDate(dateStr)
  if (!d) return 'Never'
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Single source of truth for a team member's derived performance stats —
// used by both the Team Performance list/leaderboard and the per-member
// profile page so the numbers never drift between the two views.
export function computeMemberStats(profile, mems, { issues, results, activeSprintIds }) {
  const role = mems.reduce((best, m) => (ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best), 'viewer')
  const myIssues = issues.filter((i) => i.assignee_id === profile.id)
  const myBugsReported = issues.filter((i) => i.type === 'bug' && i.reporter_id === profile.id)
  const myBugsFixed = issues.filter((i) => i.type === 'bug' && i.assignee_id === profile.id && i.status === 'done')
  const myResults = results.filter((r) => r.executed_by === profile.id)
  const myResultsToday = myResults.filter((r) => isToday(r.executed_at))

  const total = myIssues.length
  const completed = myIssues.filter((i) => i.status === 'done').length
  const remaining = total - completed
  const overdue = myIssues.filter((i) => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'done').length
  const completedToday = myIssues.filter((i) => i.status === 'done' && isToday(i.updated_at)).length

  const mySprintIssues = myIssues.filter((i) => activeSprintIds.has(i.sprint_id))
  const sprintDone = mySprintIssues.filter((i) => i.status === 'done').length
  const sprintProgress = mySprintIssues.length ? Math.round((sprintDone / mySprintIssues.length) * 100) : null

  const loggedMinutesToday = myResultsToday.reduce((sum, r) => sum + (r.elapsed_minutes || 0), 0)

  const timestamps = [...myIssues.map((i) => i.updated_at), ...myResults.map((r) => r.executed_at)]
    .map(toDate)
    .filter(Boolean)
  const lastActivity = timestamps.length ? new Date(Math.max(...timestamps.map((d) => d.getTime()))) : null

  let status = 'offline'
  if (lastActivity) {
    const minsAgo = (Date.now() - lastActivity.getTime()) / 60000
    if (minsAgo < 15) status = 'working'
    else if (minsAgo < 120) status = 'idle'
  }

  const taskCompletionPct = total > 0 ? Math.round((completed / total) * 100) : 0
  const passRate = myResults.length ? myResults.filter((r) => r.status === 'passed').length / myResults.length : null
  const onTimeRate = completed > 0
    ? myIssues.filter((i) => i.status === 'done' && (!i.due_date || new Date(i.updated_at) <= new Date(i.due_date))).length / completed
    : null
  const ratingComponents = [taskCompletionPct / 100, passRate, onTimeRate].filter((v) => v !== null)
  const avgScore = ratingComponents.length ? ratingComponents.reduce((a, b) => a + b, 0) / ratingComponents.length : 0
  // Performance Score: the same blended completion/pass-rate/on-time formula
  // as the old star rating, just shown 0-100 rather than 1-5 stars.
  const performanceScore = Math.round(avgScore * 100)
  // Quality Score: pass rate alone — a distinct, narrower signal than the
  // blended Performance Score above, not a re-derivation of it.
  const qualityScore = passRate !== null ? Math.round(passRate * 100) : null
  const rating = Math.max(1, Math.min(5, Math.round(1 + avgScore * 4)))

  const projectBadges = mems.map((m) => ({ key: m.projects?.key, name: m.projects?.name, projectId: m.project_id }))

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role,
    projectBadges,
    activeProjects: new Set(mems.map((m) => m.project_id)).size,
    total, completed, remaining, overdue, completedToday,
    testsExecuted: myResults.length,
    testsPassedToday: myResultsToday.filter((r) => r.status === 'passed').length,
    testsFailedToday: myResultsToday.filter((r) => r.status === 'failed').length,
    testsBlockedToday: myResultsToday.filter((r) => r.status === 'blocked').length,
    testsExecutedToday: myResultsToday.length,
    bugsReported: myBugsReported.length,
    bugsFixed: myBugsFixed.length,
    bugsReportedToday: myBugsReported.filter((i) => isToday(i.created_at)).length,
    bugsFixedToday: myBugsFixed.filter((i) => isToday(i.updated_at)).length,
    loggedMinutesToday,
    taskCompletionPct,
    sprintProgress,
    lastActivity,
    status,
    rating,
    performanceScore,
    qualityScore,
    myIssues,
  }
}

// Real merged activity timeline (audit-trail status changes + bug reports +
// test executions) for one member — shared by the list page's side panel
// and the profile page so both render identical history.
export function buildMemberTimeline(memberId, { issues, results }, activityRows) {
  const issueTitle = (id) => issues.find((i) => i.id === id)?.title || 'a task'

  const taskEvents = (activityRows || [])
    .filter((a) => a.action_type === 'status_changed' && (a.new_value === 'in_progress' || a.new_value === 'done'))
    .map((a) => ({
      id: `act-${a.id}`,
      type: a.new_value === 'in_progress' ? 'Task Started' : 'Task Completed',
      label: issueTitle(a.issue_id),
      at: a.created_at,
    }))

  const bugEvents = issues
    .filter((i) => i.type === 'bug' && i.reporter_id === memberId)
    .map((i) => ({ id: `bug-${i.id}`, type: 'Bug Created', label: i.title, at: i.created_at }))

  const testEvents = results
    .filter((r) => r.executed_by === memberId)
    .map((r) => ({ id: `res-${r.id}`, type: 'Test Case Executed', label: r.status, at: r.executed_at }))

  return [...taskEvents, ...bugEvents, ...testEvents]
    .filter((e) => e.at)
    .sort((a, b) => (toDate(b.at)?.getTime() || 0) - (toDate(a.at)?.getTime() || 0))
    .slice(0, 25)
}
