import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckSquare, ListChecks } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import EnterpriseTable from '../components/ui/EnterpriseTable'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import { TEST_RUN_RESULT, ISSUE_STATUS, ISSUE_PRIORITY } from '../lib/statusConfig'

function isOverdue(dueDate) {
  return dueDate && new Date(dueDate) < new Date()
}

export default function TodoPage() {
  const { id: projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return
      setLoading(true)
      const [{ data: proj }, { data: myIssues }, { data: activeRuns }, { data: cases }, { data: statusRows }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase
          .from('issues')
          .select('id, title, type, status, priority, due_date, sprint_id')
          .eq('project_id', projectId)
          .eq('assignee_id', user.id)
          .neq('status', 'done'),
        supabase.from('test_runs').select('id, name').eq('project_id', projectId).eq('status', 'active'),
        supabase.from('test_cases').select('id, human_id, title').eq('project_id', projectId),
        supabase
          .from('test_run_case_current_status')
          .select('*')
          .eq('project_id', projectId)
          .eq('assigned_to', user.id),
      ])
      setProject(proj)

      const sortedTasks = [...(myIssues || [])].sort((a, b) => {
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date) - new Date(b.due_date)
      })
      setTasks(sortedTasks)

      const activeRunById = Object.fromEntries((activeRuns || []).map((r) => [r.id, r]))
      const caseById = Object.fromEntries((cases || []).map((c) => [c.id, c]))

      const myTodo = (statusRows || [])
        .filter((r) => activeRunById[r.run_id])
        .map((r) => ({ ...r, run: activeRunById[r.run_id], testCase: caseById[r.test_case_id] }))

      setRows(myTodo)
      setLoading(false)
    }
    fetchData()
  }, [projectId, user])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <ProjectSidebar />
        <div className="flex-1 min-w-0 p-6 animate-pulse">
          <div className="h-8 w-64 bg-gray-800 rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: project?.name, to: `/project/${projectId}/overview` }, { label: 'To-Do' }]} />
        <PageHeader title="To-Do" subtitle="Everything assigned to you across this project" />

        <div className="p-6 space-y-8">
          <div>
            <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5">
              <ListChecks size={15} /> My Tasks
              {tasks.length > 0 && <span className="text-gray-500 font-normal">({tasks.length})</span>}
            </p>
            <EnterpriseTable
              rows={tasks}
              rowKey={(t) => t.id}
              onRowClick={(t) => navigate(`/project/${projectId}/issue/${t.id}`)}
              emptyState={
                <EmptyState
                  icon={ListChecks}
                  title="No open tasks assigned to you"
                  description="Issues assigned to you in this project's Classic board will show up here."
                />
              }
              columns={[
                {
                  key: 'title',
                  label: 'Task',
                  render: (t) => <span className="text-white">{t.title}</span>,
                },
                { key: 'priority', label: 'Priority', render: (t) => <StatusBadge domain={ISSUE_PRIORITY} value={t.priority} size="sm" /> },
                { key: 'status', label: 'Status', render: (t) => <StatusBadge domain={ISSUE_STATUS} value={t.status} size="sm" /> },
                {
                  key: 'due_date',
                  label: 'Due',
                  render: (t) => t.due_date
                    ? <span className={isOverdue(t.due_date) ? 'text-red-600 font-medium' : 'text-gray-400'}>{new Date(t.due_date).toLocaleDateString()}</span>
                    : <span className="text-gray-400">—</span>,
                },
              ]}
            />
          </div>

          <div>
            <p className="text-[13px] font-semibold text-white mb-3 flex items-center gap-1.5">
              <CheckSquare size={15} /> My Test Executions
              {rows.length > 0 && <span className="text-gray-500 font-normal">({rows.length})</span>}
            </p>
            <EnterpriseTable
              rows={rows}
              rowKey={(r) => r.run_case_id}
              onRowClick={(r) => navigate(`/project/${projectId}/runs/${r.run_id}`)}
              emptyState={
                <EmptyState
                  icon={CheckSquare}
                  title="Nothing assigned to you right now"
                  description="Test cases assigned to you in active test runs will show up here."
                />
              }
              columns={[
                { key: 'run', label: 'Run', render: (r) => r.run?.name || '—' },
                {
                  key: 'case',
                  label: 'Case',
                  render: (r) => (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-blue-500">{r.testCase?.human_id}</span>
                      <span className="text-white">{r.testCase?.title || 'Unknown case'}</span>
                    </div>
                  ),
                },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge domain={TEST_RUN_RESULT} value={r.current_status} dot /> },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
