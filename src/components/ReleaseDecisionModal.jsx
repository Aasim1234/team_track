import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Modal from './ui/Modal'
import { inputClass } from './ui/FormField'
import { useToast } from './ui/Toast'
import { formatPercent } from '../lib/testMetrics'

// Pass needs an explicit confirmation; Discard can't be saved without a reason.
// The database enforces both (record_release_decision + a table constraint)
// and keeps every decision in the release's history.
export default function ReleaseDecisionModal({ open, release, summary, onClose, onSaved }) {
  const toast = useToast()
  const [decision, setDecision] = useState('')
  const [reason, setReason] = useState('')
  const [confirmPass, setConfirmPass] = useState(false)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDecision(release?.decision || '')
      setReason(release?.discard_reason || '')
      setConfirmPass(false)
      setTouched(false)
      setSaving(false)
    }
  }, [open, release])

  const reasonMissing = decision === 'discard' && !reason.trim()
  const valid = decision === 'pass' ? confirmPass : decision === 'discard' ? !reasonMissing : false
  const unchanged = decision === release?.decision && (decision !== 'discard' || reason.trim() === (release?.discard_reason || ''))

  const save = async () => {
    setTouched(true)
    if (!valid || saving || !release) return
    setSaving(true)
    const { error } = await supabase.rpc('record_release_decision', {
      p_release_id: release.id,
      p_decision: decision,
      p_reason: decision === 'discard' ? reason.trim() : null,
    })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(decision === 'pass' ? `Release ${release.name} marked Pass` : `Release ${release.name} marked Discard`)
    onSaved()
  }

  const option = (value, Icon, title, text, tone) => (
    <button
      type="button"
      onClick={() => setDecision(value)}
      aria-pressed={decision === value}
      className={`flex-1 text-left rounded-md border px-3 py-2.5 transition-colors ${
        decision === value ? tone : 'border-gray-600 hover:border-gray-500'
      }`}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
        <Icon size={15} className={value === 'pass' ? 'text-green-500' : 'text-red-500'} /> {title}
      </span>
      <span className="block text-[11px] text-gray-400 mt-0.5">{text}</span>
    </button>
  )

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={release?.decision ? 'Change Release Decision' : 'Release Decision'}
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
            disabled={saving || !valid || unchanged}
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold text-white disabled:opacity-40 ${
              decision === 'discard' ? 'bg-red-500 hover:bg-red-400' : 'bg-green-600 hover:bg-green-500'
            }`}
          >
            {saving ? 'Saving…' : decision === 'discard' ? 'Save Discard Decision' : 'Save Pass Decision'}
          </button>
        </>
      }
    >
      {release && (
        <div className="space-y-3.5">
          <div className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-[12px]">
            <p className="text-white font-semibold">Release {release.name}</p>
            {summary && (
              <p className="text-gray-400 mt-0.5">
                {summary.total_cases} test cases · {summary.pass} passed · {summary.fail} failed · {summary.blocked} blocked · {formatPercent(Number(summary.pass_rate))} pass rate
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {option('pass', CheckCircle2, 'Pass', 'Testing is complete and this release is approved.', 'border-green-500/50 bg-green-500/10')}
            {option('discard', XCircle, 'Discard', 'This release is rejected. A reason is required.', 'border-red-500/50 bg-red-500/10')}
          </div>

          {decision === 'pass' && (
            <label className="flex items-start gap-2 px-3 py-2.5 rounded-md border border-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmPass}
                onChange={(e) => setConfirmPass(e.target.checked)}
                className="mt-0.5 accent-green-600"
              />
              <span className="text-[12px] text-gray-300">
                I confirm release <span className="font-semibold text-white">{release.name}</span> has passed testing.
              </span>
            </label>
          )}

          {decision === 'discard' && (
            <div>
              <label htmlFor="discard-reason" className="block text-[12px] font-semibold text-gray-300 mb-1">
                Discard Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="discard-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                rows={3}
                autoFocus
                placeholder="e.g. Critical recording issue found in Live View Client."
                className={`${inputClass} resize-y ${touched && reasonMissing ? 'border-red-500' : ''}`}
              />
              {touched && reasonMissing && (
                <p className="text-[11px] text-red-500 mt-1">Enter the reason for discarding this release.</p>
              )}
              <p className="text-[11px] text-gray-500 mt-1">The reason is saved permanently and shown in Release History and the Release Report.</p>
            </div>
          )}

          {decision === 'pass' && release.decision === 'discard' && (
            <p className="text-[11px] text-gray-500">The earlier Discard decision and its reason stay in this release's decision history.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
