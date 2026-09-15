import { AlertTriangle, Trash2 } from 'lucide-react'
import Modal from './ui/Modal'

// Confirms deleting a user's account. Only Admins can do it, and the database
// refuses (with a reason) when the user is an Admin, still has test cases
// assigned, or is still recorded as the creator of other records.
export default function DeleteUserModal({ target, roleName, deleting, onCancel, onConfirm }) {
  return (
    <Modal
      open={Boolean(target)}
      onClose={deleting ? () => {} : onCancel}
      title="Delete User"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-300 border border-gray-600 hover:bg-gray-700/50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-red-500 hover:bg-red-400 disabled:opacity-40"
          >
            <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Delete User'}
          </button>
        </>
      }
    >
      {target && (
        <div className="space-y-3">
          <p className="text-[13px] text-gray-300">Are you sure you want to delete this user?</p>
          <div className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2.5">
            <p className="text-[13px] font-semibold text-white">{target.name || target.email}</p>
            <p className="text-[12px] text-gray-400">{target.email}{roleName ? ` · ${roleName}` : ''}</p>
          </div>
          <p className="flex items-start gap-1.5 text-[12px] text-red-500">
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              This permanently deletes their account and removes their project access and group memberships.
              They won't be able to sign in. It can't be undone.
            </span>
          </p>
          <p className="text-[11px] text-gray-500">Their past actions stay in the Activity Log.</p>
        </div>
      )}
    </Modal>
  )
}
