import { useState, useEffect, useMemo } from 'react'
import {
  Users, ListChecks, CheckCircle2, Clock, AlertTriangle, TrendingUp, Timer, Loader,
  Eye, Bug, PlayCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import EnterpriseTable from '../../components/ui/EnterpriseTable'
import StatusBadge from '../../components/ui/StatusBadge'
import SidePanel from '../../components/ui/SidePanel'
import { MEMBER_STATUS, PROJECT_MEMBER_ROLE, TEST_RUN_RESULT } from '../../lib/statusConfig'

const ROLE_RANK = { admin: 4, lead: 3, tester: 2, viewer: 1 }

function toDate(dateStr) {
  if (!dateStr) return null
  const hasOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(dateStr)
  const d = new Date(hasOffset ? dateStr : `${dateStr}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function isToday(dateStr) {
  const d = toDate(dateStr)
  return d ? d.toDateString() === new Date().toDateString() : false
}

function timeAgo(dateStr) {
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

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 flex items-center gap-3">
      <span className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${tint}`}>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-white leading-tight truncate">{value}</p>
        <p className="text-[12px] text-gray-500">{label}</p>
      </div>
    </div>
  )
}

function MiniBar({ label, pct, color }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${pct === null ? 'No data' : pct + '%'}`}>
      <span className="text-[9px] text-gray-500 w-4 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <span className="text-[9px] text-gray-500 w-7 text-right flex-shrink-0">{pct === null ? '—' : `${pct}%`}</span>
    </div>
  )
}

function Stars({ rating }) {
  return (
    <span className="text-amber-500 text-[13px] tracking-tight" title={`${rating} / 5`}>
      {'★'.repeat(rating)}
      <span className="text-gray-300">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}

export default function AdminTeamPerformancePage() {
  const [issues, setIssues] = useState([])
  const [results, setResults] = useState([])
  const [memberships, setMemberships] = useState([])
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  useEffect(() => {
    const fetchAll = async () => {
      const [{ data: issueRows }, { data: resultRows }, { data: memberRows }, { data: sprintRows }] = await Promise.all([
        supabase.from('issues').select('id, title, type, status, assignee_id, reporter_id, due_date, created_at, updated_at, project_id, sprint_id'),
        supabase.from('test_results').select('id, executed_by, status, executed_at, elapsed_minutes'),
        supabase.from('project_members').select('user_id, role, project_id, profiles(id, name, email), projects(name, key)'),
        supabase.from('sprints').select('id, project_id, status').eq('status', 'active'),
      ])
      setIssues(issueRows || [])
      setResults(resultRows || [])
      setMemberships(memberRows || [])
      setSprints(sprintRows || [])
      setLoading(false)
    }
    fetchAll()
  }, [])

  const members = useMemo(() => {
    const byUser = {}
    memberships.forEach((m) => {
      if (!m.profiles) return
      byUser[m.profiles.id] = byUser[m.profiles.id] || { profile: m.profiles, memberships: [] }
      byUser[m.profiles.id].memberships.push(m)
    })

    const activeSprintIds = new Set(sprints.map((s) => s.id))

    const rows = Object.values(byUser).map(({ profile, memberships: mems }) => {
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
        myIssues,
      }
    })

    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [issues, results, memberships, sprints])

  const maxCompletedToday = Math.max(1, ...members.map((m) => m.completedToday))

  const summary = useMemo(() => {
    const done = issues.filter((i) => i.status === 'done')
    const avgCloseDays = done.length
      ? done.reduce((sum, i) => {
          const created = toDate(i.created_at)
          const updated = toDate(i.updated_at)
          if (!created || !updated) return sum
          return sum + (updated.getTime() - created.getTime()) / 86400000
        }, 0) / done.length
      : 0

    return {
      totalMembers: members.length,
      totalAssigned: issues.filter((i) => i.assignee_id).length,
      completedToday: issues.filter((i) => i.status === 'done' && isToday(i.updated_at)).length,
      inProgress: issues.filter((i) => ['in_progress', 'in_review'].includes(i.status)).length,
      pending: issues.filter((i) => i.status === 'todo').length,
      overdue: issues.filter((i) => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'done').length,
      productivity: issues.length ? Math.round((done.length / issues.length) * 100) : 0,
      avgCloseDays: avgCloseDays.toFixed(1),
    }
  }, [issues, members.length])

  const openDetails = (member) => {
    setSelected(member)
    setLoadingTimeline(true)
    supabase
      .from('activity_log')
      .select('*')
      .eq('actor_id', member.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        const issueTitle = (id) => issues.find((i) => i.id === id)?.title || 'a task'

        const taskEvents = (data || [])
          .filter((a) => a.action_type === 'status_changed' && (a.new_value === 'in_progress' || a.new_value === 'done'))
          .map((a) => ({
            id: `act-${a.id}`,
            type: a.new_value === 'in_progress' ? 'Task Started' : 'Task Completed',
            label: issueTitle(a.issue_id),
            at: a.created_at,
          }))

        const bugEvents = issues
          .filter((i) => i.type === 'bug' && i.reporter_id === member.id)
          .map((i) => ({ id: `bug-${i.id}`, type: 'Bug Created', label: i.title, at: i.created_at }))

        const testEvents = results
          .filter((r) => r.executed_by === member.id)
          .map((r) => ({ id: `res-${r.id}`, type: 'Test Case Executed', label: r.status, at: r.executed_at }))

        const merged = [...taskEvents, ...bugEvents, ...testEvents]
          .filter((e) => e.at)
          .sort((a, b) => (toDate(b.at)?.getTime() || 0) - (toDate(a.at)?.getTime() || 0))
          .slice(0, 25)

        setTimeline(merged)
        setLoadingTimeline(false)
      })
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Team Performance' }]} />
        <PageHeader title="Team Performance" subtitle="Daily productivity, assigned work, and performance across your team" />

        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 bg-gray-700 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatCard icon={Users} label="Total Team Members" value={summary.totalMembers} tint="bg-blue-50 text-blue-600" />
              <StatCard icon={ListChecks} label="Total Assigned Tasks" value={summary.totalAssigned} tint="bg-gray-100 text-gray-600" />
              <StatCard icon={CheckCircle2} label="Tasks Completed Today" value={summary.completedToday} tint="bg-green-50 text-green-600" />
              <StatCard icon={Loader} label="Tasks In Progress" value={summary.inProgress} tint="bg-blue-50 text-blue-600" />
              <StatCard icon={Clock} label="Pending Tasks" value={summary.pending} tint="bg-orange-50 text-orange-600" />
              <StatCard icon={AlertTriangle} label="Overdue Tasks" value={summary.overdue} tint="bg-red-50 text-red-600" />
              <StatCard icon={TrendingUp} label="Team Productivity" value={`${summary.productivity}%`} tint="bg-purple-50 text-purple-600" />
              <StatCard icon={Timer} label="Avg. Time to Close" value={`${summary.avgCloseDays}d`} tint="bg-gray-100 text-gray-600" />
            </div>
          )}

          <EnterpriseTable
            loading={loading}
            rows={members}
            rowKey={(m) => m.id}
            onRowClick={openDetails}
            emptyState={<p className="text-[13px] text-gray-500 text-center py-10">No team members yet — add members to a project from Users &amp; Roles.</p>}
            columns={[
              {
                key: 'name', label: 'Employee',
                render: (m) => (
                  <div>
                    <p className="text-white font-medium">{m.name}</p>
                    <p className="text-[11px] text-gray-500">{m.email}</p>
                  </div>
                ),
              },
              { key: 'role', label: 'Role', render: (m) => <StatusBadge domain={PROJECT_MEMBER_ROLE} value={m.role} size="sm" /> },
              {
                key: 'team', label: 'Team',
                render: (m) => (
                  <div className="flex flex-wrap gap-1 max-w-[140px]">
                    {m.projectBadges.slice(0, 3).map((p) => (
                      <span key={p.projectId} className="text-[10px] px-1 py-0.5 rounded bg-gray-700 text-gray-400">{p.key}</span>
                    ))}
                    {m.projectBadges.length > 3 && <span className="text-[10px] text-gray-500">+{m.projectBadges.length - 3}</span>}
                  </div>
                ),
              },
              { key: 'total', label: 'Assigned' },
              { key: 'completed', label: 'Completed' },
              { key: 'remaining', label: 'Remaining' },
              { key: 'testsExecuted', label: 'Tests Executed' },
              { key: 'bugsReported', label: 'Bugs Reported' },
              { key: 'bugsFixed', label: 'Bugs Fixed' },
              { key: 'activeProjects', label: 'Projects' },
              {
                key: 'loggedMinutesToday', label: 'Logged Today',
                render: (m) => m.loggedMinutesToday > 0 ? `${Math.floor(m.loggedMinutesToday / 60)}h ${m.loggedMinutesToday % 60}m` : '—',
              },
              {
                key: 'progress', label: 'Progress', width: '170px',
                render: (m) => (
                  <div className="space-y-1 py-1">
                    <MiniBar label="TC" pct={m.taskCompletionPct} color="bg-blue-500" />
                    <MiniBar label="DP" pct={Math.round((m.completedToday / maxCompletedToday) * 100)} color="bg-green-500" />
                    <MiniBar label="SP" pct={m.sprintProgress} color="bg-purple-500" />
                  </div>
                ),
              },
              { key: 'lastActivity', label: 'Last Activity', render: (m) => timeAgo(m.lastActivity?.toISOString()) },
              { key: 'status', label: 'Status', render: (m) => <StatusBadge domain={MEMBER_STATUS} value={m.status} dot /> },
              { key: 'overdue', label: 'Due', render: (m) => m.overdue > 0 ? <span className="text-red-600 font-medium">{m.overdue}</span> : '0' },
              { key: 'rating', label: 'Rating', render: (m) => <Stars rating={m.rating} /> },
              {
                key: 'actions', label: '', width: '90px',
                render: (m) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); openDetails(m) }}
                    className="flex items-center gap-1 text-[12px] text-blue-600 hover:underline"
                  >
                    <Eye size={13} /> View
                  </button>
                ),
              },
            ]}
          />

          <p className="text-[11px] text-gray-500 mt-3">
            TC = Task Completion · DP = Daily Productivity (relative to today's top performer) · SP = Sprint Progress (active sprint only)
          </p>
        </div>
      </div>

      <SidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name}
        subtitle={selected?.email}
        width="lg"
      >
        {selected && (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Today's Work</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Assigned', value: selected.total },
                  { label: 'Completed Today', value: selected.completedToday },
                  { label: 'Pending', value: selected.remaining },
                  { label: 'Overdue', value: selected.overdue },
                  { label: 'Tests Executed Today', value: selected.testsExecutedToday },
                  { label: 'Passed', value: selected.testsPassedToday },
                  { label: 'Failed', value: selected.testsFailedToday },
                  { label: 'Blocked', value: selected.testsBlockedToday },
                  { label: 'Bugs Created', value: selected.bugsReportedToday },
                  { label: 'Bugs Resolved', value: selected.bugsFixedToday },
                ].map((s) => (
                  <div key={s.label} className="border border-gray-600 rounded-md px-3 py-2">
                    <p className="text-lg font-semibold text-white">{s.value}</p>
                    <p className="text-[11px] text-gray-500">{s.label}</p>
                  </div>
                ))}
                <div className="border border-gray-600 rounded-md px-3 py-2 col-span-2">
                  <p className="text-lg font-semibold text-white">
                    {selected.loggedMinutesToday > 0 ? `${Math.floor(selected.loggedMinutesToday / 60)}h ${selected.loggedMinutesToday % 60}m` : '—'}
                  </p>
                  <p className="text-[11px] text-gray-500">Logged Time Today (from recorded test execution durations)</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Activity</p>
              {loadingTimeline ? (
                <p className="text-[12px] text-gray-500">Loading…</p>
              ) : timeline.length === 0 ? (
                <p className="text-[12px] text-gray-500">No recent activity.</p>
              ) : (
                <div className="space-y-2.5">
                  {timeline.map((e) => (
                    <div key={e.id} className="flex items-start gap-2.5 text-[12px]">
                      <span className="mt-0.5 flex-shrink-0">
                        {e.type === 'Test Case Executed' && <PlayCircle size={13} className="text-blue-500" />}
                        {e.type === 'Bug Created' && <Bug size={13} className="text-red-500" />}
                        {e.type === 'Task Started' && <Loader size={13} className="text-orange-500" />}
                        {e.type === 'Task Completed' && <CheckCircle2 size={13} className="text-green-500" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300">
                          <span className="font-medium text-white">{e.type}</span>
                          {e.type === 'Test Case Executed' ? (
                            <> — <StatusBadge domain={TEST_RUN_RESULT} value={e.label} size="sm" /></>
                          ) : (
                            <span className="text-gray-400"> — {e.label}</span>
                          )}
                        </p>
                        <p className="text-gray-500">{timeAgo(e.at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-500 mt-3">
                Login/logout tracking isn't available — this app doesn't log session times.
              </p>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  )
}
