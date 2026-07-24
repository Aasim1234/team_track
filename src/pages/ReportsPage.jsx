import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import EnterpriseTable from '../components/ui/EnterpriseTable'
import StatusBadge from '../components/ui/StatusBadge'
import StatusProgressBar from '../components/ui/StatusProgressBar'
import EmptyState from '../components/ui/EmptyState'
import FormField, { inputClass } from '../components/ui/FormField'
import { TEST_RUN_RESULT, TEST_CASE_PRIORITY, TEST_CASE_TYPE } from '../lib/statusConfig'

function groupCounts(items, field, domain) {
  const counts = {}
  Object.keys(domain).forEach((k) => { counts[k] = 0 })
  items.forEach((i) => { counts[i[field]] = (counts[i[field]] || 0) + 1 })
  return counts
}

export default function ReportsPage() {
  const { id: projectId } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [runs, setRuns] = useState([])
  const [cases, setCases] = useState([])
  const [executedCaseIds, setExecutedCaseIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('summary')
  const [selectedRunId, setSelectedRunId] = useState('')
  const [runRows, setRunRows] = useState([])
  const [loadingRun, setLoadingRun] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: proj }, { data: runRowsData }, { data: caseRows }, { data: runCaseRows }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('test_runs').select('id, name, status').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('test_cases').select('id, human_id, title, priority, test_type, automation_status').eq('project_id', projectId),
        supabase.from('test_run_cases').select('test_case_id').eq('project_id', projectId),
      ])
      setProject(proj)
      setRuns(runRowsData || [])
      setCases(caseRows || [])
      setExecutedCaseIds(new Set((runCaseRows || []).map((r) => r.test_case_id)))
      if (runRowsData?.length) setSelectedRunId(runRowsData[0].id)
      setLoading(false)
    }
    fetchData()
  }, [projectId])

  useEffect(() => {
    if (!selectedRunId) {
      setRunRows([])
      return
    }
    setLoadingRun(true)
    supabase
      .from('test_run_case_current_status')
      .select('*')
      .eq('run_id', selectedRunId)
      .then(({ data }) => {
        setRunRows(data || [])
        setLoadingRun(false)
      })
  }, [selectedRunId])

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

  const caseById = Object.fromEntries(cases.map((c) => [c.id, c]))
  const counts = { untested: 0, passed: 0, failed: 0, blocked: 0, retest: 0, skipped: 0 }
  runRows.forEach((r) => { counts[r.current_status] = (counts[r.current_status] || 0) + 1 })
  const total = runRows.length
  const executed = total - (counts.untested || 0)
  const passRate = executed > 0 ? Math.round(((counts.passed || 0) / executed) * 100) : 0
  const failedOrBlocked = runRows.filter((r) => ['failed', 'blocked'].includes(r.current_status))

  const automatedCount = cases.filter((c) => c.automation_status === 'automated').length
  const automationCoverage = cases.length > 0 ? Math.round((automatedCount / cases.length) * 100) : 0
  const neverExecutedCount = cases.filter((c) => !executedCaseIds.has(c.id)).length
  const priorityCounts = groupCounts(cases, 'priority', TEST_CASE_PRIORITY)
  const typeCounts = groupCounts(cases, 'test_type', TEST_CASE_TYPE)

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: project?.name, to: `/project/${projectId}/overview` }, { label: 'Reports' }]} />
        <PageHeader title="Reports" subtitle="Coverage and results, computed from real execution data" />

        <div className="p-6">
          <div className="flex gap-1 mb-5 border-b border-gray-600">
            {[{ id: 'summary', label: 'Run Summary' }, { id: 'coverage', label: 'Test Coverage' }].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px ${
                  tab === t.id ? 'text-blue-600 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'summary' && (
            runs.length === 0 ? (
              <EmptyState icon={BarChart3} title="No test runs yet" description="Create a test run to see results reports here." />
            ) : (
              <div className="space-y-5">
                <FormField label="Test run">
                  <select value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)} className={`${inputClass} max-w-sm`}>
                    {runs.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.status})</option>)}
                  </select>
                </FormField>

                {loadingRun ? (
                  <p className="text-[13px] text-gray-500">Loading…</p>
                ) : (
                  <>
                    <div className="border border-gray-600 rounded-lg p-4 max-w-xl">
                      <div className="flex justify-between text-[13px] mb-2">
                        <span className="font-semibold text-white">Progress</span>
                        <span className="text-gray-500">{executed}/{total} executed · {passRate}% pass rate</span>
                      </div>
                      <StatusProgressBar domain={TEST_RUN_RESULT} counts={counts} showLegend />
                    </div>

                    <div>
                      <p className="text-[13px] font-semibold text-white mb-2">Failed &amp; Blocked Cases</p>
                      <EnterpriseTable
                        rows={failedOrBlocked}
                        rowKey={(r) => r.run_case_id}
                        onRowClick={() => navigate(`/project/${projectId}/runs/${selectedRunId}`)}
                        emptyState={<EmptyState title="No failed or blocked cases" description="Everything executed so far in this run passed." />}
                        columns={[
                          {
                            key: 'case',
                            label: 'Case',
                            render: (r) => (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-blue-500">{caseById[r.test_case_id]?.human_id}</span>
                                <span className="text-white">{caseById[r.test_case_id]?.title || 'Unknown case'}</span>
                              </div>
                            ),
                          },
                          { key: 'status', label: 'Status', render: (r) => <StatusBadge domain={TEST_RUN_RESULT} value={r.current_status} /> },
                        ]}
                      />
                    </div>
                  </>
                )}
              </div>
            )
          )}

          {tab === 'coverage' && (
            cases.length === 0 ? (
              <EmptyState icon={BarChart3} title="No test cases yet" description="Add test cases to your repository to see coverage reports." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-gray-600 rounded-lg p-4">
                  <p className="text-2xl font-bold text-white">{automationCoverage}%</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">Automation coverage ({automatedCount}/{cases.length} cases)</p>
                </div>
                <div className="border border-gray-600 rounded-lg p-4">
                  <p className="text-2xl font-bold text-white">{cases.length}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">Total test cases</p>
                </div>
                <div className="border border-gray-600 rounded-lg p-4">
                  <p className="text-2xl font-bold text-white">{neverExecutedCount}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">Never included in a test run</p>
                </div>

                <div className="border border-gray-600 rounded-lg p-4 md:col-span-3">
                  <p className="text-[13px] font-semibold text-white mb-3">By Priority</p>
                  <StatusProgressBar domain={TEST_CASE_PRIORITY} counts={priorityCounts} showLegend />
                </div>
                <div className="border border-gray-600 rounded-lg p-4 md:col-span-3">
                  <p className="text-[13px] font-semibold text-white mb-3">By Type</p>
                  <StatusProgressBar domain={TEST_CASE_TYPE} counts={typeCounts} showLegend />
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
