import { useState, useEffect } from 'react'
import { AlertTriangle, Ban } from 'lucide-react'
import Modal from './ui/Modal'
import FormField, { inputClass } from './ui/FormField'

// A comment is "meaningful" only if something other than whitespace survives —
// the same rule the database enforces, so the UI never lets through something
// the backend would reject.
export const hasMeaningfulComment = (value) => /[^\s]/.test(value || '')

// Fail and Blocked both need a reason before they are recorded.
const KINDS = {
  fail: {
    title: 'Fail Test Case',
    editTitle: 'Edit Failure Reason',
    label: 'Failure Comment / Reason',
    placeholder: 'What failed, and under what conditions?',
    confirm: 'Mark as Failed',
    icon: AlertTriangle,
    banner: 'bg-red-500/5 border-red-500/20',
    iconClass: 'text-red-400',
    button: 'bg-red-500 hover:bg-red-400 disabled:hover:bg-red-500',
    hint: 'text-red-400',
  },
  blocked: {
    title: 'Blocked Test Case',
    editTitle: 'Edit Block Reason',
    label: 'Block Reason / Comment',
    placeholder: 'What is blocking this test, and what is needed to unblock it?',
    confirm: 'Mark as Blocked',
    icon: Ban,
    banner: 'bg-orange-500/5 border-orange-500/20',
    iconClass: 'text-orange-400',
    button: 'bg-orange-500 hover:bg-orange-400 disabled:hover:bg-orange-500',
    hint: 'text-orange-400',
  },
}

export default function FailCommentModal({ open, onClose, row, existing, onConfirm, status = 'fail' }) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const kind = KINDS[status] || KINDS.fail
  const Icon = kind.icon

  useEffect(() => {
    if (open) {
      setComment(existing || '')
      setSaving(false)
    }
  }, [open, existing])

  const valid = hasMeaningfulComment(comment)
  const isEdit = Boolean(existing)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const ok = await onConfirm(comment.trim())
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? kind.editTitle : kind.title} size="lg">
      <form onSubmit={submit} className="space-y-3.5">
        <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-md border ${kind.banner}`}>
          <Icon size={15} className={`${kind.iconClass} mt-0.5 flex-shrink-0`} />
          <div className="min-w-0">
            <p className="text-[12px] text-gray-300 font-medium truncate">{row?.scenario || 'Test case'}</p>
            {row?.topic && <p className="text-[11px] text-gray-500 truncate">{row.topic}</p>}
          </div>
        </div>

        <FormField label={kind.label} required>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            autoFocus
            placeholder={kind.placeholder}
            className={`${inputClass} resize-y`}
          />
        </FormField>

        {comment.length > 0 && !valid && (
          <p className={`text-[11px] ${kind.hint}`}>A reason is required — whitespace alone is not enough.</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-300 border border-gray-600 hover:bg-gray-700/50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed ${kind.button}`}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Reason' : kind.confirm}
          </button>
        </div>
      </form>
    </Modal>
  )
}
