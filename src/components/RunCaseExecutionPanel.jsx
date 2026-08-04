import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import StatusBadge from './ui/StatusBadge'
import FormField, { inputClass } from './ui/FormField'
import PrimaryButton from './ui/Button'
import TestCaseStepsEditor from './TestCaseStepsEditor'
import { TEST_RUN_RESULT } from '../lib/statusConfig'

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

export default function RunCaseExecutionPanel({
  runCase,
  testCase,
  members,
  canAuthor,
  runActive,
  position,
  onReassign,
  onSubmitResult,
  onPrev,
  onNext,
}) {
  const [status, setStatus] = useState('passed')
  const [comment, setComment] = useState('')
  const [elapsed, setElapsed] = useState('')
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    setStatus('passed')
    setComment('')
    setElapsed('')
    if (!runCase) return
    setLoadingHistory(true)
    supabase
      .from('test_results')
      .select('*, profiles(name)')
      .eq('run_case_id', runCase.run_case_id)
      .order('executed_at', { ascending: false })
      .then(({ data }) => {
        setHistory(data || [])
        setLoadingHistory(false)
      })
  }, [runCase?.run_case_id])

  if (!runCase) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-[13px]">
        Select a case from the list to begin.
      </div>
    )
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmitResult(runCase.run_case_id, status, comment, elapsed ? Number(elapsed) : null)
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-5 py-3 border-b border-gray-600 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-mono text-gray-500">{testCase?.human_id}</p>
          <h3 className="text-[15px] font-semibold text-white truncate">{testCase?.title || 'Test case'}</h3>
        </div>
        <StatusBadge domain={TEST_RUN_RESULT} value={runCase.current_status} dot />
        <span className="text-[11px] text-gray-500 flex-shrink-0">{position.index} / {position.total}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onPrev} disabled={position.index <= 1} className="p-1.5 rounded-md hover:bg-gray-650 disabled:opacity-30 text-gray-400">
            <ChevronLeft size={15} />
          </button>
          <button onClick={onNext} disabled={position.index >= position.total} className="p-1.5 rounded-md hover:bg-gray-650 disabled:opacity-30 text-gray-400">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5 max-w-3xl">
        <div className="max-w-xs" onClick={(e) => e.stopPropagation()}>
          <FormField label="Assigned to">
            <select
              value={runCase.assigned_to || ''}
              onChange={(e) => onReassign(runCase.run_case_id, e.target.value)}
              disabled={!canAuthor}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </FormField>
        </div>

        {(testCase?.preconditions || testCase?.objective) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {testCase?.preconditions && (
              <div>
                <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide mb-1">Preconditions</p>
                <p className="text-[13px] text-gray-300 whitespace-pre-wrap">{testCase.preconditions}</p>
              </div>
            )}
            {testCase?.objective && (
              <div>
                <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide mb-1">Objective</p>
                <p className="text-[13px] text-gray-300 whitespace-pre-wrap">{testCase.objective}</p>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide mb-1.5">Steps</p>
          <TestCaseStepsEditor testCaseId={runCase.test_case_id} canEdit={false} />
        </div>

        {runActive ? (
          <form onSubmit={handleSubmit} className="pt-4 border-t border-gray-600 space-y-3">
            <FormField label="Result">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TEST_RUN_RESULT).filter(([k]) => k !== 'untested').map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStatus(k)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium border transition-colors duration-150 ${
                      status === k ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-600 text-gray-400 hover:bg-gray-650'
                    }`}
                  >
                    {v.label}
                    {['passed', 'failed', 'blocked'].includes(k) && (
                      <kbd className="text-[10px] opacity-60 font-sans">{k[0].toUpperCase()}</kbd>
                    )}
                  </button>
                ))}
              </div>
            </FormField>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <FormField label="Comment">
                <input value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} placeholder="Optional" />
              </FormField>
              <FormField label="Elapsed (min)">
                <input type="number" min="0" value={elapsed} onChange={(e) => setElapsed(e.target.value)} className={inputClass} />
              </FormField>
            </div>
            <PrimaryButton type="submit">Add Result</PrimaryButton>
          </form>
        ) : (
          <p className="text-[12px] text-gray-500 pt-4 border-t border-gray-600">
            This run is closed — reopen it to record new results.
          </p>
        )}

        <div>
          <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide mb-2">Execution History</p>
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
    </div>
  )
}
