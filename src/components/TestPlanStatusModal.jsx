import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Modal from './ui/Modal'
import { inputClass } from './ui/FormField'
import { useToast } from './ui/Toast'
import { TEST_PLAN_STATUS } from '../lib/statusConfig'

// Pass and Discard finish a test plan's release: the database saves its release
// report to Reports. Moving back to Active / Under Testing for the same release
// removes that report again.
export const FINAL_STATUSES = ['pass', 'discard']

export const statusChangeNeedsConfirm = (from, to) =>
  FINAL_STATUSES.includes(to) || FINAL_STATUSES.includes(from)

export default function TestPlanStatusModal({ plan, status, onClose, onSaved }) {
  const toast = useToast()
  const open = Boolean(plan && status)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setReason(status === 'discard' ? plan.discard_reason || '' : '')
      setTouched(false)
      setSaving(false)
    }
  }, [open, status, plan])

  if (!open) return <Modal open={false} onClose={onClose} />

  const release = plan.release?.name
  const editingReason = status === 'discard' && plan.status === 'discard'
  const reasonMissing = status === 'discard' && !reason.trim()
  const label = TEST_PLAN_STATUS[status]?.label

  const save = async () => {
    setTouched(true)
    if (reasonMissing || saving) return
    setSaving(true)
    const { data, error } = await supabase
      .from('test_plans')
      .update({ status, discard_reason: status === 'discard' ? reason.trim() : null })
      .eq('id', plan.id)
      .select('id')
    setSaving(false)
    if (error || !data?.length) {
      toast.error(error?.message || "You don't have permission to change this test plan's status.")
      return
    }
    toast.success(
      editingReason ? 'Discard reason updated'
        : FINAL_STATUSES.includes(status) ? `${plan.name} marked ${label} — release report saved to Reports`
          : `${plan.name} is now ${label}`)
    onSaved()
  }

  const title = editingReason ? 'Edit Discard Reason' : status === 'pass' ? 'Mark as Pass' : status === 'discard' ? 'Discard Test Plan' : 'Change Status'
  const buttonClass = status === 'discard' ? 'bg-red-500 hover:bg-red-400' : status === 'pass' ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-500 hover:bg-blue-400'

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-300 border border-gray-600 hover:bg-gray-700/50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || reasonMissing}
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold text-white disabled:opacity-40 ${buttonClass}`}
          >
            {saving ? 'Saving…' : editingReason ? 'Save Reason' : status === 'pass' ? 'Mark as Pass' : status === 'discard' ? 'Discard' : 'Change Status'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] text-gray-300">
        <div className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-[12px]">
          <p className="text-white font-semibold">{plan.name}</p>
          <p className="text-gray-400">Release Version {release || '—'} · currently {TEST_PLAN_STATUS[plan.status]?.label}</p>
        </div>

        {FINAL_STATUSES.includes(status) && !editingReason && (
          <p>
            Its release report — every test case with its current result and fail/block comment — will be saved to
            <span className="text-white font-medium"> Reports → Release Reports</span> for release {release}.
          </p>
        )}
        {!FINAL_STATUSES.includes(status) && (
          <p>
            Release {release}'s report for this plan will be removed from Reports until the plan is marked Pass or Discard again.
          </p>
        )}

        {status === 'discard' && (
          <div>
            <label htmlFor="plan-discard-reason" className="block text-[12px] font-semibold text-gray-300 mb-1">
              Discard Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="plan-discard-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              rows={3}
              autoFocus
              placeholder="e.g. Critical issue found in Live View Client."
              className={`${inputClass} resize-y ${touched && reasonMissing ? 'border-red-500' : ''}`}
            />
            {touched && reasonMissing && (
              <p className="text-[11px] text-red-500 mt-1">Enter the reason for discarding this test plan.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
