import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Modal from './ui/Modal'
import FormField, { inputClass } from './ui/FormField'
import PrimaryButton from './ui/Button'
import { useToast } from './ui/Toast'
import { formatCaseId } from '../lib/testCaseId'

const PREVIEW_LIMIT = 8

// Assigns every selected test case to one person in a single database
// operation (bulk_assign_test_cases), which checks the same permissions as a
// single assignment and turns each test case into its own To-Do task.
export default function BulkAssignModal({ open, onClose, rows, members, userId, onAssigned }) {
  const toast = useToast()
  const [assignee, setAssignee] = useState('')
  const [reassign, setReassign] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setAssignee('')
      setReassign(false)
      setSaving(false)
    }
  }, [open])

  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'another user'
  const assigneeName = assignee ? nameOf(assignee) : ''

  const { free, same, taken } = useMemo(() => {
    const groups = { free: [], same: [], taken: [] }
    for (const row of rows) {
      if (!row.assigned_to) groups.free.push(row)
      else if (assignee && row.assigned_to === assignee) groups.same.push(row)
      else groups.taken.push(row)
    }
    return groups
  }, [rows, assignee])

  const willAssign = free.length + (reassign ? taken.length : 0)
  const plural = (n) => (n === 1 ? '' : 's')

  const submit = async (e) => {
    e.preventDefault()
    if (!assignee || willAssign === 0 || saving) return
    if (reassign && taken.length > 0 &&
        !confirm(`${taken.length} of these test case${plural(taken.length)} ${taken.length === 1 ? 'is' : 'are'} already assigned to someone else. Change ${taken.length === 1 ? 'that assignment' : 'those assignments'} to ${assigneeName}?`)) {
      return
    }

    setSaving(true)
    const { data, error } = await supabase.rpc('bulk_assign_test_cases', {
      p_row_ids: rows.map((r) => r.id),
      p_assignee: assignee,
      p_include_assigned: reassign,
    })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    const done = (data?.assigned || 0) + (data?.reassigned || 0)
    const notes = [
      data?.skipped ? `${data.skipped} already assigned to someone else ${data.skipped === 1 ? 'was' : 'were'} left unchanged` : null,
      data?.unchanged ? `${data.unchanged} ${data.unchanged === 1 ? 'was' : 'were'} already assigned to ${data.assignee}` : null,
    ].filter(Boolean)
    toast.success(
      `${done} test case${plural(done)} assigned successfully to ${data?.assignee || assigneeName}.` +
      (notes.length ? ` ${notes.join('; ')}.` : ''))
    onAssigned()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Assign ${rows.length} Test Case${plural(rows.length)}`} size="lg">
      <form onSubmit={submit} className="space-y-3.5">
        <FormField label="Assign to" required>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} required autoFocus className={inputClass}>
            <option value="">Choose a person…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name || 'Unnamed user'}{m.id === userId ? ' (you)' : ''}</option>
            ))}
          </select>
        </FormField>

        <div className="rounded-md border border-gray-700 divide-y divide-gray-700 text-[12px]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-gray-300">Unassigned — will be assigned</span>
            <span className="font-semibold text-white tabular-nums">{free.length}</span>
          </div>
          {assignee && same.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-gray-300">Already assigned to {assigneeName} — no change</span>
              <span className="font-semibold text-white tabular-nums">{same.length}</span>
            </div>
          )}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-gray-300">Already assigned to someone else</span>
            <span className={`font-semibold tabular-nums ${taken.length ? 'text-amber-500' : 'text-white'}`}>{taken.length}</span>
          </div>
        </div>

        {taken.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-2">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-500">
              <AlertTriangle size={13} /> {taken.length} selected test case{plural(taken.length)} already {taken.length === 1 ? 'has' : 'have'} an assignee
            </p>
            <ul className="space-y-0.5 text-[11px] text-gray-400">
              {taken.slice(0, PREVIEW_LIMIT).map((r) => (
                <li key={r.id} className="truncate">
                  <span className="font-mono text-blue-500 mr-1.5">{formatCaseId(r.case_number)}</span>
                  {r.scenario || r.topic || 'Untitled test case'}
                  <span className="text-gray-500"> — assigned to {nameOf(r.assigned_to)}</span>
                </li>
              ))}
              {taken.length > PREVIEW_LIMIT && <li className="text-gray-500">+{taken.length - PREVIEW_LIMIT} more</li>}
            </ul>
            <div className="space-y-1 pt-1">
              <label className="flex items-center gap-2 text-[12px] text-gray-300 cursor-pointer">
                <input type="radio" name="reassign" checked={!reassign} onChange={() => setReassign(false)} className="accent-blue-500" />
                Leave these as they are
              </label>
              <label className="flex items-center gap-2 text-[12px] text-gray-300 cursor-pointer">
                <input type="radio" name="reassign" checked={reassign} onChange={() => setReassign(true)} className="accent-blue-500" />
                Reassign them to {assigneeName || 'the chosen person'}
              </label>
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-500">
          Each assigned test case becomes its own task in {assigneeName ? `${assigneeName}'s` : 'the assignee’s'} To-Do.
        </p>

        <PrimaryButton type="submit" disabled={!assignee || willAssign === 0 || saving}>
          {saving ? 'Assigning…' : `Assign ${willAssign} Test Case${plural(willAssign)}`}
        </PrimaryButton>
      </form>
    </Modal>
  )
}
