import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Trash2, Search, X, MessageSquareWarning } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from './ui/Toast'
import { VMS_RESULT } from '../lib/statusConfig'
import FailCommentModal from './FailCommentModal'

const RESULT_CLASS = {
  pass: 'bg-green-500/10 text-green-400 border-green-500/30',
  fail: 'bg-red-500/10 text-red-400 border-red-500/30',
  blocked: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  retest: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  na: 'bg-gray-500/10 text-gray-400 border-gray-600/40',
  not_tested: 'bg-gray-700/40 text-gray-400 border-gray-600/40',
}

// Grows with its content so multi-line steps stay readable while editing.
function AutoTextarea({ value, onChange, onCommit, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      rows={1}
      className={className}
    />
  )
}

export default function VmsPlanGrid({ planId, projectId, canAuthor, canDelete }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [resultFilter, setResultFilter] = useState('all')
  const [drafts, setDrafts] = useState({})
  const [failFor, setFailFor] = useState(null)   // { row, existing } | null

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from('vms_test_plan_rows')
      .select('*')
      .eq('plan_id', planId)
      .order('sort_order')
    if (error) toast.error(error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchRows() }, [planId])

  const valueOf = (row, field) => (drafts[row.id]?.[field] ?? row[field] ?? '')

  const setDraft = (id, field, value) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }))

  const commit = async (row, field) => {
    const next = drafts[row.id]?.[field]
    if (next === undefined || next === (row[field] ?? '')) return
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, [field]: next } : r)))
    setDrafts((d) => {
      const copy = { ...d }
      if (copy[row.id]) { delete copy[row.id][field]; if (!Object.keys(copy[row.id]).length) delete copy[row.id] }
      return copy
    })
    const { error } = await supabase
      .from('vms_test_plan_rows')
      .update({ [field]: next || null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) { toast.error(error.message); fetchRows() }
  }

  // Failing a case needs a reason first, so nothing is written — and the
  // dropdown is not moved — until the dialog is confirmed. Cancelling leaves
  // the previous result exactly as it was.
  const setResult = async (row, result) => {
    if (result === 'fail') { setFailFor({ row, existing: null }); return }

    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, result, failure_comment: null } : r)))
    const { error } = await supabase.from('vms_test_plan_rows').update({ result }).eq('id', row.id)
    if (error) { toast.error(error.message); fetchRows() }
  }

  const confirmFail = async (comment) => {
    const row = failFor?.row
    if (!row) return false
    const { data, error } = await supabase
      .from('vms_test_plan_rows')
      .update({ result: 'fail', failure_comment: comment })
      .eq('id', row.id)
      .select('id, result, failure_comment, failed_at')
      .single()

    if (error) {
      // The database enforces this too; surface its refusal rather than
      // pretending the save worked.
      toast.error(
        error.message?.includes('vms_rows_fail_needs_comment')
          ? 'A failure reason is required when marking a test case as Failed.'
          : error.message)
      return false
    }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...data } : r)))
    return true
  }

  const addRow = async (afterRow) => {
    const order = afterRow ? afterRow.sort_order + 1 : (rows[rows.length - 1]?.sort_order ?? -1) + 1
    // Push everything below down so the new row lands where it was asked for.
    if (afterRow) {
      await Promise.all(
        rows.filter((r) => r.sort_order >= order)
            .map((r) => supabase.from('vms_test_plan_rows').update({ sort_order: r.sort_order + 1 }).eq('id', r.id)))
    }
    const { error } = await supabase.from('vms_test_plan_rows').insert({
      plan_id: planId,
      project_id: projectId,
      topic: afterRow?.topic || '',
      scenario: '',
      sort_order: order,
      result: 'not_tested',
    })
    if (error) { toast.error(error.message); return }
    fetchRows()
  }

  const deleteRow = async (row) => {
    if (!confirm('Delete this row?')) return
    const { error } = await supabase.from('vms_test_plan_rows').delete().eq('id', row.id)
    if (error) { toast.error(error.message); return }
    setRows((rs) => rs.filter((r) => r.id !== row.id))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (resultFilter !== 'all' && r.result !== resultFilter) return false
      if (!q) return true
      return `${r.topic} ${r.scenario} ${r.test_steps} ${r.expected_result}`.toLowerCase().includes(q)
    })
  }, [rows, search, resultFilter])

  const counts = useMemo(() => {
    const c = { total: rows.length }
    for (const key of Object.keys(VMS_RESULT)) c[key] = rows.filter((r) => r.result === key).length
    return c
  }, [rows])

  const cellClass =
    'w-full bg-transparent text-[12px] text-gray-200 leading-[1.4] resize-none outline-none focus:bg-gray-800/60 rounded px-1.5 py-0.5 whitespace-pre-wrap block'

  if (loading) return <div className="h-40 bg-gray-800/40 rounded-lg animate-pulse" />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topic, scenario, steps…"
            className="bg-gray-800 border border-gray-700 rounded-md pl-7 pr-7 py-1.5 text-[12px] text-gray-200 w-72 outline-none focus:border-gray-600"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {[['all', `All ${counts.total}`], ...Object.entries(VMS_RESULT).map(([k, v]) => [k, `${v.label} ${counts[k]}`])].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setResultFilter(key)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium border ${
                resultFilter === key ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' : 'border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {canAuthor && (
          <button
            onClick={() => addRow(null)}
            className="ml-auto flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-2.5 py-1.5 rounded-md text-[12px] font-semibold"
          >
            <Plus size={13} /> Add Row
          </button>
        )}
      </div>

      <div className="border border-gray-800 rounded-lg overflow-x-auto">
        <table className="w-full border-collapse table-fixed min-w-[960px]">
          <thead>
            <tr className="bg-gray-800/80 text-left">
              {[['Topic', 'w-[13%]'], ['Scenario', 'w-[18%]'], ['Test Steps', 'w-[33%]'], ['Expected Result', 'w-[26%]'], ['RESULT', 'w-[10%]']].map(([label, w]) => (
                <th key={label} className={`${w} px-2 py-1.5 text-[11px] font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-700`}>
                  {label}
                </th>
              ))}
              <th className="w-9 py-1.5 border-b border-gray-700" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              // Repeat the Topic only when it changes, the way the sheet reads.
              const previous = filtered[i - 1]
              const newTopic = !previous || previous.topic !== row.topic
              return (
                <tr key={row.id} className={`align-top border-b border-gray-800/70 hover:bg-gray-800/30 ${newTopic ? 'border-t border-t-gray-700' : ''}`}>
                  <td className="px-1 py-0.5">
                    {newTopic ? (
                      <AutoTextarea
                        value={valueOf(row, 'topic')}
                        onChange={(v) => setDraft(row.id, 'topic', v)}
                        onCommit={() => commit(row, 'topic')}
                        className={`${cellClass} font-semibold text-white`}
                      />
                    ) : (
                      <span className="block px-1.5 py-0.5 text-[12px] text-gray-600">↳</span>
                    )}
                  </td>
                  <td className="px-1 py-0.5">
                    <AutoTextarea value={valueOf(row, 'scenario')} onChange={(v) => setDraft(row.id, 'scenario', v)} onCommit={() => commit(row, 'scenario')} className={cellClass} />
                  </td>
                  <td className="px-1 py-0.5">
                    <AutoTextarea value={valueOf(row, 'test_steps')} onChange={(v) => setDraft(row.id, 'test_steps', v)} onCommit={() => commit(row, 'test_steps')} className={`${cellClass} text-gray-300`} />
                  </td>
                  <td className="px-1 py-0.5">
                    <AutoTextarea value={valueOf(row, 'expected_result')} onChange={(v) => setDraft(row.id, 'expected_result', v)} onCommit={() => commit(row, 'expected_result')} className={`${cellClass} text-gray-300`} />
                  </td>
                  <td className="px-1.5 py-1">
                    <select
                      value={row.result || 'not_tested'}
                      onChange={(e) => setResult(row, e.target.value)}
                      disabled={!canAuthor}
                      className={`w-full text-[11px] font-semibold rounded-md border px-1.5 py-0.5 outline-none ${RESULT_CLASS[row.result] || RESULT_CLASS.not_tested}`}
                    >
                      {Object.entries(VMS_RESULT).map(([key, cfg]) => (
                        <option key={key} value={key} className="bg-gray-800 text-gray-200">{cfg.label}</option>
                      ))}
                    </select>
                    {row.result === 'fail' && (
                      <button
                        onClick={() => setFailFor({ row, existing: row.failure_comment || '' })}
                        title={row.failure_comment || ''}
                        className="mt-0.5 flex items-start gap-1 text-left text-[10px] text-gray-400 hover:text-gray-200 w-full"
                      >
                        <MessageSquareWarning size={11} className="mt-px flex-shrink-0 text-red-400/70" />
                        <span className="line-clamp-2">{row.failure_comment || 'Add reason'}</span>
                      </button>
                    )}
                  </td>
                  <td className="py-1 text-center">
                    {canDelete && (
                      <button onClick={() => deleteRow(row)} title="Delete row" className="p-1 text-gray-600 hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-gray-500">
                  {rows.length ? 'No rows match your search.' : 'No rows yet — import from your sheet or add one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-500">
        Showing {filtered.length} of {rows.length} rows. Click any cell to edit — changes save when you click away.
      </p>

      <FailCommentModal
        open={Boolean(failFor)}
        onClose={() => setFailFor(null)}
        row={failFor?.row}
        existing={failFor?.existing}
        onConfirm={confirmFail}
      />
    </div>
  )
}
