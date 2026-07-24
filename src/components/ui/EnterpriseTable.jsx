import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

export default function EnterpriseTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectable = false,
  selected = [],
  onSelectionChange,
  bulkActions = [],
  sort,
  onSortChange,
  loading = false,
  emptyState,
}) {
  const selectedSet = new Set(selected)
  const allSelected = rows.length > 0 && rows.every((r) => selectedSet.has(rowKey(r)))

  const toggleAll = () => {
    if (!onSelectionChange) return
    onSelectionChange(allSelected ? [] : rows.map(rowKey))
  }

  const toggleRow = (key) => {
    if (!onSelectionChange) return
    onSelectionChange(selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }

  const handleSort = (col) => {
    if (!col.sortable || !onSortChange) return
    const direction = sort?.key === col.key && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ key: col.key, direction })
  }

  if (loading) {
    return (
      <div className="border border-gray-600 rounded-lg overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 border-b border-gray-100 last:border-0 bg-gray-700 animate-pulse" />
        ))}
      </div>
    )
  }

  if (rows.length === 0 && emptyState) {
    return emptyState
  }

  return (
    <div>
      {selectable && selected.length > 0 && bulkActions.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-[12px]">
          <span className="text-blue-700 font-medium">{selected.length} selected</span>
          <div className="flex items-center gap-1 ml-auto">
            {bulkActions.map((a) => (
              <button
                key={a.label}
                onClick={() => a.onClick(rows.filter((r) => selectedSet.has(rowKey(r))))}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium hover:bg-white ${
                  a.destructive ? 'text-red-600' : 'text-gray-600'
                }`}
              >
                {a.icon && <a.icon size={12} />}
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border border-gray-600 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-gray-700">
            <tr>
              {selectable && (
                <th className="w-9 px-3 py-2">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-blue-500" />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => handleSort(col)}
                  className={`text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${
                    col.sortable ? 'cursor-pointer select-none hover:text-gray-300' : ''
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable &&
                      (sort?.key === col.key ? (
                        sort.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      ) : (
                        <ChevronsUpDown size={12} className="text-gray-400" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={`border-t border-gray-100 ${onRowClick ? 'cursor-pointer hover:bg-gray-650' : ''}`}
                >
                  {selectable && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(key)}
                        onChange={() => toggleRow(key)}
                        className="accent-blue-500"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2 text-gray-300 align-middle">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
