import { AlertTriangle, Trash2 } from 'lucide-react'
import Modal from './ui/Modal'
import { formatCaseId } from '../lib/testCaseId'

// Confirms deleting one test case. The database only allows it for roles with
// Delete Test Case, and records it in the activity log.
export default function DeleteTestCaseModal({ open, testCase, assigneeName, deleting, onCancel, onConfirm }) {
  return (
    <Modal
      open={open}
      onClose={deleting ? () => {} : onCancel}
      title="Delete Test Case"
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
            <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </>
      }
    >
      {testCase && (
        <div className="space-y-3">
          <p className="text-[13px] text-gray-300">Are you sure you want to delete this test case?</p>
          <div className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2.5">
            <p className="text-[11px] font-mono text-blue-500">{formatCaseId(testCase.case_number)}</p>
            <p className="text-[13px] font-semibold text-white">{testCase.scenario || testCase.topic || 'Untitled test case'}</p>
            {testCase.scenario && testCase.topic && <p className="text-[11px] text-gray-500">{testCase.topic}</p>}
          </div>
          <p className="flex items-start gap-1.5 text-[12px] text-red-500">
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              This permanently removes the test case and its result
              {assigneeName ? `, and removes the task from ${assigneeName}'s To-Do` : ''}. It can't be undone.
            </span>
          </p>
        </div>
      )}
    </Modal>
  )
}
