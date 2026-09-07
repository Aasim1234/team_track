import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './ui/Modal'
import FormField, { inputClass } from './ui/FormField'

// A comment is "meaningful" only if something other than whitespace survives —
// the same rule the database CHECK constraint enforces, so the UI never lets
// through something the backend would reject.
export const hasMeaningfulComment = (value) => /[^\s]/.test(value || '')

export default function FailCommentModal({ open, onClose, row, existing, onConfirm }) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

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
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Failure Reason' : 'Fail Test Case'} size="lg">
      <form onSubmit={submit} className="space-y-3.5">
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-md bg-red-500/5 border border-red-500/20">
          <AlertTriangle size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] text-gray-300 font-medium truncate">{row?.scenario || 'Test case'}</p>
            {row?.topic && <p className="text-[11px] text-gray-500 truncate">{row.topic}</p>}
          </div>
        </div>

        <FormField label="Failure Comment / Reason" required>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            autoFocus
            placeholder="What failed, and under what conditions?"
            className={`${inputClass} resize-y`}
          />
        </FormField>

        {comment.length > 0 && !valid && (
          <p className="text-[11px] text-red-400">A reason is required — whitespace alone is not enough.</p>
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
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-red-500 hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-500"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Reason' : 'Mark as Failed'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
