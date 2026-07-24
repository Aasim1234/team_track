import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckSquare } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import EnterpriseTable from '../components/ui/EnterpriseTable'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import { TEST_RUN_RESULT } from '../lib/statusConfig'

export default function TodoPage() {
  const { id: projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [project, setProject] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return
      setLoading(true)
      const [{ data: proj }, { data: activeRuns }, { data: cases }, { data: statusRows }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('test_runs').select('id, name').eq('project_id', projectId).eq('status', 'active'),
        supabase.from('test_cases').select('id, human_id, title').eq('project_id', projectId),
        supabase
          .from('test_run_case_current_status')
          .select('*')
          .eq('project_id', projectId)
          .eq('assigned_to', user.id),
      ])
      setProject(proj)

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
        <PageHeader title="To-Do" subtitle="Tests assigned to you across this project" />

        <div className="p-6">
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
  )
}
