import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, Lock, Unlock, PlayCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import NewTestRunModal from '../components/NewTestRunModal'
import RunCaseRail from '../components/RunCaseRail'
import RunCaseExecutionPanel from '../components/RunCaseExecutionPanel'
import useRunCaseShortcuts from '../hooks/useRunCaseShortcuts'
import EnterpriseTable from '../components/ui/EnterpriseTable'
import StatusBadge from '../components/ui/StatusBadge'
import StatusProgressBar from '../components/ui/StatusProgressBar'
import EmptyState from '../components/ui/EmptyState'
import { RUN_STATUS, TEST_RUN_RESULT } from '../lib/statusConfig'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const iso = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
  const seconds = Math.floor((new Date() - new Date(iso)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function countsFor(rows) {
  const counts = { untested: 0, passed: 0, failed: 0, blocked: 0, retest: 0, skipped: 0 }
  rows.forEach((r) => { counts[r.current_status] = (counts[r.current_status] || 0) + 1 })
  return counts
}

export default function TestRunsPage() {
  const { id: projectId, runId, runCaseId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [project, setProject] = useState(null)
  const [runs, setRuns] = useState([])
  const [statusRows, setStatusRows] = useState([])
  const [cases, setCases] = useState([])
  const [members, setMembers] = useState([])
  const [myRole, setMyRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')
  const [showNewRun, setShowNewRun] = useState(false)

  const canAuthor = ['admin', 'lead', 'tester'].includes(myRole)

  const fetchAll = async () => {
    const [{ data: proj }, { data: runRows }, { data: statusData }, { data: caseRows }, { data: memberRows }, { data: roleRow }] =
      await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase
          .from('test_runs')
          .select('*, creator:profiles!created_by(name)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase.from('test_run_case_current_status').select('*').eq('project_id', projectId),
        supabase.from('test_cases').select('id, human_id, title, preconditions, objective').eq('project_id', projectId).order('human_id'),
        supabase.from('project_members').select('user_id, profiles(id, name)').eq('project_id', projectId),
        user
          ? supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
    setProject(proj)
    setRuns(runRows || [])
    setStatusRows(statusData || [])
    setCases(caseRows || [])
    setMembers((memberRows || []).map((m) => m.profiles).filter(Boolean))
    setMyRole(roleRow?.role || null)
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
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

  if (runId) {
    return (
      <TestRunDetail
        projectId={projectId}
        runId={runId}
        runCaseId={runCaseId}
        project={project}
        cases={cases}
        members={members}
        canAuthor={canAuthor}
        userId={user?.id}
        onRefreshList={fetchAll}
      />
    )
  }

  const activeRuns = runs.filter((r) => r.status === 'active')
  const closedRuns = runs.filter((r) => r.status === 'closed')
  const visibleRuns = tab === 'active' ? activeRuns : closedRuns

  const perRunCounts = {}
  statusRows.forEach((row) => {
    perRunCounts[row.run_id] = perRunCounts[row.run_id] || { untested: 0, passed: 0, failed: 0, blocked: 0, retest: 0, skipped: 0 }
    perRunCounts[row.run_id][row.current_status] = (perRunCounts[row.run_id][row.current_status] || 0) + 1
  })

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: project?.name, to: `/project/${projectId}/overview` }, { label: 'Test Runs & Results' }]} />
        <PageHeader
          title="Test Runs & Results"
          subtitle="Execute test cases and track pass/fail history"
          actions={
            canAuthor && (
              <button
                onClick={() => setShowNewRun(true)}
                className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
              >
                <Plus size={14} /> New Test Run
              </button>
            )
          }
        />

        <div className="p-6">
          <div className="flex gap-1 mb-4 border-b border-gray-600">
            {['active', 'closed'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-[13px] font-medium capitalize border-b-2 -mb-px ${
                  tab === t ? 'text-blue-600 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                {t} ({t === 'active' ? activeRuns.length : closedRuns.length})
              </button>
            ))}
          </div>

          <EnterpriseTable
            rows={visibleRuns}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/project/${projectId}/runs/${r.id}`)}
            emptyState={
              <EmptyState
                icon={PlayCircle}
                title={tab === 'active' ? 'No active test runs' : 'No closed test runs'}
                description={tab === 'active' ? 'Create a test run to start executing test cases and recording results.' : 'Runs appear here once they’re closed.'}
                action={
                  tab === 'active' && canAuthor && (
                    <button
                      onClick={() => setShowNewRun(true)}
                      className="bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-md text-[13px] font-semibold"
                    >
                      New Test Run
                    </button>
                  )
                }
              />
            }
            columns={[
              {
                key: 'name',
                label: 'Run',
                render: (r) => (
                  <div>
                    <span className="text-white font-medium">{r.name}</span>
                    {r.description && <p className="text-[11px] text-gray-500 truncate max-w-xs">{r.description}</p>}
                  </div>
                ),
              },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge domain={RUN_STATUS} value={r.status} /> },
              {
                key: 'cases',
                label: 'Cases',
                render: (r) => Object.values(perRunCounts[r.id] || {}).reduce((a, b) => a + b, 0),
              },
              {
                key: 'progress',
                label: 'Progress',
                width: '220px',
                render: (r) => <StatusProgressBar domain={TEST_RUN_RESULT} counts={perRunCounts[r.id] || {}} />,
              },
              { key: 'creator', label: 'Created By', render: (r) => r.creator?.name || '—' },
              { key: 'created_at', label: 'Created', render: (r) => new Date(r.created_at).toLocaleDateString() },
            ]}
          />
        </div>
      </div>

      <NewTestRunModal
        open={showNewRun}
        onClose={() => setShowNewRun(false)}
        projectId={projectId}
        cases={cases}
        members={members}
        onCreated={(newRunId) => {
          fetchAll()
          navigate(`/project/${projectId}/runs/${newRunId}`)
        }}
      />
    </div>
  )
}

function TestRunDetail({ projectId, runId, runCaseId, project, cases, members, canAuthor, userId, onRefreshList }) {
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState([])

  const caseById = Object.fromEntries(cases.map((c) => [c.id, c]))
  const caseOrderIndex = Object.fromEntries(cases.map((c, i) => [c.id, i]))

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (caseOrderIndex[a.test_case_id] ?? 0) - (caseOrderIndex[b.test_case_id] ?? 0)),
    [rows, cases]
  )

  const fetchRun = async () => {
    const [{ data: runRow }, { data: statusData }] = await Promise.all([
      supabase.from('test_runs').select('*, creator:profiles!created_by(name)').eq('id', runId).single(),
      supabase.from('test_run_case_current_status').select('*').eq('run_id', runId),
    ])
    setRun(runRow)
    setRows(statusData || [])
    setLoading(false)
    return statusData || []
  }

  useEffect(() => {
    fetchRun()
    setSelectMode(false)
    setSelected([])
  }, [runId])

  const goToCase = (id) => {
    navigate(`/project/${projectId}/runs/${runId}/case/${id}`, { replace: true })
  }

  const toggleStatus = async () => {
    const newStatus = run.status === 'active' ? 'closed' : 'active'
    const patch = newStatus === 'closed' ? { status: newStatus, closed_by: userId, closed_at: new Date().toISOString() } : { status: newStatus }
    await supabase.from('test_runs').update(patch).eq('id', runId)
    fetchRun()
    onRefreshList()
  }

  const recordResult = async (targetRunCaseId, status, comment, elapsedMinutes) => {
    await supabase.from('test_results').insert({
      run_case_id: targetRunCaseId,
      status,
      comment: comment || null,
      elapsed_minutes: elapsedMinutes || null,
      executed_by: userId,
    })
    await fetchRun()
    const idx = sortedRows.findIndex((r) => r.run_case_id === targetRunCaseId)
    const next = sortedRows.slice(idx + 1).find((r) => r.current_status === 'untested')
    if (next) goToCase(next.run_case_id)
  }

  const bulkMark = async (selectedIds, status) => {
    await supabase.from('test_results').insert(
      selectedIds.map((id) => ({ run_case_id: id, status, executed_by: userId }))
    )
    setSelected([])
    fetchRun()
  }

  const reassign = async (targetRunCaseId, assignedTo) => {
    await supabase.from('test_run_cases').update({ assigned_to: assignedTo || null }).eq('id', targetRunCaseId)
    fetchRun()
  }

  const activeRunCaseId = runCaseId || sortedRows[0]?.run_case_id
  const activeRunCase = sortedRows.find((r) => r.run_case_id === activeRunCaseId) || null
  const activeIndex = activeRunCase ? sortedRows.findIndex((r) => r.run_case_id === activeRunCaseId) : -1

  const goRelative = (delta) => {
    if (activeIndex === -1) return
    const target = sortedRows[activeIndex + delta]
    if (target) goToCase(target.run_case_id)
  }

  useRunCaseShortcuts({
    enabled: Boolean(activeRunCase) && canAuthor && run?.status === 'active' && !selectMode,
    onNext: () => goRelative(1),
    onPrev: () => goRelative(-1),
    onMark: (status) => recordResult(activeRunCaseId, status, '', null),
  })

  if (loading || !run) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <ProjectSidebar />
        <div className="flex-1 p-6 animate-pulse">
          <div className="h-8 w-96 bg-gray-800 rounded-lg" />
        </div>
      </div>
    )
  }

  const counts = countsFor(rows)
  const total = rows.length
  const executed = total - (counts.untested || 0)
  const passRate = executed > 0 ? Math.round(((counts.passed || 0) / executed) * 100) : 0

  return (
    <div className="h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0 flex flex-col h-screen">
        <AppHeader
          breadcrumb={[
            { label: 'Projects', to: '/dashboard' },
            { label: project?.name, to: `/project/${projectId}/overview` },
            { label: 'Test Runs & Results', to: `/project/${projectId}/runs` },
            { label: run.name },
          ]}
        />
        <PageHeader
          title={run.name}
          badge={<StatusBadge domain={RUN_STATUS} value={run.status} />}
          subtitle={run.description || `Created by ${run.creator?.name || 'someone'} · ${executed}/${total} executed · ${passRate}% pass rate`}
          actions={
            canAuthor && (
              <button
                onClick={toggleStatus}
                className="flex items-center gap-1.5 border border-gray-600 hover:bg-gray-650 text-gray-300 px-3 py-1.5 rounded-md text-[12px] font-semibold"
              >
                {run.status === 'active' ? <><Lock size={13} /> Close Run</> : <><Unlock size={13} /> Reopen Run</>}
              </button>
            )
          }
        />

        <div className="px-6 pt-4 flex-shrink-0">
          <button
            onClick={() => navigate(`/project/${projectId}/runs`)}
            className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-white mb-3"
          >
            <ArrowLeft size={14} /> All Test Runs
          </button>
          <div className="max-w-xl mb-4">
            <StatusProgressBar domain={TEST_RUN_RESULT} counts={counts} showLegend height="h-2.5" />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-6">
            <EmptyState title="No test cases in this run" description="This run has no cases — delete it and create a new one with cases selected." />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex border-t border-gray-600">
            <RunCaseRail
              rows={sortedRows}
              caseById={caseById}
              activeRunCaseId={activeRunCaseId}
              onSelect={goToCase}
              canAuthor={canAuthor}
              runActive={run.status === 'active'}
              selectMode={selectMode}
              onToggleSelectMode={() => { setSelectMode((s) => !s); setSelected([]) }}
              selected={selected}
              onToggleSelected={(id) => setSelected((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]))}
              bulkActions={[
                { label: 'Mark Passed', onClick: (sel) => bulkMark(sel, 'passed') },
                { label: 'Mark Failed', onClick: (sel) => bulkMark(sel, 'failed'), destructive: true },
              ]}
            />
            <RunCaseExecutionPanel
              runCase={activeRunCase}
              testCase={activeRunCase ? caseById[activeRunCase.test_case_id] : null}
              members={members}
              canAuthor={canAuthor}
              runActive={run.status === 'active'}
              position={{ index: activeIndex + 1, total: sortedRows.length }}
              onReassign={reassign}
              onSubmitResult={recordResult}
              onPrev={() => goRelative(-1)}
              onNext={() => goRelative(1)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
