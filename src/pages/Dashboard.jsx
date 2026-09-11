import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FolderKanban, ListChecks, PlayCircle, TrendingUp,
  ArrowUpRight, User, Activity as ActivityIcon, Star, Sparkles,
  CalendarClock, UserPlus, RefreshCw, MessageSquare, Bell, Rocket,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAllRows'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import { useToast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import FormField, { inputClass } from '../components/ui/FormField'
import PrimaryButton from '../components/ui/Button'
import TrendChart from '../components/ui/TrendChart'
import ProgressRing from '../components/ui/ProgressRing'
import StatCard from '../components/ui/StatCard'
import BentoCard from '../components/ui/BentoCard'
import EmptyState from '../components/ui/EmptyState'
import { summarizeCases, formatPercent } from '../lib/testMetrics'
import { AUDIT_ACTIONS } from '../lib/auditLog'
import { Donut, Swatch, CASE_SERIES, fmt, pctLabel } from '../components/charts/CoverageCharts'
import { fadeInUp, staggerContainer, TRANSITION } from '../lib/motion'

const NOTIFICATION_ICON = {
  assigned: UserPlus,
  status_changed: RefreshCw,
  comment: MessageSquare,
}

function toDate(dateStr) {
  if (!dateStr) return null
  const hasOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(dateStr)
  const d = new Date(hasOffset ? dateStr : `${dateStr}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

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

function timeAgo(dateStr) {
  const d = toDate(dateStr)
  if (!d) return ''
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDueDate(dateStr) {
  const d = toDate(dateStr)
  if (!d) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const toast = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { notifications } = useNotifications()

  const [projects, setProjects] = useState([])
  const [issues, setIssues] = useState([])
  const [testCases, setTestCases] = useState([])
  const [testRuns, setTestRuns] = useState([])
  const [statusRows, setStatusRows] = useState([])
  const [testResults, setTestResults] = useState([])
  const [activity, setActivity] = useState([])
  const [sprints, setSprints] = useState([])
  const [starredIds, setStarredIds] = useState(new Set())
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const fetchAll = async () => {
    setLoading(true)
    const [
      { data: projectRows },
      { data: issueRows },
      { data: caseRows },
      { data: runRows },
      { data: statusData },
      { data: resultRows },
      { data: activityRows },
      { data: sprintRows },
      { data: starredRows },
    ] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('issues').select('id, project_id, title, type, status, priority, assignee_id, due_date, created_at, sprint_id'),
      fetchAllRows(() => supabase.from('test_cases').select('id, project_id').order('id')),
      supabase.from('test_runs').select('id, project_id, status'),
      fetchAllRows(() => supabase.from('test_run_case_current_status').select('run_case_id, test_case_id, current_status, last_executed_at').order('run_case_id')),
      fetchAllRows(() => supabase.from('test_results').select('id, executed_at').order('id')),
      supabase.from('audit_log').select('id, project_id, actor_name, action, entity_label, occurred_at').order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(8),
      supabase.from('sprints').select('id, project_id, name, status').eq('status', 'active'),
      user ? supabase.from('starred_projects').select('project_id').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ])
    setProjects(projectRows || [])
    setIssues(issueRows || [])
    setTestCases(caseRows || [])
    setTestRuns(runRows || [])
    setStatusRows(statusData || [])
    setTestResults(resultRows || [])
    setActivity(activityRows || [])
    setSprints(sprintRows || [])
    setStarredIds(new Set((starredRows || []).map((r) => r.project_id)))
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('projects').insert({
      name,
      key: key.toUpperCase(),
      created_by: user.id,
    })
    if (!error) {
      setName('')
      setKey('')
      setShowForm(false)
      fetchAll()
    } else {
      toast.error(error.message)
    }
  }

  // Test metrics come from the shared module, so this page, Test Coverage and
  // Reports always agree on what "test cases" and "pass rate" mean.
  const caseSummary = useMemo(() => summarizeCases(testCases, statusRows), [testCases, statusRows])
  const activeRuns = testRuns.filter((r) => r.status === 'active').length

  const executionTrend = useMemo(() => {
    const days = last14Days()
    return days.map((d) => ({
      label: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      value: testResults.filter((r) => { const rd = toDate(r.executed_at); return rd && dayKey(rd) === dayKey(d) }).length,
    }))
  }, [testResults])


  const sprintStatus = useMemo(() => {
    return sprints.map((s) => {
      const sprintIssues = issues.filter((i) => i.sprint_id === s.id)
      const done = sprintIssues.filter((i) => i.status === 'done').length
      const total = sprintIssues.length
      const project = projects.find((p) => p.id === s.project_id)
      return {
        id: s.id,
        name: s.name,
        projectId: s.project_id,
        projectName: project?.name || 'Unknown project',
        done,
        total,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
      }
    })
  }, [sprints, issues, projects])

  const starredProjects = projects.filter((p) => starredIds.has(p.id))

  const upcomingDueDates = issues
    .filter((i) => i.due_date && i.status !== 'done')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 6)

  const assignedToMe = issues
    .filter((i) => i.assignee_id === user?.id && i.status !== 'done')
    .sort((a, b) => (a.due_date ? new Date(a.due_date) : Infinity) - (b.due_date ? new Date(b.due_date) : Infinity))
    .slice(0, 5)

  const recentNotifications = notifications.slice(0, 5)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <ProjectSidebar />
        <div className="flex-1 min-w-0 p-6 md:p-8 animate-pulse">
          <div className="h-8 w-64 bg-gray-800 rounded-lg mb-6" />
          <div className="grid grid-cols-12 gap-4 mb-4">
            <div className="col-span-12 md:col-span-4 h-40 bg-gray-800 rounded-2xl" />
            <div className="col-span-12 md:col-span-8 h-40 bg-gray-800 rounded-2xl" />
          </div>
          <div className="grid grid-cols-12 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="col-span-12 md:col-span-4 h-32 bg-gray-800 rounded-2xl" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />

      <div className="flex-1 min-w-0">
        <AppHeader
          breadcrumb={[{ label: 'My Workspace' }, { label: 'Dashboard' }]}
          onQuickCreate={() => setShowForm(true)}
          quickCreateLabel="New Project"
        />

        <div className="p-6 md:p-8 max-w-7xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-sm text-gray-400 mt-1">Everything your team is working on, in one place.</p>
          </div>

          {/* Summary cards */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"
          >
            <StatCard icon={FolderKanban} label="Projects" value={projects.length} tint="bg-blue-50 text-blue-600" />
            <StatCard icon={ListChecks} label="Test Cases" value={testCases.length} tint="bg-gray-100 text-gray-600" />
            <StatCard icon={PlayCircle} label="Active Test Runs" value={activeRuns} tint="bg-blue-50 text-blue-600" />
            <StatCard icon={TrendingUp} label="Pass Rate" value={formatPercent(caseSummary.passRate)} tint="bg-green-50 text-green-600" />
          </motion.div>

          {/* Row 1 — Execution Trend / Testing Coverage */}
          <div className="grid grid-cols-12 gap-4 mb-4">
            <BentoCard className="col-span-12 md:col-span-4 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold text-white">Execution Trend</p>
                <span className="text-[11px] text-gray-500">14 days · {activeRuns} active</span>
              </div>
              <TrendChart data={executionTrend} color="blue" />
            </BentoCard>

            <BentoCard
              role="link"
              tabIndex={0}
              title="Open the full test coverage report"
              onClick={() => navigate('/coverage')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/coverage') }
              }}
              className="col-span-12 md:col-span-8 p-5 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[14px] font-semibold text-white">Testing Coverage</p>
                <span className="flex items-center gap-1 text-[11px] text-gray-500 group-hover:text-blue-400">
                  {fmt(caseSummary.total)} test cases · View details <ArrowUpRight size={12} />
                </span>
              </div>
              {caseSummary.total === 0 ? (
                <p className="text-[12px] text-gray-500">No test cases yet.</p>
              ) : (
                <div className="flex items-center gap-10">
                  <Donut
                    series={CASE_SERIES}
                    counts={caseSummary.counts}
                    size={188}
                    thickness={20}
                    centerValue={formatPercent(caseSummary.passRate)}
                    centerLabel="pass rate"
                  />
                  <div className="flex-1 min-w-0 max-w-md space-y-2.5">
                    {CASE_SERIES.filter((s) => caseSummary.counts[s.key] > 0).map((s) => (
                      <div key={s.key} className="flex items-center gap-2.5 text-[13px]">
                        <Swatch series={s} round />
                        <span className="text-gray-200 flex-1 truncate">{s.label}</span>
                        <span className="text-white font-semibold tabular-nums">{fmt(caseSummary.counts[s.key])}</span>
                        <span className="text-gray-500 tabular-nums w-12 text-right">{pctLabel(caseSummary.counts[s.key], caseSummary.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[12px] text-gray-400 mt-4 pt-3 border-t border-gray-750">
                Each test case counted once, at its latest result
              </p>
            </BentoCard>
          </div>

          {/* Row 2 — Sprint Status / Starred Projects / Notifications */}
          <div className="grid grid-cols-12 gap-4 mb-4">
            <BentoCard className="col-span-12 md:col-span-4 p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><Rocket size={14} /> Sprint Status</p>
              <div className="space-y-3">
                {sprintStatus.map((s) => (
                  <div key={s.id}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="text-gray-300 truncate">{s.projectName} · {s.name}</span>
                      <span className="text-gray-500">{s.done}/{s.total}</span>
                    </div>
                    <div className="w-full bg-gray-750 rounded-full h-1.5">
                      <motion.div
                        className="bg-blue-500 h-1.5 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${s.pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                ))}
                {sprintStatus.length === 0 && <p className="text-[12px] text-gray-500">No active sprints.</p>}
              </div>
            </BentoCard>

            <BentoCard className="col-span-12 md:col-span-4 p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><Star size={14} /> Starred Projects</p>
              <div className="space-y-2">
                {starredProjects.map((p) => {
                  const projectIssues = issues.filter((i) => i.project_id === p.id)
                  const total = projectIssues.length
                  const done = projectIssues.filter((i) => i.status === 'done').length
                  const percent = total > 0 ? Math.round((done / total) * 100) : 0
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/project/${p.id}`)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-650 text-left"
                    >
                      <ProgressRing percent={percent} size={28} />
                      <span className="text-[12px] text-gray-300 truncate flex-1">{p.name}</span>
                      <span className="text-[11px] text-gray-500 flex-shrink-0">{percent}%</span>
                    </button>
                  )
                })}
                {starredProjects.length === 0 && <p className="text-[12px] text-gray-500">Star a project from the sidebar to pin it here.</p>}
              </div>
            </BentoCard>

            <BentoCard className="col-span-12 md:col-span-4 p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><Bell size={14} /> Notifications</p>
              <div className="space-y-2">
                {recentNotifications.map((n) => {
                  const Icon = NOTIFICATION_ICON[n.type] || Bell
                  return (
                    <div key={n.id} className="flex items-start gap-2 text-[12px]">
                      <Icon size={13} className="text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className={`truncate ${n.read ? 'text-gray-400' : 'text-white font-medium'}`}>{n.message}</p>
                        <p className="text-gray-500 text-[11px]">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
                {recentNotifications.length === 0 && <p className="text-[12px] text-gray-500">No notifications yet.</p>}
              </div>
            </BentoCard>
          </div>

          {/* Row 3 — Assigned to Me / Upcoming Due Dates / Recent Activity */}
          <div className="grid grid-cols-12 gap-4 mb-4">
            <BentoCard className="col-span-12 md:col-span-4 p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><User size={14} /> Assigned to Me</p>
              <div className="space-y-1">
                {assignedToMe.map((i) => (
                  <p key={i.id} className="px-2 py-1.5 text-[12px] truncate">{i.title}</p>
                ))}
                {assignedToMe.length === 0 && <p className="text-[12px] text-gray-500 px-2 py-1">Nothing assigned to you.</p>}
              </div>
            </BentoCard>

            <BentoCard className="col-span-12 md:col-span-4 p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><CalendarClock size={14} /> Upcoming Due Dates</p>
              <div className="space-y-1">
                {upcomingDueDates.map((i) => {
                  const overdue = new Date(i.due_date) < new Date()
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="text-[12px] truncate">{i.title}</span>
                      <span className={`text-[11px] flex-shrink-0 ${overdue ? 'text-red-500' : 'text-gray-500'}`}>
                        {formatDueDate(i.due_date)}
                      </span>
                    </div>
                  )
                })}
                {upcomingDueDates.length === 0 && <p className="text-[12px] text-gray-500 px-2 py-1">Nothing due.</p>}
              </div>
            </BentoCard>

            <BentoCard className="col-span-12 md:col-span-4 p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><ActivityIcon size={14} /> Recent Activity</p>
              <div className="space-y-2">
                {activity.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/project/${a.project_id}/activity`)}
                    className="w-full text-left text-[12px] rounded-md px-1 -mx-1 py-0.5 hover:bg-gray-650"
                  >
                    <p className="text-gray-300 truncate">
                      <span className="font-medium text-white">{a.actor_name}</span>{' '}
                      {(AUDIT_ACTIONS[a.action]?.label || a.action).toLowerCase()}
                      {a.entity_label && <span className="text-gray-400"> · {a.entity_label}</span>}
                    </p>
                    <p className="text-gray-500">{timeAgo(a.occurred_at)}</p>
                  </button>
                ))}
                {activity.length === 0 && <p className="text-[12px] text-gray-500">No recent activity.</p>}
              </div>
            </BentoCard>
          </div>

          {/* Row 4 — AI Insights (honest stub) */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <BentoCard noHover className="col-span-12 p-4">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-blue-500 flex-shrink-0" />
                <p className="text-[13px] font-semibold text-white">AI Insights — not connected yet</p>
              </div>
              <p className="text-[12px] text-gray-500 mt-1">
                Automated insights need a real AI provider configured first — this tile intentionally shows nothing
                fabricated. Set one up from Administration → AI Hub when you're ready.
              </p>
            </BentoCard>
          </div>

          {/* Project grid */}
          <p className="text-[13px] font-semibold text-white mb-3">Projects</p>
          {projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to start tracking work."
              action={
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-md font-semibold text-[13px] text-white"
                >
                  + New Project
                </button>
              }
            />
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
            >
              {projects.map((p) => {
                const projectIssues = issues.filter((i) => i.project_id === p.id)
                const total = projectIssues.length
                const done = projectIssues.filter((i) => i.status === 'done').length
                const percent = total > 0 ? Math.round((done / total) * 100) : 0

                return (
                  <BentoCard
                    key={p.id}
                    as={motion.div}
                    variants={fadeInUp}
                    transition={TRANSITION}
                    whileHover={{ scale: 1.02, y: -2 }}
                    onClick={() => navigate(`/project/${p.id}`)}
                    className="group hover:bg-gray-650 p-4 cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-[11px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md tracking-wide">
                        {p.key}
                      </span>
                      <ArrowUpRight size={15} className="text-gray-500 group-hover:text-blue-500" />
                    </div>
                    <h3 className="text-[14px] font-semibold mb-0.5">{p.name}</h3>
                    <p className="text-[12px] text-gray-500 mb-3 truncate">
                      {p.description || `${total} issue${total === 1 ? '' : 's'} tracked`}
                    </p>
                    <div className="flex items-center gap-3">
                      <ProgressRing percent={percent} label={`${percent}%`} />
                      <div className="flex-1">
                        <p className="text-[11px] text-gray-400">
                          <span className="text-white font-semibold">{done}</span>
                          <span className="text-gray-500"> / {total} done</span>
                        </p>
                        <div className="w-full bg-gray-600 rounded-full h-1.5 mt-1.5">
                          <div className="bg-green-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    </div>
                  </BentoCard>
                )
              })}
            </motion.div>
          )}
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Project">
        <form onSubmit={handleCreate} className="space-y-3.5">
          <FormField label="Project name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Mobile App" className={inputClass} />
          </FormField>
          <FormField label="Key" required hint="Short uppercase code, e.g. APP">
            <input value={key} onChange={(e) => setKey(e.target.value)} required maxLength={5} className={`${inputClass} w-28 uppercase`} />
          </FormField>
          <PrimaryButton type="submit">Create Project</PrimaryButton>
        </form>
      </Modal>
    </div>
  )
}
