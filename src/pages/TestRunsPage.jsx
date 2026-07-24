import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, Lock, Unlock, PlayCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import NewTestRunModal from '../components/NewTestRunModal'
import EnterpriseTable from '../components/ui/EnterpriseTable'
import StatusBadge from '../components/ui/StatusBadge'
import StatusProgressBar from '../components/ui/StatusProgressBar'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import FormField, { inputClass } from '../components/ui/FormField'
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
  const { id: projectId, runId } = useParams()
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
        supabase.from('test_cases').select('id, human_id, title').eq('project_id', projectId).order('human_id'),
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

function TestRunDetail({ projectId, runId, project, cases, members, canAuthor, userId, onRefreshList }) {
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [activeRunCase, setActiveRunCase] = useState(null)

  const caseById = Object.fromEntries(cases.map((c) => [c.id, c]))
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]))

  const fetchRun = async () => {
    const [{ data: runRow }, { data: statusData }] = await Promise.all([
      supabase.from('test_runs').select('*, creator:profiles!created_by(name)').eq('id', runId).single(),
      supabase.from('test_run_case_current_status').select('*').eq('run_id', runId),
    ])
    setRun(runRow)
    setRows(statusData || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchRun()
  }, [runId])

  const toggleStatus = async () => {
    const newStatus = run.status === 'active' ? 'closed' : 'active'
    const patch = newStatus === 'closed' ? { status: newStatus, closed_by: userId, closed_at: new Date().toISOString() } : { status: newStatus }
    await supabase.from('test_runs').update(patch).eq('id', runId)
    fetchRun()
    onRefreshList()
  }

  const recordResult = async (runCaseId, status, comment, elapsedMinutes) => {
    await supabase.from('test_results').insert({
      run_case_id: runCaseId,
      status,
      comment: comment || null,
      elapsed_minutes: elapsedMinutes || null,
      executed_by: userId,
    })
    fetchRun()
  }

  const bulkMark = async (selectedRows, status) => {
    await supabase.from('test_results').insert(
      selectedRows.map((r) => ({ run_case_id: r.run_case_id, status, executed_by: userId }))
    )
    setSelected([])
    fetchRun()
  }

  const reassign = async (runCaseId, assignedTo) => {
    await supabase.from('test_run_cases').update({ assigned_to: assignedTo || null }).eq('id', runCaseId)
    fetchRun()
  }

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
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
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

        <div className="p-6">
          <button
            onClick={() => navigate(`/project/${projectId}/runs`)}
            className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-white mb-4"
          >
            <ArrowLeft size={14} /> All Test Runs
          </button>

          <div className="mb-4 max-w-xl">
            <StatusProgressBar domain={TEST_RUN_RESULT} counts={counts} showLegend height="h-2.5" />
          </div>

          <EnterpriseTable
            rows={rows}
            rowKey={(r) => r.run_case_id}
            onRowClick={(r) => setActiveRunCase(r)}
            selectable={canAuthor && run.status === 'active'}
            selected={selected}
            onSelectionChange={setSelected}
            bulkActions={[
              { label: 'Mark Passed', onClick: (sel) => bulkMark(sel, 'passed') },
              { label: 'Mark Failed', onClick: (sel) => bulkMark(sel, 'failed'), destructive: true },
            ]}
            emptyState={<EmptyState title="No test cases in this run" description="This run has no cases — delete it and create a new one with cases selected." />}
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
              {
                key: 'assigned',
                label: 'Assigned To',
                render: (r) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <select
                      value={r.assigned_to || ''}
                      onChange={(e) => reassign(r.run_case_id, e.target.value)}
                      disabled={!canAuthor}
                      className="text-[12px] bg-transparent border border-gray-600 rounded-md px-1.5 py-1 outline-none disabled:opacity-70"
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                ),
              },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge domain={TEST_RUN_RESULT} value={r.current_status} dot /> },
              {
                key: 'last',
                label: 'Last Executed',
                render: (r) => r.last_executed_at ? `${memberById[r.last_executed_by]?.name || 'Someone'} · ${timeAgo(r.last_executed_at)}` : '—',
              },
            ]}
          />
        </div>
      </div>

      {activeRunCase && (
        <RecordResultModal
          runCase={activeRunCase}
          testCase={caseById[activeRunCase.test_case_id]}
          runOpen={run.status === 'active'}
          onClose={() => setActiveRunCase(null)}
          onSubmit={(status, comment, elapsed) => {
            recordResult(activeRunCase.run_case_id, status, comment, elapsed)
            setActiveRunCase(null)
          }}
        />
      )}
    </div>
  )
}

function RecordResultModal({ runCase, testCase, runOpen, onClose, onSubmit }) {
  const [status, setStatus] = useState('passed')
  const [comment, setComment] = useState('')
  const [elapsed, setElapsed] = useState('')
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    supabase
      .from('test_results')
      .select('*, profiles(name)')
      .eq('run_case_id', runCase.run_case_id)
      .order('executed_at', { ascending: false })
      .then(({ data }) => {
        setHistory(data || [])
        setLoadingHistory(false)
      })
  }, [runCase.run_case_id])

  return (
    <Modal open onClose={onClose} title={`${testCase?.human_id || ''} — ${testCase?.title || 'Test case'}`} size="lg">
      <div className="space-y-4">
        {runOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit(status, comment, elapsed ? Number(elapsed) : null)
            }}
            className="space-y-3 pb-4 border-b border-gray-600"
          >
            <FormField label="Result">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                {Object.entries(TEST_RUN_RESULT).filter(([k]) => k !== 'untested').map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </FormField>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <FormField label="Comment">
                <input value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} placeholder="Optional" />
              </FormField>
              <FormField label="Elapsed (min)">
                <input type="number" min="0" value={elapsed} onChange={(e) => setElapsed(e.target.value)} className={inputClass} />
              </FormField>
            </div>
            <button type="submit" className="w-full bg-blue-500 hover:bg-blue-400 py-2 rounded-md text-[13px] font-semibold text-white">
              Add Result
            </button>
          </form>
        ) : (
          <p className="text-[12px] text-gray-500 pb-4 border-b border-gray-600">
            This run is closed — reopen it to record new results.
          </p>
        )}

        <div>
          <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide mb-2">History</p>
          {loadingHistory ? (
            <p className="text-[12px] text-gray-500">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-[12px] text-gray-500">No results recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-start gap-2 text-[12px]">
                  <StatusBadge domain={TEST_RUN_RESULT} value={h.status} size="sm" />
                  <div className="flex-1 min-w-0">
                    {h.comment && <p className="text-gray-300">{h.comment}</p>}
                    <p className="text-gray-500">
                      {h.profiles?.name || 'Someone'} · {timeAgo(h.executed_at)}
                      {h.elapsed_minutes ? ` · ${h.elapsed_minutes}m` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
