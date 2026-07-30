import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FolderKanban, ListChecks, PlayCircle, TrendingUp, Gauge, Bug, AlertTriangle,
  Clock, ArrowUpRight, User, Activity as ActivityIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import { useToast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import FormField, { inputClass } from '../components/ui/FormField'
import TrendChart from '../components/ui/TrendChart'
import EmptyState from '../components/ui/EmptyState'

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

function ProgressRing({ percent, size = 40 }) {
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90 flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-gray-600" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (percent / 100) * c}
        className="stroke-green-500 transition-all duration-500"
      />
    </svg>
  )
}

export default function Dashboard() {
  const toast = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [projects, setProjects] = useState([])
  const [issues, setIssues] = useState([])
  const [testCases, setTestCases] = useState([])
  const [testRuns, setTestRuns] = useState([])
  const [statusRows, setStatusRows] = useState([])
  const [testResults, setTestResults] = useState([])
  const [activity, setActivity] = useState([])
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
    ] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('issues').select('id, project_id, title, type, status, priority, assignee_id, due_date, created_at'),
      supabase.from('test_cases').select('id, project_id, automation_status'),
      supabase.from('test_runs').select('id, project_id, status'),
      supabase.from('test_run_case_current_status').select('current_status'),
      supabase.from('test_results').select('id, executed_at'),
      supabase.from('activity_log').select('*, profiles(name)').order('created_at', { ascending: false }).limit(8),
    ])
    setProjects(projectRows || [])
    setIssues(issueRows || [])
    setTestCases(caseRows || [])
    setTestRuns(runRows || [])
    setStatusRows(statusData || [])
    setTestResults(resultRows || [])
    setActivity(activityRows || [])
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

  const bugs = issues.filter((i) => i.type === 'bug')
  const openBugs = bugs.filter((i) => i.status !== 'done').length
  const urgentBugs = bugs.filter((i) => i.status !== 'done' && i.priority === 'urgent').length
  const overdueTasks = issues.filter((i) => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'done').length
  const executed = statusRows.filter((r) => r.current_status !== 'untested').length
  const passed = statusRows.filter((r) => r.current_status === 'passed').length
  const passRate = executed > 0 ? Math.round((passed / executed) * 100) : 0
  const automationCoverage = testCases.length > 0
    ? Math.round((testCases.filter((c) => c.automation_status === 'automated').length / testCases.length) * 100)
    : 0
  const activeRuns = testRuns.filter((r) => r.status === 'active').length

  const executionTrend = useMemo(() => {
    const days = last14Days()
    return days.map((d) => ({
      label: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      value: testResults.filter((r) => { const rd = toDate(r.executed_at); return rd && dayKey(rd) === dayKey(d) }).length,
    }))
  }, [testResults])

  const bugTrend = useMemo(() => {
    const days = last14Days()
    return days.map((d) => ({
      label: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      value: bugs.filter((b) => { const bd = toDate(b.created_at); return bd && dayKey(bd) === dayKey(d) }).length,
    }))
  }, [issues])

  const assignedToMe = issues
    .filter((i) => i.assignee_id === user?.id && i.status !== 'done')
    .sort((a, b) => (a.due_date ? new Date(a.due_date) : Infinity) - (b.due_date ? new Date(b.due_date) : Infinity))
    .slice(0, 5)

  const recentBugs = [...bugs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <ProjectSidebar />
        <div className="flex-1 min-w-0 p-6 md:p-8 animate-pulse">
          <div className="h-8 w-64 bg-gray-800 rounded-lg mb-6" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 bg-gray-800 rounded-lg" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-40 bg-gray-800 rounded-lg" />
            <div className="h-40 bg-gray-800 rounded-lg" />
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon={FolderKanban} label="Projects" value={projects.length} tint="bg-blue-50 text-blue-600" />
            <StatCard icon={ListChecks} label="Test Cases" value={testCases.length} tint="bg-gray-100 text-gray-600" />
            <StatCard icon={PlayCircle} label="Active Test Runs" value={activeRuns} tint="bg-blue-50 text-blue-600" />
            <StatCard icon={TrendingUp} label="Pass Rate" value={`${passRate}%`} tint="bg-green-50 text-green-600" />
            <StatCard icon={Gauge} label="Automation Coverage" value={`${automationCoverage}%`} tint="bg-purple-50 text-purple-600" />
            <StatCard icon={Bug} label="Open Bugs" value={openBugs} tint="bg-orange-50 text-orange-600" />
            <StatCard icon={AlertTriangle} label="Urgent Bugs" value={urgentBugs} tint="bg-red-50 text-red-600" />
            <StatCard icon={Clock} label="Overdue Tasks" value={overdueTasks} tint="bg-red-50 text-red-600" />
          </div>

          {/* Trend charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <p className="text-[13px] font-semibold text-white mb-1">Execution Trend</p>
              <p className="text-[11px] text-gray-500 mb-3">Test executions per day, last 14 days</p>
              <TrendChart data={executionTrend} color="blue" />
            </div>
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <p className="text-[13px] font-semibold text-white mb-1">Bug Trend</p>
              <p className="text-[11px] text-gray-500 mb-3">Bugs reported per day, last 14 days</p>
              <TrendChart data={bugTrend} color="red" />
            </div>
          </div>

          {/* Widgets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><User size={14} /> Assigned to Me</p>
              <div className="space-y-1">
                {assignedToMe.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => navigate(`/project/${i.project_id}/issue/${i.id}`)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-650 text-[12px] truncate"
                  >
                    {i.title}
                  </button>
                ))}
                {assignedToMe.length === 0 && <p className="text-[12px] text-gray-500 px-2 py-1">Nothing assigned to you.</p>}
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><ActivityIcon size={14} /> Recent Activity</p>
              <div className="space-y-2">
                {activity.map((a) => (
                  <div key={a.id} className="text-[12px]">
                    <p className="text-gray-300 truncate">
                      <span className="font-medium text-white">{a.profiles?.name || 'Someone'}</span>{' '}
                      {a.action_type?.replace(/_/g, ' ')}
                    </p>
                    <p className="text-gray-500">{timeAgo(a.created_at)}</p>
                  </div>
                ))}
                {activity.length === 0 && <p className="text-[12px] text-gray-500">No recent activity.</p>}
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5"><Bug size={14} /> Recent Bugs</p>
              <div className="space-y-1">
                {recentBugs.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => navigate(`/project/${b.project_id}/issue/${b.id}`)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-650 text-[12px] truncate"
                  >
                    {b.title}
                  </button>
                ))}
                {recentBugs.length === 0 && <p className="text-[12px] text-gray-500 px-2 py-1">No bugs reported.</p>}
              </div>
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {projects.map((p) => {
                const projectIssues = issues.filter((i) => i.project_id === p.id)
                const total = projectIssues.length
                const done = projectIssues.filter((i) => i.status === 'done').length
                const percent = total > 0 ? Math.round((done / total) * 100) : 0

                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/project/${p.id}`)}
                    className="group bg-gray-800 border border-gray-600 hover:bg-gray-650 rounded-lg p-4 cursor-pointer"
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
                      <div className="relative">
                        <ProgressRing percent={percent} />
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">{percent}%</span>
                      </div>
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
                  </div>
                )
              })}
            </div>
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
          <button type="submit" className="w-full bg-blue-500 hover:bg-blue-400 py-2 rounded-md text-[13px] font-semibold text-white">
            Create Project
          </button>
        </form>
      </Modal>
    </div>
  )
}
