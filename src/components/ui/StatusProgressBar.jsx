import { resolveStatus } from '../../lib/statusConfig'

export default function StatusProgressBar({ domain, counts, showLegend = false, height = 'h-2' }) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  return (
    <div>
      <div className={`w-full bg-gray-100 rounded-full overflow-hidden flex ${height}`}>
        {total === 0 ? (
          <div className="w-full h-full bg-gray-100" />
        ) : (
          entries.map(([key, count]) => {
            const s = resolveStatus(domain, key)
            return (
              <div
                key={key}
                className={s.bar}
                style={{ width: `${(count / total) * 100}%` }}
                title={`${s.label}: ${count}`}
              />
            )
          })
        )}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {entries.map(([key, count]) => {
            const s = resolveStatus(domain, key)
            return (
              <span key={key} className="flex items-center gap-1 text-[11px] text-gray-500">
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {s.label} <span className="text-gray-400">({count})</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
