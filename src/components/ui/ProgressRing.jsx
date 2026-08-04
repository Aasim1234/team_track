import { motion } from 'framer-motion'

export default function ProgressRing({ percent, size = 40, strokeColor = 'stroke-green-500', trackColor = 'stroke-gray-600', label }) {
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, percent || 0))
  const target = c - (clamped / 100) * c

  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackColor} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: target }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={strokeColor}
        />
      </svg>
      {label && (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white">
          {label}
        </span>
      )}
    </div>
  )
}
