import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, ListChecks, CheckCircle2, Clock, AlertTriangle, TrendingUp, Timer, Loader,
  Eye, LayoutGrid, Rows3, Trophy, PlayCircle, Inbox,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import EnterpriseTable from '../../components/ui/EnterpriseTable'
import StatusBadge from '../../components/ui/StatusBadge'
import StatCard from '../../components/ui/StatCard'
import ProgressRing from '../../components/ui/ProgressRing'
import TeamMemberCard from '../../components/TeamMemberCard'
import { MEMBER_STATUS, PROJECT_MEMBER_ROLE } from '../../lib/statusConfig'
import { browserTimeZone, timeAgo } from '../../lib/performanceScore'

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

export default function AdminTeamPerformancePage() {
  const navigate = useNavigate()
  const [members, setMembers] = useState([])
  const [summary, setSummary] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('table')

  // Every figure comes from team_performance(), which reads the real
  // assignments, To-Do task status, recorded results and activity log.
  useEffect(() => {
    supabase.rpc('team_performance', { p_timezone: browserTimeZone() }).then(({ data, error }) => {
      if (error) setLoadError(error.message)
      else {
        setMembers(data?.members || [])
        setSummary(data?.summary || null)
      }
      setLoading(false)
    })
  }, [])

  const maxCompletedToday = Math.max(1, ...members.map((m) => m.completedToday))

  const openProfile = (member) => navigate(`/admin/team-performance/${member.id}`)

  const leaderboard = useMemo(
    () => [...members].sort((a, b) => b.performanceScore - a.performanceScore),
    [members]
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Team Performance' }]} />
        <PageHeader
          title="Team Performance"
          subtitle="Daily productivity, assigned work, and performance across your team"
          actions={
            <div className="flex items-center gap-1 border border-gray-600 rounded-md p-0.5">
              {[
                { key: 'table', label: 'Table', icon: Rows3 },
                { key: 'cards', label: 'Cards', icon: LayoutGrid },
                { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
              ].map((v) => (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium transition-colors duration-150 ${
                    viewMode === v.key ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <v.icon size={13} /> {v.label}
                </button>
              ))}
            </div>
          }
        />

        <div className="p-6">
          {loadError && (
            <p className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-[12px] text-red-500">
              {loadError}
            </p>
          )}

          {loading || !summary ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 bg-gray-700 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatCard icon={Users} label="Total Team Members" value={summary.totalMembers} tint="bg-blue-50 text-blue-600" />
              <StatCard icon={ListChecks} label="Total Assigned Test Cases" value={summary.totalAssigned} tint="bg-gray-100 text-gray-600" />
              <StatCard icon={CheckCircle2} label="Tasks Completed Today" value={summary.completedToday} tint="bg-green-50 text-green-600" />
              <StatCard icon={Loader} label="Tasks In Progress" value={summary.inProgress} tint="bg-blue-50 text-blue-600" />
              <StatCard icon={Clock} label="Pending Tasks" value={summary.pending} tint="bg-orange-50 text-orange-600" />
              <StatCard icon={AlertTriangle} label="Overdue Tasks" value={summary.overdue} tint="bg-red-50 text-red-600" />
              <StatCard icon={TrendingUp} label="Team Productivity" value={`${summary.productivity}%`} tint="bg-purple-50 text-purple-600" />
              <StatCard icon={Timer} label="Avg. Time to Close" value={`${summary.avgCloseDays}d`} tint="bg-gray-100 text-gray-600" />
              <StatCard icon={PlayCircle} label="Tests Executed" value={summary.testsExecuted} tint="bg-blue-50 text-blue-600" />
              <StatCard icon={Inbox} label="Unassigned Test Cases" value={summary.unassignedCases} tint="bg-orange-50 text-orange-600" />
            </div>
          )}

          {viewMode === 'cards' && !loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {members.map((m) => <TeamMemberCard key={m.id} member={m} />)}
              {members.length === 0 && <p className="text-[13px] text-gray-500 text-center py-10 col-span-full">No users yet — add people from Users &amp; Roles.</p>}
            </div>
          )}

          {viewMode === 'leaderboard' && !loading && (
            <div className="space-y-2 max-w-xl">
              {leaderboard.map((m, i) => <TeamMemberCard key={m.id} member={m} rank={i + 1} />)}
              {leaderboard.length === 0 && <p className="text-[13px] text-gray-500 text-center py-10">No users yet — add people from Users &amp; Roles.</p>}
            </div>
          )}

          {viewMode === 'table' && (
          <EnterpriseTable
            loading={loading}
            rows={members}
            rowKey={(m) => m.id}
            onRowClick={openProfile}
            stickyHeader
            maxHeight="65vh"
            emptyState={<p className="text-[13px] text-gray-500 text-center py-10">No users yet — add people from Users &amp; Roles.</p>}
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
              { key: 'remaining', label: 'Remaining', render: (m) => m.remaining > 0 ? `${m.remaining} (${m.inProgress} in progress)` : '0' },
              { key: 'testsExecuted', label: 'Tests Executed' },
              { key: 'bugsReported', label: 'Bugs Reported' },
              { key: 'bugsFixed', label: 'Bugs Fixed' },
              { key: 'activeProjects', label: 'Projects' },
              { key: 'actionsToday', label: 'Actions Today', render: (m) => m.actionsToday > 0 ? m.actionsToday : '—' },
              {
                key: 'progress', label: 'Progress', width: '170px',
                render: (m) => (
                  <div className="space-y-1 py-1">
                    <MiniBar label="TC" pct={m.total > 0 ? m.taskCompletionPct : null} color="bg-blue-500" />
                    <MiniBar label="DP" pct={Math.round((m.completedToday / maxCompletedToday) * 100)} color="bg-green-500" />
                    <MiniBar label="PR" pct={m.passRate} color="bg-purple-500" />
                  </div>
                ),
              },
              { key: 'lastActivity', label: 'Last Activity', render: (m) => timeAgo(m.lastActivity) },
              { key: 'status', label: 'Status', render: (m) => <StatusBadge domain={MEMBER_STATUS} value={m.status} dot /> },
              { key: 'overdue', label: 'Due', render: (m) => m.overdue > 0 ? <span className="text-red-600 font-medium">{m.overdue}</span> : '0' },
              {
                key: 'rating', label: 'Score',
                render: (m) => <ProgressRing percent={m.performanceScore} size={28} strokeColor="stroke-blue-500" label={String(m.performanceScore)} />,
              },
              {
                key: 'actions', label: '', width: '90px',
                render: (m) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); openProfile(m) }}
                    className="flex items-center gap-1 text-[12px] text-blue-600 hover:underline"
                  >
                    <Eye size={13} /> View
                  </button>
                ),
              },
            ]}
          />
          )}

          {viewMode === 'table' && (
          <div className="text-[11px] text-gray-500 mt-3 space-y-1">
            <p>TC = Task Completion · DP = Daily Productivity (relative to today's top performer) · PR = Pass Rate of the results they recorded</p>
            <p>
              Assigned, Completed and Remaining come from test cases assigned to each person and their To-Do task status.
              Tests Executed, Bugs Reported / Fixed, Actions Today and Last Activity come from the activity log.
              A task counts as overdue once its test plan's target date has passed.
            </p>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
