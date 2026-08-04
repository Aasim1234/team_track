import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, ListChecks, CheckCircle2, Clock, AlertTriangle, TrendingUp, Timer, Loader,
  Eye, LayoutGrid, Rows3, Trophy,
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
import { computeMemberStats, isToday, toDate, timeAgo } from '../../lib/performanceScore'

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
  const [issues, setIssues] = useState([])
  const [results, setResults] = useState([])
  const [memberships, setMemberships] = useState([])
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('table')

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

    const rows = Object.values(byUser).map(({ profile, memberships: mems }) =>
      computeMemberStats(profile, mems, { issues, results, activeSprintIds })
    )

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

          {viewMode === 'cards' && !loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {members.map((m) => <TeamMemberCard key={m.id} member={m} />)}
              {members.length === 0 && <p className="text-[13px] text-gray-500 text-center py-10 col-span-full">No team members yet — add members to a project from Users &amp; Roles.</p>}
            </div>
          )}

          {viewMode === 'leaderboard' && !loading && (
            <div className="space-y-2 max-w-xl">
              {leaderboard.map((m, i) => <TeamMemberCard key={m.id} member={m} rank={i + 1} />)}
              {leaderboard.length === 0 && <p className="text-[13px] text-gray-500 text-center py-10">No team members yet — add members to a project from Users &amp; Roles.</p>}
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
          <p className="text-[11px] text-gray-500 mt-3">
            TC = Task Completion · DP = Daily Productivity (relative to today's top performer) · SP = Sprint Progress (active sprint only)
          </p>
          )}
        </div>
      </div>
    </div>
  )
}
