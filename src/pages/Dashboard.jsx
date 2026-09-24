import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FolderKanban, ListChecks, ClipboardList, TrendingUp,
  ArrowUpRight, User, Activity as ActivityIcon, Star, Sparkles,
  CalendarClock, UserPlus, RefreshCw, MessageSquare, Bell,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
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
import StatusBadge from '../components/ui/StatusBadge'
import { formatPercent } from '../lib/testMetrics'
import { AUDIT_ACTIONS } from '../lib/auditLog'
import { usePermissions } from '../hooks/usePermissions'
import { browserTimeZone } from '../lib/performanceScore'
import { TEST_PLAN_STATUS, VMS_RESULT } from '../lib/statusConfig'
import { formatCaseId } from '../lib/testCaseId'
import { Donut, Swatch, VMS_SERIES, fmt, pctLabel } from '../components/charts/CoverageCharts'
import { fadeInUp, staggerContainer, TRANSITION } from '../lib/motion'

const NOTIFICATION_ICON = {
  assigned: UserPlus,
  status_changed: RefreshCw,
  comment: MessageSquare,
}

// Everything on this page comes from dashboard_summary(), which reads the test
// plans, test cases, To-Do tasks and activity log the team actually works in.
const EMPTY_SUMMARY = {
  totals: {
    projects: 0, testCases: 0, testPlans: 0, plansUnderTesting: 0,
    executed: 0, passRate: 0, progress: 0, assignedToMe: 0, resultsToday: 0,
  },
  coverage: { pass: 0, fail: 0, blocked: 0, retest: 0, na: 0, not_tested: 0 },
  trend: [],
  plans: [],
  projects: [],
  myTasks: [],
  due: [],
}

function toDate(dateStr) {
  if (!dateStr) return null
  const hasOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(dateStr)
  const d = new Date(hasOffset ? dateStr : `${dateStr}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

// A target date is a calendar day, not an instant — read it in local time so it
// never slips a day either side of midnight.
function toDay(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
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
  const d = toDay(dateStr)
  if (!d) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isOverdue(dateStr) {
  const d = toDay(dateStr)
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

export default function Dashboard() {
  const toast = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { notifications } = useNotifications()

  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [activity, setActivity] = useState([])
  const [starredIds, setStarredIds] = useState(new Set())
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const { can } = usePermissions()
  const canCreateProject = can('projects.create')
  const [name, setName] = useState('')
  const [key, setKey] = useState('')

  useEffect(() => {
    if (searchParams.get('new') === '1' && canCreateProject) {
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, canCreateProject])

  const fetchAll = async () => {
    setLoading(true)
    const [
      { data: summaryData, error: summaryError },
      { data: activityRows },
    ] = await Promise.all([
      supabase.rpc('dashboard_summary', { p_timezone: browserTimeZone() }),
      supabase.from('audit_log').select('id, project_id, actor_name, action, entity_label, occurred_at').order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(8),
    ])
    if (summaryError) toast.error(summaryError.message)
    setSummary(summaryData ? { ...EMPTY_SUMMARY, ...summaryData } : EMPTY_SUMMARY)
    setActivity(activityRows || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  // Stars are per user, so this waits for the session rather than riding along
  // with the first load, which happens before useAuth has resolved it.
  useEffect(() => {
    if (!user) { setStarredIds(new Set()); return }
    let cancelled = false
    supabase.from('starred_projects').select('project_id').eq('user_id', user.id).then(({ data }) => {
      if (!cancelled) setStarredIds(new Set((data || []).map((r) => r.project_id)))
    })
    return () => { cancelled = true }
  }, [user?.id])

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

  const { totals, coverage, plans, projects, myTasks, due } = summary

  const executionTrend = useMemo(
    () => (summary.trend || []).map((d) => ({
      label: toDay(d.date)?.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) || '',
      value: d.value || 0,
    })),
    [summary.trend],
  )

  const starredProjects = projects.filter((p) => starredIds.has(p.id))
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
          onQuickCreate={canCreateProject ? () => setShowForm(true) : undefined}
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
            <StatCard icon={FolderKanban} label="Projects" value={totals.projects} tint="bg-blue-50 text-blue-600" />
            <StatCard icon={ListChecks} label="Test Cases" value={totals.testCases} tint="bg-gray-100 text-gray-600" />
            <StatCard icon={ClipboardList} label="Test Plans" value={totals.testPlans} tint="bg-blue-50 text-blue-600" />
            <StatCard icon={TrendingUp} label="Pass Rate" value={formatPercent(totals.passRate)} tint="bg-green-50 text-green-600" />
          </motion.div>

          {/* Row 1 — Execution Trend / Testing Coverage */}
          <div className="grid grid-cols-12 gap-4 mb-4">
            <BentoCard noHover className="col-span-12 md:col-span-4 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold text-white">Execution Trend</p>
                <span className="text-[11px] text-gray-500">14 days · {totals.resultsToday} today</span>
              </div>
              <TrendChart data={executionTrend} color="blue" />
              <p className="text-[11px] text-gray-500 mt-2">Test case results recorded per day</p>
            </BentoCard>

            <BentoCard noHover className="col-span-12 md:col-span-8 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[14px] font-semibold text-white">Testing Coverage</p>
                <span className="text-[11px] text-gray-500">
                  {fmt(totals.executed)} of {fmt(totals.testCases)} executed
                </span>
              </div>
              {totals.testCases === 0 ? (
                <p className="text-[12px] text-gray-500">No test cases yet.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-10">
                  <Donut
                    series={VMS_SERIES}
                    counts={coverage}
                    size={188}
                    thickness={20}
                    centerValue={formatPercent(totals.passRate)}
                    centerLabel="pass rate"
                  />
                  <div className="flex-1 min-w-0 max-w-md space-y-2.5">
                    {VMS_SERIES.filter((s) => coverage[s.key] > 0).map((s) => (
                      <div key={s.key} className="flex items-center gap-2.5 text-[13px]">
                        <Swatch series={s} round />
                        <span className="text-gray-300 flex-1 truncate">{s.label}</span>
                        <span className="text-white font-semibold tabular-nums">{fmt(coverage[s.key])}</span>
                        <span className="text-gray-500 tabular-nums w-12 text-right">{pctLabel(coverage[s.key], totals.testCases)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[12px] text-gray-400 mt-4 pt-3 border-t border-gray-750">
                Every test case in your test plans, at its current result · pass rate is passed ÷ executed
              </p>
            </BentoCard>
          </div>

          {/* Row 2 — Test Plans / Starred Projects / Notifications */}
          <div className="grid grid-cols-12 gap-4 mb-4">
            <BentoCard noHover className="col-span-12 md:col-span-4 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold text-white flex items-center gap-1.5"><ClipboardList size={14} /> Test Plans</p>
                {totals.plansUnderTesting > 0 && (
                  <span className="text-[11px] text-gray-500">{totals.plansUnderTesting} under testing</span>
                )}
              </div>
              <div className="space-y-3">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/project/${p.projectId}/plans/${p.id}`)}
                    className="w-full text-left rounded-md px-1 -mx-1 py-1 hover:bg-gray-650"
                  >
                    <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                      <span className="text-gray-300 truncate">{p.name}</span>
                      <span className="text-gray-500 flex-shrink-0 tabular-nums">{fmt(p.executed)}/{fmt(p.total)}</span>
                    </div>
                    <div className="w-full bg-gray-750 rounded-full h-1.5">
                      <motion.div
                        className="bg-blue-500 h-1.5 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${p.progress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <StatusBadge domain={TEST_PLAN_STATUS} value={p.status} size="sm" />
                      {p.release && <span className="text-[11px] text-gray-500 truncate">Release {p.release}</span>}
                    </div>
                  </button>
                ))}
                {plans.length === 0 && <p className="text-[12px] text-gray-500">No test plans yet.</p>}
              </div>
            </BentoCard>

            <BentoCard noHover className="col-span-12 md:col-span-4 p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><Star size={14} /> Starred Projects</p>
              <div className="space-y-2">
                {starredProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/project/${p.id}`)}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-650 text-left"
                  >
                    <ProgressRing percent={p.progress} size={28} />
                    <span className="text-[12px] text-gray-300 truncate flex-1">{p.name}</span>
                    <span className="text-[11px] text-gray-500 flex-shrink-0">{p.progress}%</span>
                  </button>
                ))}
                {starredProjects.length === 0 && <p className="text-[12px] text-gray-500">Star a project from the sidebar to pin it here.</p>}
              </div>
            </BentoCard>

            <BentoCard noHover className="col-span-12 md:col-span-4 p-4">
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
            <BentoCard noHover className="col-span-12 md:col-span-4 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold text-white flex items-center gap-1.5"><User size={14} /> Assigned to Me</p>
                {totals.assignedToMe > 0 && (
                  <span className="text-[11px] text-gray-500">{totals.assignedToMe} open</span>
                )}
              </div>
              <div className="space-y-1">
                {myTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/project/${t.projectId}/plans/${t.planId}?case=${t.id}`)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-650"
                  >
                    <p className="text-[12px] truncate">
                      <span className="text-gray-500 tabular-nums">{formatCaseId(t.caseNumber)}</span>{' '}
                      {t.scenario || t.topic}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {t.planName}
                      {t.result && t.result !== 'not_tested' && ` · ${VMS_RESULT[t.result]?.label || t.result}`}
                    </p>
                  </button>
                ))}
                {myTasks.length === 0 && <p className="text-[12px] text-gray-500 px-2 py-1">Nothing assigned to you.</p>}
                {totals.assignedToMe > myTasks.length && (
                  <button
                    onClick={() => navigate(`/project/${myTasks[0].projectId}/todo`)}
                    className="text-[11px] text-gray-500 hover:text-blue-400 px-2 pt-1"
                  >
                    +{totals.assignedToMe - myTasks.length} more in To-Do
                  </button>
                )}
              </div>
            </BentoCard>

            <BentoCard noHover className="col-span-12 md:col-span-4 p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><CalendarClock size={14} /> Upcoming Due Dates</p>
              <div className="space-y-1">
                {due.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/project/${p.projectId}/plans/${p.id}`)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gray-650 text-left"
                  >
                    <span className="text-[12px] truncate">
                      {p.name}
                      {p.release && <span className="text-gray-500"> · {p.release}</span>}
                    </span>
                    <span className={`text-[11px] flex-shrink-0 ${isOverdue(p.targetDate) ? 'text-red-500' : 'text-gray-500'}`}>
                      {formatDueDate(p.targetDate)}
                    </span>
                  </button>
                ))}
                {due.length === 0 && <p className="text-[12px] text-gray-500 px-2 py-1">No test plan has a target date.</p>}
              </div>
            </BentoCard>

            <BentoCard noHover className="col-span-12 md:col-span-4 p-4">
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
                fabricated.
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
              action={canCreateProject && (
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-md font-semibold text-[13px] text-white"
                >
                  + New Project
                </button>
              )}
            />
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
            >
              {projects.map((p) => (
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
                    {p.description || `${p.plans} test plan${p.plans === 1 ? '' : 's'} · ${fmt(p.testCases)} test case${p.testCases === 1 ? '' : 's'}`}
                  </p>
                  <div className="flex items-center gap-3">
                    <ProgressRing percent={p.progress} label={`${p.progress}%`} />
                    <div className="flex-1">
                      <p className="text-[11px] text-gray-400">
                        <span className="text-white font-semibold">{fmt(p.executed)}</span>
                        <span className="text-gray-500"> / {fmt(p.testCases)} executed</span>
                      </p>
                      <div className="w-full bg-gray-600 rounded-full h-1.5 mt-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${p.progress}%` }} />
                      </div>
                    </div>
                  </div>
                </BentoCard>
              ))}
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
