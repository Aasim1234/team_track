import { Fragment } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight } from 'lucide-react'
import { scaleIn, fadeIn, TRANSITION } from '../../lib/motion'

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
  expandable = false,
  expandedKeys = [],
  onExpandedChange,
  expandedRowRender,
  // Opt-in only — defaults to false so existing tables are unaffected.
  // See the contained-scroll note below for why this is safe to enable
  // per-table rather than a page-level sticky header.
  stickyHeader = false,
  maxHeight = '60vh',
}) {
  const selectedSet = new Set(selected)
  const expandedSet = new Set(expandedKeys)
  const allSelected = rows.length > 0 && rows.every((r) => selectedSet.has(rowKey(r)))
  const columnCount = columns.length + (selectable ? 1 : 0) + (expandable ? 1 : 0)

  const toggleAll = () => {
    if (!onSelectionChange) return
    onSelectionChange(allSelected ? [] : rows.map(rowKey))
  }

  const toggleRow = (key) => {
    if (!onSelectionChange) return
    onSelectionChange(selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }

  const toggleExpanded = (key) => {
    if (!onExpandedChange) return
    onExpandedChange(expandedSet.has(key) ? expandedKeys.filter((k) => k !== key) : [...expandedKeys, key])
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
          <div key={i} className="h-10 border-b border-gray-750 last:border-0 bg-gray-700 animate-pulse" />
        ))}
      </div>
    )
  }

  if (rows.length === 0 && emptyState) {
    return emptyState
  }

  const theadClass = stickyHeader ? 'sticky top-0 z-10' : ''

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

      <div
        className={`border border-gray-600 rounded-lg overflow-x-auto ${stickyHeader ? 'overflow-y-auto overscroll-contain' : ''}`}
        style={stickyHeader ? { maxHeight } : undefined}
      >
        <table className="w-full text-[13px]">
          <thead className={theadClass}>
            <tr>
              {expandable && <th className={`bg-gray-700 w-8 px-2 py-2 ${theadClass}`} />}
              {selectable && (
                <th className={`bg-gray-700 w-9 px-3 py-2 ${theadClass}`}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-blue-500" />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => handleSort(col)}
                  className={`bg-gray-700 text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${theadClass} ${
                    col.sortable ? 'cursor-pointer select-none hover:text-gray-300' : ''
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={sort?.key === col.key ? sort.direction : 'none'}
                          variants={scaleIn}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          transition={TRANSITION}
                          className="inline-flex"
                        >
                          {sort?.key === col.key ? (
                            sort.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                          ) : (
                            <ChevronsUpDown size={12} className="text-gray-400" />
                          )}
                        </motion.span>
                      </AnimatePresence>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row)
              const isExpanded = expandedSet.has(key)
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => onRowClick?.(row)}
                    className={`group border-t border-gray-750 ${onRowClick ? 'cursor-pointer hover:bg-gray-650' : ''}`}
                  >
                    {expandable && (
                      <td className="px-2 py-2" onClick={(e) => { e.stopPropagation(); toggleExpanded(key) }}>
                        <button className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-gray-650">
                          <ChevronRight size={13} className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      </td>
                    )}
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
                      <td
                        key={col.key}
                        className={`px-3 py-2 text-gray-300 align-middle ${onRowClick ? 'transition-colors duration-150 group-hover:text-white' : ''}`}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                  {expandable && isExpanded && (
                    <tr className="border-t border-gray-750 bg-gray-750/40">
                      <td colSpan={columnCount} className="px-4 py-3">
                        <motion.div initial="initial" animate="animate" variants={fadeIn} transition={TRANSITION}>
                          {expandedRowRender?.(row)}
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
