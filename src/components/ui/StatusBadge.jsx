import { resolveStatus } from '../../lib/statusConfig'

export default function StatusBadge({ domain, value, size = 'md', dot = false }) {
  const s = resolveStatus(domain, value)
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-medium border ${s.bg} ${s.text} ${s.border} ${sizeClass}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />}
      {s.label}
    </span>
  )
}
