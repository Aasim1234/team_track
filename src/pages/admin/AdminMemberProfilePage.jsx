import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, PlayCircle, Bug, Loader, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import BentoCard from '../../components/ui/BentoCard'
import ProgressRing from '../../components/ui/ProgressRing'
import StatusBadge from '../../components/ui/StatusBadge'
import ActivityHeatmap from '../../components/ui/ActivityHeatmap'
import TrendChart from '../../components/ui/TrendChart'
import { MEMBER_STATUS, PROJECT_MEMBER_ROLE, TEST_RUN_RESULT } from '../../lib/statusConfig'
import { computeMemberStats, buildMemberTimeline, toDate, timeAgo } from '../../lib/performanceScore'

function dayKey(d) {
  return d.toISOString().slice(0, 10)
}

function last14Days() {
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d)
  }
  return days
}

function bucketByDay(timestamps, numDays = 98) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - (numDays - 1))
  start.setDate(start.getDate() - start.getDay())

  const end = new Date(today)
  end.setDate(end.getDate() + (6 - end.getDay()))

  const counts = {}
  timestamps.forEach((at) => {
    const d = toDate(at)
    if (!d) return
    counts[dayKey(d)] = (counts[dayKey(d)] || 0) + 1
  })

  const days = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = dayKey(cursor)
    days.push({ date: key, count: counts[key] || 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export default function AdminMemberProfilePage() {
  const { memberId } = useParams()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [issues, setIssues] = useState([])
  const [results, setResults] = useState([])
  const [sprints, setSprints] = useState([])
  const [activityRows, setActivityRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      const [
        { data: profileRow },
        { data: memberRows },
        { data: issueRows },
        { data: resultRows },
        { data: sprintRows },
        { data: activityData },
      ] = await Promise.all([
        supabase.from('profiles').select('id, name, email').eq('id', memberId).single(),
        supabase.from('project_members').select('project_id, role, projects(name, key)').eq('user_id', memberId),
        supabase.from('issues').select('id, title, type, status, assignee_id, reporter_id, due_date, created_at, updated_at, project_id, sprint_id'),
        supabase.from('test_results').select('id, executed_by, status, executed_at, elapsed_minutes'),
        supabase.from('sprints').select('id, project_id, status').eq('status', 'active'),
        supabase.from('activity_log').select('*').eq('actor_id', memberId).order('created_at', { ascending: false }).limit(500),
      ])
      setProfile(profileRow)
      setMemberships(memberRows || [])
      setIssues(issueRows || [])
      setResults(resultRows || [])
      setSprints(sprintRows || [])
      setActivityRows(activityData || [])
      setLoading(false)
    }
    fetchAll()
  }, [memberId])

  const stats = useMemo(() => {
    if (!profile) return null
    const activeSprintIds = new Set(sprints.map((s) => s.id))
    return computeMemberStats(profile, memberships, { issues, results, activeSprintIds })
  }, [profile, memberships, issues, results, sprints])

  const timeline = useMemo(() => {
    if (!profile) return []
    return buildMemberTimeline(memberId, { issues, results }, activityRows)
  }, [profile, memberId, issues, results, activityRows])

  const heatmapDays = useMemo(() => {
    const bugTimestamps = issues.filter((i) => i.type === 'bug' && i.reporter_id === memberId).map((i) => i.created_at)
    const testTimestamps = results.filter((r) => r.executed_by === memberId).map((r) => r.executed_at)
    const activityTimestamps = activityRows.map((a) => a.created_at)
    return bucketByDay([...bugTimestamps, ...testTimestamps, ...activityTimestamps])
  }, [issues, results, activityRows, memberId])

  const loggedTimeTrend = useMemo(() => {
    const days = last14Days()
    return days.map((d) => ({
      label: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      value: results
        .filter((r) => r.executed_by === memberId)
        .filter((r) => { const rd = toDate(r.executed_at); return rd && dayKey(rd) === dayKey(d) })
        .reduce((sum, r) => sum + (r.elapsed_minutes || 0), 0),
    }))
  }, [results, memberId])

  const projectAllocation = useMemo(() => {
    if (!stats) return []
    return memberships.map((m) => {
      const projectIssues = stats.myIssues.filter((i) => i.project_id === m.project_id)
      const done = projectIssues.filter((i) => i.status === 'done').length
      const total = projectIssues.length
      return {
        projectId: m.project_id,
        name: m.projects?.name || 'Unknown project',
        key: m.projects?.key,
        done,
        total,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
      }
    })
  }, [stats, memberships])

  if (loading || !profile || !stats) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <AdminSidebar />
        <div className="flex-1 p-6 animate-pulse">
          <div className="h-8 w-96 bg-gray-800 rounded-lg" />
        </div>
      </div>
    )
  }

  const initials = stats.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader
          breadcrumb={[
            { label: 'Administration', to: '/admin' },
            { label: 'Team Performance', to: '/admin/team-performance' },
            { label: stats.name },
          ]}
        />
        <PageHeader title={stats.name} subtitle={stats.email} />

        <div className="p-6 max-w-6xl mx-auto space-y-4">
          <button
            onClick={() => navigate('/admin/team-performance')}
            className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-white"
          >
            <ArrowLeft size={14} /> All Team Members
          </button>

          {/* Profile header */}
          <BentoCard className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center text-[18px] font-bold text-white flex-shrink-0">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[17px] font-semibold text-white">{stats.name}</h2>
                <p className="text-[13px] text-gray-500">{stats.email}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <StatusBadge domain={PROJECT_MEMBER_ROLE} value={stats.role} size="sm" />
                  <StatusBadge domain={MEMBER_STATUS} value={stats.status} dot size="sm" />
                  {stats.projectBadges.map((p) => (
                    <span key={p.projectId} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{p.key}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="text-center">
                  <ProgressRing percent={stats.performanceScore} size={64} strokeColor="stroke-blue-500" label={String(stats.performanceScore)} />
                  <p className="text-[10px] text-gray-500 mt-1">Performance</p>
                </div>
                <div className="text-center">
                  <ProgressRing percent={stats.qualityScore ?? 0} size={64} strokeColor="stroke-green-500" label={stats.qualityScore === null ? '—' : String(stats.qualityScore)} />
                  <p className="text-[10px] text-gray-500 mt-1">Quality</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-3 pt-3 border-t border-gray-750">
              Last active {timeAgo(stats.lastActivity?.toISOString())} · Performance Score blends task completion, pass rate, and on-time delivery. Quality Score is pass rate alone.
            </p>
          </BentoCard>

          {/* Capacity tiles */}
          <BentoCard className="p-5">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Today's Work</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'Assigned', value: stats.total },
                { label: 'Completed Today', value: stats.completedToday },
                { label: 'Pending', value: stats.remaining },
                { label: 'Overdue', value: stats.overdue },
                { label: 'Tests Executed Today', value: stats.testsExecutedToday },
                { label: 'Passed', value: stats.testsPassedToday },
                { label: 'Failed', value: stats.testsFailedToday },
                { label: 'Blocked', value: stats.testsBlockedToday },
                { label: 'Bugs Created', value: stats.bugsReportedToday },
                { label: 'Bugs Resolved', value: stats.bugsFixedToday },
              ].map((s) => (
                <div key={s.label} className="border border-gray-600 rounded-md px-3 py-2">
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                  <p className="text-[11px] text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
          </BentoCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sprint contribution + project allocation */}
            <BentoCard className="p-5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Project Allocation</p>
              <div className="space-y-3">
                {projectAllocation.map((p) => (
                  <div key={p.projectId}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="text-gray-300 truncate">{p.name}</span>
                      <span className="text-gray-500">{p.done}/{p.total}</span>
                    </div>
                    <div className="w-full bg-gray-750 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                ))}
                {projectAllocation.length === 0 && <p className="text-[12px] text-gray-500">Not a member of any project yet.</p>}
              </div>
              <p className="text-[11px] text-gray-500 mt-3 pt-3 border-t border-gray-750">
                Sprint contribution (active sprint): <span className="text-white font-semibold">{stats.sprintProgress === null ? 'No active sprint' : `${stats.sprintProgress}%`}</span>
              </p>
            </BentoCard>

            {/* Logged time */}
            <BentoCard className="p-5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Time Logged</p>
              <p className="text-[11px] text-gray-500 mb-3">Minutes per day, from recorded test execution durations, last 14 days</p>
              <TrendChart data={loggedTimeTrend} color="blue" />
            </BentoCard>
          </div>

          {/* Activity heatmap */}
          <BentoCard className="p-5 overflow-x-auto">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity</p>
            <ActivityHeatmap days={heatmapDays} />
          </BentoCard>

          {/* Recent work / timeline */}
          <BentoCard className="p-5">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Work</p>
            {timeline.length === 0 ? (
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
          </BentoCard>
        </div>
      </div>
    </div>
  )
}
