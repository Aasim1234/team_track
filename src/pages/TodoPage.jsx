import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckSquare, CheckCircle2, XCircle, RotateCcw, ExternalLink, MessageSquareWarning, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAllRows'
import { useAuth } from '../hooks/useAuth'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import FailCommentModal from '../components/FailCommentModal'
import { VMS_RESULT, TODO_TASK_STATUS } from '../lib/statusConfig'
import { formatAuditTime } from '../lib/auditLog'

// A task is an assigned test case, read straight from the test case itself, so
// To-Do and the Test Plan grid always show the same assignment, result and
// task state — on every device, after every refresh.
const TASK_FIELDS =
  'id, plan_id, topic, scenario, test_steps, expected_result, result, failure_comment, ' +
  'assigned_to, assigned_at, assigned_by, task_status, task_status_at, ' +
  'plan:test_plans(id, name), assigner:profiles!assigned_by(id, name)'

const REASON_RESULTS = ['fail', 'blocked']
const STAYS_OPEN_RESULTS = ['fail', 'blocked', 'retest']

const RESULT_CLASS = {
  pass: 'bg-green-500/10 text-green-400 border-green-500/30',
  fail: 'bg-red-500/10 text-red-400 border-red-500/30',
  blocked: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  retest: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  na: 'bg-gray-500/10 text-gray-400 border-gray-600/40',
  not_tested: 'bg-gray-700/40 text-gray-400 border-gray-600/40',
}

const TASK_SAVED = { completed: 'Task completed — moved to Completed / Closed', closed: 'Task closed — moved to Completed / Closed', open: 'Task reopened' }

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="text-[12px] text-gray-300 whitespace-pre-wrap break-words bg-gray-800/60 border border-gray-700 rounded-md px-3 py-2">
        {children || <span className="text-gray-600">—</span>}
      </div>
    </div>
  )
}

export default function TodoPage() {
  const { id: projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reasonFor, setReasonFor] = useState(null)   // { status, existing } | null

  // Kept after close so dialogs don't blank out while they animate away.
  const lastTaskRef = useRef(null)
  const reasonStatusRef = useRef('fail')
  if (reasonFor) reasonStatusRef.current = reasonFor.status

  const fetchTasks = useCallback(async () => {
    if (!user) return
    const { data, error } = await fetchAllRows(() =>
      supabase
        .from('vms_test_plan_rows')
        .select(TASK_FIELDS)
        .eq('project_id', projectId)
        .eq('assigned_to', user.id)
        .order('id'))
    if (error) toast.error(error.message)
    setTasks((data || []).sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at)))
    setLoading(false)
  }, [projectId, user])

  useEffect(() => {
    supabase.from('projects').select('id, name').eq('id', projectId).single().then(({ data }) => setProject(data))
  }, [projectId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Assignments also change in the Test Plan grid and on other devices.
  useEffect(() => {
    const onFocus = () => fetchTasks()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchTasks])

  const current = tasks.find((t) => t.id === openId) || null
  if (current) lastTaskRef.current = current
  const shown = current || lastTaskRef.current

  const openTasks = tasks.filter((t) => t.task_status === 'open')
  const doneTasks = tasks.filter((t) => t.task_status !== 'open')
  const q = search.trim().toLowerCase()
  const visible = (tab === 'open' ? openTasks : doneTasks)
    .filter((t) => !q || `${t.scenario || ''} ${t.topic || ''} ${t.plan?.name || ''}`.toLowerCase().includes(q))

  const assignerName = (t) =>
    !t.assigned_by ? 'System' : t.assigned_by === user?.id ? 'You' : t.assigner?.name || 'Unknown user'

  // Every change goes to the test case row; the database applies the same
  // rules as the Test Plan grid and writes the activity log.
  const save = async (patch, success) => {
    if (!current) return false
    setBusy(true)
    const { data, error } = await supabase
      .from('vms_test_plan_rows')
      .update(patch)
      .eq('id', current.id)
      .select(TASK_FIELDS)
      .single()
    setBusy(false)
    if (error) { toast.error(error.message); fetchTasks(); return false }
    setTasks((ts) => (data.assigned_to === user.id
      ? ts.map((t) => (t.id === data.id ? data : t))
      : ts.filter((t) => t.id !== data.id)))
    if (success) toast.success(success)
    return true
  }

  // Fail and Blocked need a reason first; nothing changes until it is given.
  const setResult = (result) => {
    if (REASON_RESULTS.includes(result)) { setReasonFor({ status: result, existing: null }); return }
    save({ result }, `Result set to ${VMS_RESULT[result]?.label}`)
  }

  const confirmReason = (comment) =>
    save({ result: reasonFor.status, failure_comment: comment }, `Marked as ${VMS_RESULT[reasonFor.status]?.label}`)

  const setTaskStatus = async (status) => {
    if (status === 'closed' && !confirm('Close this task without completing it? The test case and its result stay as they are.')) return
    const ok = await save({ task_status: status }, TASK_SAVED[status])
    if (ok && status !== 'open') setOpenId(null)
  }

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

  const untested = !shown?.result || shown.result === 'not_tested'

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: project?.name, to: `/project/${projectId}/overview` }, { label: 'To-Do' }]} />
        <PageHeader title="To-Do" subtitle="Test cases assigned to you — run them, record the result, then complete the task" />

        <div className="p-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 border-b border-gray-700 mr-2">
              {[['open', `Open / Pending (${openTasks.length})`], ['done', `Completed / Closed (${doneTasks.length})`]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px ${
                    tab === key ? 'text-blue-500 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative ml-auto">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search test case or plan…"
                className="bg-gray-800 border border-gray-700 rounded-md pl-7 pr-7 py-1.5 text-[12px] text-gray-300 w-64 outline-none focus:border-gray-600"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="border border-gray-800 rounded-lg">
              <EmptyState
                icon={CheckSquare}
                title={q ? 'No tasks match your search' : tab === 'open' ? 'No open tasks' : 'No completed or closed tasks yet'}
                description={q ? 'Try a different test case or plan name.' : tab === 'open'
                  ? 'Use “Assign to me” on a test case in VMS Test Plans and it will appear here as a task.'
                  : 'Tasks you complete or close will be listed here.'}
              />
            </div>
          ) : (
            <div className="border border-gray-800 rounded-lg overflow-x-auto">
              <table className="w-full border-collapse table-fixed min-w-[1000px]">
                <thead>
                  <tr className="bg-gray-800/80 text-left">
                    {[
                      ['Test Case / Scenario', 'w-[26%]'], ['Assigned By / To', 'w-[13%]'], ['Test Plan', 'w-[13%]'],
                      ['Result', 'w-[17%]'], ['Assigned On', 'w-[12%]'], ['Task', 'w-[11%]'], ['Action', 'w-[8%]'],
                    ].map(([label, w]) => (
                      <th key={label} className={`${w} px-2.5 py-2 text-[11px] font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-700`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t.id} className="align-top border-b border-gray-800/70 text-[12px] hover:bg-gray-800/30">
                      <td className="px-2.5 py-2">
                        <button onClick={() => setOpenId(t.id)} className="text-left text-white font-medium hover:text-blue-400 line-clamp-2">
                          {t.scenario || t.topic || 'Untitled test case'}
                        </button>
                        {t.topic && t.scenario && <p className="text-[11px] text-gray-500 truncate">{t.topic}</p>}
                      </td>
                      <td className="px-2.5 py-2">
                        <p className="text-gray-300 truncate">By {assignerName(t)}</p>
                        <p className="text-[11px] text-gray-500">To you</p>
                      </td>
                      <td className="px-2.5 py-2 text-gray-300 truncate" title={t.plan?.name || ''}>{t.plan?.name || '—'}</td>
                      <td className="px-2.5 py-2">
                        <StatusBadge domain={VMS_RESULT} value={t.result || 'not_tested'} size="sm" />
                        {REASON_RESULTS.includes(t.result) && t.failure_comment && (
                          <p className="text-[11px] text-gray-500 mt-1 line-clamp-2" title={t.failure_comment}>{t.failure_comment}</p>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-gray-400 tabular-nums">{formatAuditTime(t.assigned_at)}</td>
                      <td className="px-2.5 py-2">
                        <StatusBadge domain={TODO_TASK_STATUS} value={t.task_status} size="sm" />
                        {t.task_status !== 'open' && t.task_status_at && (
                          <p className="text-[10px] text-gray-500 mt-1 tabular-nums">{formatAuditTime(t.task_status_at)}</p>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        <button
                          onClick={() => setOpenId(t.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                            t.task_status === 'open'
                              ? 'bg-blue-500 hover:bg-blue-400 text-white'
                              : 'border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500'
                          }`}
                        >
                          {t.task_status === 'open' ? 'Open' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(current)}
        onClose={() => setOpenId(null)}
        title="Test Case Task"
        size="xl"
        footer={shown && (
          <>
            <button
              onClick={() => navigate(`/project/${projectId}/plans/${shown.plan_id}`)}
              className="mr-auto flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-white"
            >
              <ExternalLink size={13} /> View in Test Plan
            </button>
            {shown.task_status === 'open' ? (
              <>
                <button
                  onClick={() => setTaskStatus('closed')}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-300 border border-gray-600 hover:bg-gray-700/50 disabled:opacity-40"
                >
                  <XCircle size={13} /> Close Task
                </button>
                <button
                  onClick={() => setTaskStatus('completed')}
                  disabled={busy || untested}
                  title={untested ? 'Record a result before completing the task' : undefined}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-600"
                >
                  <CheckCircle2 size={13} /> Complete Task
                </button>
              </>
            ) : (
              <button
                onClick={() => setTaskStatus('open')}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-300 border border-gray-600 hover:bg-gray-700/50 disabled:opacity-40"
              >
                <RotateCcw size={13} /> Reopen Task
              </button>
            )}
          </>
        )}
      >
        {shown && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-white">{shown.scenario || shown.topic || 'Untitled test case'}</p>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  {[shown.topic, shown.plan?.name].filter(Boolean).join(' · ')}
                </p>
              </div>
              <StatusBadge domain={TODO_TASK_STATUS} value={shown.task_status} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              {[
                ['Assigned by', assignerName(shown)],
                ['Assigned to', 'You'],
                ['Assigned on', formatAuditTime(shown.assigned_at)],
                [shown.task_status === 'completed' ? 'Completed on' : shown.task_status === 'closed' ? 'Closed on' : 'Opened on',
                  formatAuditTime(shown.task_status_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[11px] text-gray-500">{label}</p>
                  <p className="text-white font-medium">{value || '—'}</p>
                </div>
              ))}
            </div>

            <Detail label="Test Steps">{shown.test_steps}</Detail>
            <Detail label="Expected Result">{shown.expected_result}</Detail>

            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Result</p>
              <div className="flex items-start gap-3">
                <select
                  value={shown.result || 'not_tested'}
                  onChange={(e) => setResult(e.target.value)}
                  disabled={busy}
                  className={`w-40 text-[12px] font-semibold rounded-md border px-2 py-1 outline-none ${RESULT_CLASS[shown.result] || RESULT_CLASS.not_tested}`}
                >
                  {Object.entries(VMS_RESULT).map(([key, cfg]) => (
                    <option key={key} value={key} className="bg-gray-800 text-gray-300">{cfg.label}</option>
                  ))}
                </select>
                {REASON_RESULTS.includes(shown.result) && (
                  <button
                    onClick={() => setReasonFor({ status: shown.result, existing: shown.failure_comment || '' })}
                    title="Edit reason"
                    className="flex items-start gap-1.5 text-left text-[12px] text-gray-300 hover:text-white min-w-0"
                  >
                    <MessageSquareWarning size={13} className={`mt-0.5 flex-shrink-0 ${shown.result === 'fail' ? 'text-red-400' : 'text-orange-400'}`} />
                    <span className="line-clamp-3">{shown.failure_comment || 'Add reason'}</span>
                  </button>
                )}
              </div>
              {shown.task_status === 'open' && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {untested
                    ? 'Run the test and record a result, then complete the task.'
                    : STAYS_OPEN_RESULTS.includes(shown.result)
                      ? 'This task stays open until you complete or close it.'
                      : 'Result recorded — complete the task when you are done.'}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <FailCommentModal
        open={Boolean(reasonFor)}
        onClose={() => setReasonFor(null)}
        row={shown}
        existing={reasonFor?.existing}
        status={reasonStatusRef.current}
        onConfirm={confirmReason}
      />
    </div>
  )
}
