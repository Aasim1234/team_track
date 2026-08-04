import { CheckSquare, Square } from 'lucide-react'
import { resolveStatus, TEST_RUN_RESULT } from '../lib/statusConfig'

export default function RunCaseRail({
  rows,
  caseById,
  activeRunCaseId,
  onSelect,
  canAuthor,
  runActive,
  selectMode,
  onToggleSelectMode,
  selected,
  onToggleSelected,
  bulkActions = [],
}) {
  return (
    <div className="w-72 flex-shrink-0 border-r border-gray-600 overflow-y-auto flex flex-col">
      <div className="px-3 py-2 border-b border-gray-600 flex items-center justify-between flex-shrink-0">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{rows.length} cases</p>
        {canAuthor && runActive && (
          <button onClick={onToggleSelectMode} className="text-[11px] text-blue-500 hover:text-blue-400 font-medium">
            {selectMode ? 'Done' : 'Select'}
          </button>
        )}
      </div>

      {selectMode && selected.length > 0 && (
        <div className="px-3 py-1.5 border-b border-gray-600 flex items-center gap-2 bg-blue-50 flex-shrink-0">
          <span className="text-[11px] text-blue-700 font-medium">{selected.length} selected</span>
          <div className="flex items-center gap-1 ml-auto">
            {bulkActions.map((a) => (
              <button
                key={a.label}
                onClick={() => a.onClick(selected)}
                className={`text-[11px] font-medium px-1.5 py-0.5 rounded hover:bg-white ${a.destructive ? 'text-red-600' : 'text-gray-600'}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {rows.map((r) => {
          const tc = caseById[r.test_case_id]
          const active = r.run_case_id === activeRunCaseId
          const isSelected = selected.includes(r.run_case_id)
          return (
            <button
              key={r.run_case_id}
              onClick={() => (selectMode ? onToggleSelected(r.run_case_id) : onSelect(r.run_case_id))}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left border-b border-gray-750 ${active ? 'bg-gray-650' : 'hover:bg-gray-650'}`}
            >
              {selectMode ? (
                isSelected ? <CheckSquare size={14} className="text-blue-500 flex-shrink-0" /> : <Square size={14} className="text-gray-500 flex-shrink-0" />
              ) : (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${resolveStatus(TEST_RUN_RESULT, r.current_status).dot}`} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono text-gray-500">{tc?.human_id}</p>
                <p className="text-[12px] text-white truncate">{tc?.title || 'Unknown case'}</p>
              </div>
            </button>
          )
        })}
        {rows.length === 0 && <p className="text-[12px] text-gray-500 p-3">No test cases in this run.</p>}
      </div>
    </div>
  )
}
