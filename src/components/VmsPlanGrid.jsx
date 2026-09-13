import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Search, X, MessageSquareWarning, Pencil, Check, Lock, UserPlus, UserCheck } from 'lucide-react'
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

// Results that cannot be recorded without a reason.
const REASON_RESULTS = ['fail', 'blocked']
const REASON_ICON_CLASS = { fail: 'text-red-400/70', blocked: 'text-orange-400/70' }

// Assignment and its To-Do task are kept together by the database.
const ASSIGNMENT_FIELDS = 'assigned_to, assigned_at, assigned_by, task_status, task_status_at'
const TASK_SUFFIX = { completed: ' · Completed', closed: ' · Closed' }

// The fields a row's Edit button unlocks. RESULT is deliberately not one of
// them — recording a result has to stay a single click.
const EDITABLE = ['topic', 'scenario', 'test_steps', 'expected_result']

const norm = (value) => value ?? ''

// Grows with its content so multi-line steps stay readable while editing.
function AutoTextarea({ value, onChange, onKeyDown, autoFocus, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  useEffect(() => {
    if (!autoFocus || !ref.current) return
    ref.current.focus()
    const end = ref.current.value.length
    ref.current.setSelectionRange(end, end)
  }, [autoFocus])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      rows={1}
      className={className}
    />
  )
}

export default function VmsPlanGrid({ planId, projectId, canAuthor, canManageAssignments, userId, members = [] }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [resultFilter, setResultFilter] = useState('all')
  const [assignFilter, setAssignFilter] = useState('all')
  const [reasonFor, setReasonFor] = useState(null)   // { row, status, existing } | null
  // Kept after close so the dialog doesn't switch colours while it animates out.
  const reasonStatusRef = useRef('fail')
  if (reasonFor) reasonStatusRef.current = reasonFor.status

  // Rows are read-only until their Edit button is clicked; one row at a time.
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const editingRef = useRef(null)
  editingRef.current = editingId

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from('vms_test_plan_rows')
      .select('*, assignee:profiles!assigned_to(id, name)')
      .eq('plan_id', planId)
      .order('sort_order')
    if (error) toast.error(error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchRows() }, [planId])

  // Pick up test cases other people took while this tab was in the background.
  useEffect(() => {
    const onFocus = () => { if (!editingRef.current) fetchRows() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [planId])

  const memberNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name || 'Unnamed user'])),
    [members])
  const assigneeName = (row) =>
    memberNames[row.assigned_to] || (row.assignee?.id === row.assigned_to && row.assignee?.name) || 'another user'

  // Someone else's test case is read-only unless you may override assignments.
  // The database enforces the same rule; this only hides controls that would fail.
  const isLocked = (row) => Boolean(row.assigned_to) && row.assigned_to !== userId && !canManageAssignments

  const applyRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const editingRow = rows.find((r) => r.id === editingId)
  const isDirty = editingRow ? EDITABLE.some((f) => norm(draft[f]) !== norm(editingRow[f])) : false

  const openEditor = (row) => {
    setEditingId(row.id)
    setDraft(Object.fromEntries(EDITABLE.map((f) => [f, row[f] ?? ''])))
  }

  // Switching rows would silently drop what was typed, so ask first.
  const confirmDiscard = () =>
    !isDirty || confirm('You have unsaved changes on the row you are editing. Discard them?')

  const startEdit = (row) => {
    if (editingId === row.id) return
    if (!confirmDiscard()) return
    openEditor(row)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft({})
  }

  const saveEdit = async () => {
    if (!editingRow || saving) return
    const changes = {}
    for (const f of EDITABLE) {
      if (norm(draft[f]) !== norm(editingRow[f])) changes[f] = draft[f] || null
    }
    if (!Object.keys(changes).length) { cancelEdit(); return }

    setSaving(true)
    const { error } = await supabase
      .from('vms_test_plan_rows')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', editingRow.id)
    setSaving(false)
    // Stay in edit mode on failure so nothing that was typed is lost.
    if (error) { toast.error(error.message); fetchRows(); return }

    applyRow(editingRow.id, changes)
    cancelEdit()
  }

  const onEditKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit() }
  }

  // Failing or blocking a case needs a reason first, so nothing is written —
  // and the dropdown is not moved — until the dialog is confirmed. Cancelling
  // leaves the previous result exactly as it was.
  const setResult = async (row, result) => {
    if (REASON_RESULTS.includes(result)) { setReasonFor({ row, status: result, existing: null }); return }

    applyRow(row.id, { result, failure_comment: null })
    const { error } = await supabase.from('vms_test_plan_rows').update({ result }).eq('id', row.id)
    if (error) { toast.error(error.message); fetchRows() }
  }

  const confirmReason = async (comment) => {
    const row = reasonFor?.row
    if (!row) return false
    const { data, error } = await supabase
      .from('vms_test_plan_rows')
      .update({ result: reasonFor.status, failure_comment: comment })
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
      fetchRows()
      return false
    }
    applyRow(row.id, data)
    return true
  }

  // Only succeeds while the test case is still free, so two people clicking at
  // the same moment cannot both take it.
  const assignToMe = async (row) => {
    const { data, error } = await supabase
      .from('vms_test_plan_rows')
      .update({ assigned_to: userId })
      .eq('id', row.id)
      .is('assigned_to', null)
      .select(ASSIGNMENT_FIELDS)
    if (error) { toast.error(error.message); fetchRows(); return }
    if (!data?.length) { toast.error('Someone else has just taken this test case.'); fetchRows(); return }
    applyRow(row.id, { ...data[0], assignee: { id: userId, name: memberNames[userId] } })
    toast.success('Assigned to you — added to your To-Do')
  }

  const releaseMine = async (row) => {
    if (!confirm('Unassign yourself from this test case? Anyone will then be able to take it.')) return
    const { data, error } = await supabase
      .from('vms_test_plan_rows')
      .update({ assigned_to: null })
      .eq('id', row.id)
      .eq('assigned_to', userId)
      .select(ASSIGNMENT_FIELDS)
    if (error || !data?.length) {
      toast.error(error?.message || 'This test case is no longer assigned to you.')
      fetchRows()
      return
    }
    applyRow(row.id, { ...data[0], assignee: null })
  }

  // Admin/Lead only: take over, hand over, or clear someone else's assignment.
  const overrideAssignment = async (row, target) => {
    if (!target) return
    const from = assigneeName(row)
    const to = target === '__unassign' ? null : target
    const question = to
      ? `Override ${from}'s assignment and reassign this test case to ${to === userId ? 'yourself' : memberNames[to]}?`
      : `Override and remove ${from}'s assignment from this test case?`
    if (!confirm(question)) return
    const { data, error } = await supabase
      .from('vms_test_plan_rows')
      .update({ assigned_to: to })
      .eq('id', row.id)
      .select(ASSIGNMENT_FIELDS)
    if (error || !data?.length) { toast.error(error?.message || 'Could not change the assignment.'); fetchRows(); return }
    applyRow(row.id, { ...data[0], assignee: to ? { id: to, name: memberNames[to] } : null })
    toast.success(to ? `Reassigned to ${to === userId ? 'you' : memberNames[to]}` : 'Assignment removed')
  }

  // A new row is blank, so it opens straight in edit mode rather than making
  // the user find it among hundreds of rows and click Edit.
  const addRow = async () => {
    if (!confirmDiscard()) return
    const order = (rows[rows.length - 1]?.sort_order ?? -1) + 1
    const { data, error } = await supabase
      .from('vms_test_plan_rows')
      .insert({ plan_id: planId, project_id: projectId, topic: '', scenario: '', sort_order: order, result: 'not_tested' })
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    setRows((rs) => [...rs, data])
    setSearch('')
    setResultFilter('all')
    setAssignFilter('all')
    openEditor(data)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (resultFilter !== 'all' && r.result !== resultFilter) return false
      if (assignFilter === 'mine' && r.assigned_to !== userId) return false
      if (assignFilter === 'unassigned' && r.assigned_to) return false
      if (assignFilter === 'others' && (!r.assigned_to || r.assigned_to === userId)) return false
      if (!q) return true
      return `${r.topic} ${r.scenario} ${r.test_steps} ${r.expected_result}`.toLowerCase().includes(q)
    })
  }, [rows, search, resultFilter, assignFilter, userId])

  const counts = useMemo(() => {
    const c = { total: rows.length, mine: 0, unassigned: 0, others: 0 }
    for (const key of Object.keys(VMS_RESULT)) c[key] = rows.filter((r) => r.result === key).length
    for (const r of rows) {
      if (!r.assigned_to) c.unassigned++
      else if (r.assigned_to === userId) c.mine++
      else c.others++
    }
    return c
  }, [rows, userId])

  const readClass = 'px-1.5 py-0.5 text-[12px] leading-[1.4] whitespace-pre-wrap break-words'
  const editClass =
    'w-full bg-gray-900 border border-gray-600 focus:border-blue-500 text-[12px] text-gray-100 leading-[1.4] resize-none outline-none rounded px-1.5 py-0.5 whitespace-pre-wrap block'

  const readCell = (value, extra = '') => (
    <div className={`${readClass} ${extra}`}>{value || <span className="text-gray-600">—</span>}</div>
  )

  const editCell = (field, extra = '', autoFocus = false) => (
    <AutoTextarea
      value={draft[field] ?? ''}
      onChange={(v) => setDraft((d) => ({ ...d, [field]: v }))}
      onKeyDown={onEditKeyDown}
      autoFocus={autoFocus}
      className={`${editClass} ${extra}`}
    />
  )

  // Shown under each RESULT: who has the test case, and what you may do about it.
  const assignment = (row) => {
    if (!row.assigned_to) {
      return canAuthor ? (
        <button
          onClick={() => assignToMe(row)}
          className="mt-1 flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300"
        >
          <UserPlus size={11} /> Assign to me
        </button>
      ) : (
        <span className="mt-1 block text-[10px] text-gray-600">Unassigned</span>
      )
    }

    if (row.assigned_to === userId) {
      return (
        <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded px-1.5 py-0.5">
          <UserCheck size={11} className="flex-shrink-0" />
          <span className="truncate flex-1">Assigned to you{TASK_SUFFIX[row.task_status] || ''}</span>
          <button onClick={() => releaseMine(row)} title="Unassign yourself" className="text-blue-400/70 hover:text-blue-300 flex-shrink-0">
            <X size={10} />
          </button>
        </div>
      )
    }

    const name = assigneeName(row)
    return (
      <>
        <div
          title={`Assigned to ${name}. Only ${name} or an Admin/Lead can update, unassign or reassign this test case.`}
          className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5"
        >
          <Lock size={10} className="flex-shrink-0" />
          <span className="truncate">Assigned to {name}{TASK_SUFFIX[row.task_status] || ''}</span>
        </div>
        {canManageAssignments && (
          <select
            value=""
            onChange={(e) => overrideAssignment(row, e.target.value)}
            title="Admin/Lead override"
            className="mt-0.5 w-full text-[10px] bg-transparent border border-gray-700 hover:border-gray-600 rounded px-1 py-0.5 text-gray-500 outline-none"
          >
            <option value="" className="bg-gray-800">Override…</option>
            <option value="__unassign" className="bg-gray-800 text-gray-200">Unassign</option>
            {members.filter((m) => m.id !== row.assigned_to).map((m) => (
              <option key={m.id} value={m.id} className="bg-gray-800 text-gray-200">
                Reassign to {m.id === userId ? 'me' : m.name || 'Unnamed user'}
              </option>
            ))}
          </select>
        )}
      </>
    )
  }

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

        <select
          value={assignFilter}
          onChange={(e) => setAssignFilter(e.target.value)}
          aria-label="Assignment"
          className={`rounded-md text-[11px] font-medium border px-2 py-1 outline-none bg-gray-800 ${
            assignFilter !== 'all' ? 'border-blue-500/40 text-blue-400' : 'border-gray-700 text-gray-400'
          }`}
        >
          <option value="all">All assignments</option>
          <option value="mine">Assigned to me ({counts.mine})</option>
          <option value="unassigned">Unassigned ({counts.unassigned})</option>
          <option value="others">Taken by others ({counts.others})</option>
        </select>

        {canAuthor && (
          <button
            onClick={addRow}
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
              {[['Topic', 'w-[13%]'], ['Scenario', 'w-[18%]'], ['Test Steps', 'w-[31%]'], ['Expected Result', 'w-[26%]'], ['RESULT', 'w-[12%]']].map(([label, w]) => (
                <th key={label} className={`${w} px-2 py-1.5 text-[11px] font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-700`}>
                  {label}
                </th>
              ))}
              <th className="w-14 py-1.5 border-b border-gray-700" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              // Repeat the Topic only when it changes, the way the sheet reads.
              const previous = filtered[i - 1]
              const newTopic = !previous || previous.topic !== row.topic
              const editing = row.id === editingId
              const locked = isLocked(row)
              const canUpdate = canAuthor && !locked
              return (
                <tr
                  key={row.id}
                  className={`align-top border-b border-gray-800/70 ${editing ? 'bg-blue-500/[0.06]' : 'hover:bg-gray-800/30'} ${newTopic ? 'border-t border-t-gray-700' : ''}`}
                >
                  <td className={`px-1 py-0.5 ${editing ? 'shadow-[inset_2px_0_0_0_#3b82f6]' : ''}`}>
                    {editing
                      ? editCell('topic', 'font-semibold', true)
                      : newTopic
                        ? readCell(row.topic, 'font-semibold text-white')
                        : <span className="block px-1.5 py-0.5 text-[12px] text-gray-600">↳</span>}
                  </td>
                  <td className="px-1 py-0.5">
                    {editing ? editCell('scenario') : readCell(row.scenario, 'text-gray-200')}
                  </td>
                  <td className="px-1 py-0.5">
                    {editing ? editCell('test_steps') : readCell(row.test_steps, 'text-gray-300')}
                  </td>
                  <td className="px-1 py-0.5">
                    {editing ? editCell('expected_result') : readCell(row.expected_result, 'text-gray-300')}
                  </td>
                  <td className="px-1.5 py-1">
                    <select
                      value={row.result || 'not_tested'}
                      onChange={(e) => setResult(row, e.target.value)}
                      disabled={!canUpdate}
                      title={locked ? `Assigned to ${assigneeName(row)} — only they or an Admin/Lead can update it` : undefined}
                      className={`w-full text-[11px] font-semibold rounded-md border px-1.5 py-0.5 outline-none disabled:cursor-not-allowed ${RESULT_CLASS[row.result] || RESULT_CLASS.not_tested}`}
                    >
                      {Object.entries(VMS_RESULT).map(([key, cfg]) => (
                        <option key={key} value={key} className="bg-gray-800 text-gray-200">{cfg.label}</option>
                      ))}
                    </select>
                    {REASON_RESULTS.includes(row.result) && (
                      canUpdate ? (
                        <button
                          onClick={() => setReasonFor({ row, status: row.result, existing: row.failure_comment || '' })}
                          title={row.failure_comment || ''}
                          className="mt-0.5 flex items-start gap-1 text-left text-[10px] text-gray-400 hover:text-gray-200 w-full"
                        >
                          <MessageSquareWarning size={11} className={`mt-px flex-shrink-0 ${REASON_ICON_CLASS[row.result]}`} />
                          <span className="line-clamp-2">{row.failure_comment || 'Add reason'}</span>
                        </button>
                      ) : (
                        <div title={row.failure_comment || ''} className="mt-0.5 flex items-start gap-1 text-[10px] text-gray-400 w-full">
                          <MessageSquareWarning size={11} className={`mt-px flex-shrink-0 ${REASON_ICON_CLASS[row.result]}`} />
                          <span className="line-clamp-2">{row.failure_comment || '—'}</span>
                        </div>
                      )
                    )}
                    {assignment(row)}
                  </td>
                  <td className="py-1 px-1">
                    <div className="flex items-center justify-center gap-0.5">
                      {editing ? (
                        <>
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            title="Save (Ctrl+Enter)"
                            className="p-1 rounded text-green-400 hover:bg-green-500/10 disabled:opacity-40"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            title="Cancel (Esc)"
                            className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 disabled:opacity-40"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        canUpdate && (
                          <button
                            onClick={() => startEdit(row)}
                            title="Edit row"
                            className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-500/10"
                          >
                            <Pencil size={12} />
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-gray-500">
                  {rows.length ? 'No rows match your filters.' : 'No rows yet — import from your sheet or add one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-500">
        Showing {filtered.length} of {rows.length} rows · {rows.length - counts.unassigned} assigned. Click the pencil on a row to edit it — Ctrl+Enter saves, Esc cancels.
      </p>

      <FailCommentModal
        open={Boolean(reasonFor)}
        onClose={() => setReasonFor(null)}
        row={reasonFor?.row}
        existing={reasonFor?.existing}
        status={reasonStatusRef.current}
        onConfirm={confirmReason}
      />
    </div>
  )
}
