import { motion } from 'framer-motion'
import { resolveStatus } from '../../lib/statusConfig'

export default function StatusProgressBar({ domain, counts, showLegend = false, height = 'h-2' }) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  return (
    <div>
      <div className={`w-full bg-gray-750 rounded-full overflow-hidden flex ${height}`}>
        {total === 0 ? (
          <div className="w-full h-full bg-gray-750" />
        ) : (
          entries.map(([key, count]) => {
            const s = resolveStatus(domain, key)
            const pct = (count / total) * 100
            return (
              <motion.div
                key={key}
                className={s.bar}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
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
