import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, PlayCircle, Bug, UserPlus, CheckCircle2, Pencil, Activity } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import BentoCard from '../../components/ui/BentoCard'
import ProgressRing from '../../components/ui/ProgressRing'
import InfoTip from '../../components/ui/InfoTip'
import { METRIC_HELP } from '../../lib/metricHelp'
import StatusBadge from '../../components/ui/StatusBadge'
import ActivityHeatmap from '../../components/ui/ActivityHeatmap'
import TrendChart from '../../components/ui/TrendChart'
import EmptyState from '../../components/ui/EmptyState'
import { MEMBER_STATUS, PROJECT_MEMBER_ROLE, VMS_RESULT } from '../../lib/statusConfig'
import { AUDIT_ACTIONS, formatAuditTime } from '../../lib/auditLog'
import { browserTimeZone, buildHeatmapDays, timeAgo } from '../../lib/performanceScore'

// One person's real work: their assigned test cases and To-Do tasks, the
// results they recorded, and their activity log — all from member_performance().

const ICON_FOR = {
  result_changed: PlayCircle,
  failure_comment_edited: Bug,
  block_reason_edited: Bug,
  assigned: UserPlus,
  unassigned: UserPlus,
  bulk_assigned: UserPlus,
  section_assigned: UserPlus,
  task_completed: CheckCircle2,
  task_closed: CheckCircle2,
  task_reopened: Activity,
  row_added: Pencil,
  row_edited: Pencil,
  row_deleted: Pencil,
}

const ICON_TONE = {
  result_changed: 'text-blue-500',
  failure_comment_edited: 'text-red-500',
  block_reason_edited: 'text-orange-600',
  assigned: 'text-purple-600',
  unassigned: 'text-gray-400',
  bulk_assigned: 'text-purple-600',
  section_assigned: 'text-purple-600',
  task_completed: 'text-green-600',
  task_closed: 'text-gray-400',
}

export default function AdminMemberProfilePage() {
  const { memberId } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .rpc('member_performance', { p_member: memberId, p_timezone: browserTimeZone() })
      .then(({ data: row, error }) => {
        if (error) setLoadError(error.message)
        else { setData(row); setLoadError(null) }
        setLoading(false)
      })
  }, [memberId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <AdminSidebar />
        <div className="flex-1 p-6 animate-pulse">
          <div className="h-8 w-96 bg-gray-800 rounded-lg" />
        </div>
      </div>
    )
  }

  if (loadError || !data) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <AdminSidebar />
        <div className="flex-1 min-w-0">
          <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Team Performance', to: '/admin/team-performance' }]} />
          <div className="p-6">
            <EmptyState icon={Activity} title="Team member unavailable" description={loadError || 'This team member no longer exists.'} />
          </div>
        </div>
      </div>
    )
  }

  const m = data.member
  const heatmapDays = buildHeatmapDays(data.activityByDay)
  const initials = (m.name || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader
          breadcrumb={[
            { label: 'Administration', to: '/admin' },
            { label: 'Team Performance', to: '/admin/team-performance' },
            { label: m.name },
          ]}
        />
        <PageHeader title={m.name} subtitle={m.email} />

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
                <h2 className="text-[17px] font-semibold text-white">{m.name}</h2>
                <p className="text-[13px] text-gray-500">{m.email}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <StatusBadge domain={PROJECT_MEMBER_ROLE} value={m.role} size="sm" />
                  <StatusBadge domain={MEMBER_STATUS} value={m.status} dot size="sm" />
                  {m.projectBadges.map((p) => (
                    <span key={p.projectId} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{p.key}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="text-center">
                  <ProgressRing percent={m.performanceScore} size={64} strokeColor="stroke-blue-500" label={String(m.performanceScore)} />
                  <p className="text-[10px] text-gray-500 mt-1">Performance</p>
                </div>
                <div className="text-center">
                  <ProgressRing percent={m.qualityScore ?? 0} size={64} strokeColor="stroke-green-500" label={m.qualityScore === null ? '—' : String(m.qualityScore)} />
                  <p className="text-[10px] text-gray-500 mt-1">Pass Rate</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-3 pt-3 border-t border-gray-750">
              Last active {timeAgo(m.lastActivity)} · Performance blends task completion with the pass rate of the results they recorded.
              Pass Rate is Pass results ÷ results they recorded.
            </p>
          </BentoCard>

          {/* Work tiles */}
          <BentoCard className="p-5">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Assigned Work</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'Assigned test cases', value: m.total, help: METRIC_HELP.assigned },
                { label: 'Completed', value: m.completed, help: METRIC_HELP.completed },
                { label: 'In progress', value: m.inProgress, help: METRIC_HELP.inProgress },
                { label: 'Not started', value: m.pending, help: METRIC_HELP.notStarted },
                { label: 'Overdue', value: m.overdue, help: METRIC_HELP.overdue },
              ].map((s) => (
                <div key={s.label} className="border border-gray-600 rounded-md px-3 py-2">
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1">
                    {s.label}
                    <InfoTip label={s.label} text={s.help} />
                  </p>
                </div>
              ))}
            </div>

            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-3">Today</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'Tasks completed', value: m.completedToday, help: METRIC_HELP.tasksCompletedToday },
                { label: 'Tests executed', value: m.testsExecutedToday, help: METRIC_HELP.testsExecutedToday },
                { label: 'Passed', value: m.testsPassedToday, help: METRIC_HELP.passedToday },
                { label: 'Failed', value: m.testsFailedToday, help: METRIC_HELP.failedToday },
                { label: 'Blocked', value: m.testsBlockedToday, help: METRIC_HELP.blockedToday },
              ].map((s) => (
                <div key={s.label} className="border border-gray-600 rounded-md px-3 py-2">
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1">
                    {s.label}
                    <InfoTip label={s.label} text={s.help} />
                  </p>
                </div>
              ))}
            </div>

            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-3">All Time</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'Tests executed', value: m.testsExecuted, help: METRIC_HELP.testsExecuted },
                { label: 'Bugs reported', value: m.bugsReported, help: METRIC_HELP.bugsReported },
                { label: 'Bugs fixed', value: m.bugsFixed, help: METRIC_HELP.bugsFixed },
                { label: 'Pass rate', value: m.passRate === null ? '—' : `${m.passRate}%`, help: METRIC_HELP.passRate },
                { label: 'Actions today', value: m.actionsToday, help: METRIC_HELP.actionsToday },
              ].map((s) => (
                <div key={s.label} className="border border-gray-600 rounded-md px-3 py-2">
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1">
                    {s.label}
                    <InfoTip label={s.label} text={s.help} />
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-3">
              A test case counts as in progress once this person records a result on it after it was assigned to them.
              Bugs reported are results they set to Fail or Blocked; bugs fixed are results they moved back to Pass.
            </p>
          </BentoCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Project allocation */}
            <BentoCard className="p-5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Project Allocation</p>
              <div className="space-y-3">
                {data.projectAllocation.map((p) => (
                  <div key={p.projectId}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="text-gray-300 truncate">{p.name}</span>
                      <span className="text-gray-500">{p.done}/{p.total} completed</span>
                    </div>
                    <div className="w-full bg-gray-750 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                ))}
                {data.projectAllocation.length === 0 && <p className="text-[12px] text-gray-500">Not a member of any project yet.</p>}
              </div>
              <p className="text-[11px] text-gray-500 mt-3 pt-3 border-t border-gray-750">
                Test cases assigned to {m.name.split(' ')[0]} in each project, and how many are completed.
              </p>
            </BentoCard>

            {/* Executions per day */}
            <BentoCard className="p-5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Test Executions</p>
              <p className="text-[11px] text-gray-500 mb-3">Results recorded per day, last 14 days</p>
              <TrendChart data={data.executionsByDay} color="blue" />
            </BentoCard>
          </div>

          {/* Activity heatmap */}
          <BentoCard className="p-5 overflow-x-auto">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity</p>
            <ActivityHeatmap days={heatmapDays} />
          </BentoCard>

          {/* Recent work */}
          <BentoCard className="p-5">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Work</p>
            {data.timeline.length === 0 ? (
              <p className="text-[12px] text-gray-500">No recorded activity yet.</p>
            ) : (
              <div className="space-y-2.5">
                {data.timeline.map((e) => {
                  const Icon = ICON_FOR[e.action] || Activity
                  return (
                    <div key={e.id} className="flex items-start gap-2.5 text-[12px]">
                      <span className="mt-0.5 flex-shrink-0">
                        <Icon size={13} className={ICON_TONE[e.action] || 'text-gray-400'} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300">
                          <span className="font-medium text-white">{AUDIT_ACTIONS[e.action]?.label || e.action}</span>
                          {e.label && <span className="text-gray-400"> — {e.label}</span>}
                          {e.action === 'result_changed' && e.result && (
                            <> <StatusBadge domain={VMS_RESULT} value={e.result} size="sm" /></>
                          )}
                        </p>
                        <p className="text-gray-500">
                          {formatAuditTime(e.at)}
                          {e.plan && ` · ${e.plan}`}
                          {e.comment && ` · ${e.comment}`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[11px] text-gray-500 mt-3">
              The 50 most recent entries from the activity log. Login and logout times aren't shown — this app doesn't record sessions.
            </p>
          </BentoCard>
        </div>
      </div>
    </div>
  )
}
