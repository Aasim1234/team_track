import { motion } from 'framer-motion'

const BAR_COLOR = {
  blue: 'fill-blue-500',
  red: 'fill-red-500',
  green: 'fill-green-500',
  orange: 'fill-orange-500',
  purple: 'fill-purple-500',
  gray: 'fill-gray-400',
}

// Minimal inline SVG bar chart for a daily time series — no charting
// dependency, matches the flat enterprise look used across the app.
export default function TrendChart({ data, color = 'blue', height = 120 }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const barWidth = 100 / data.length
  const fill = BAR_COLOR[color] || BAR_COLOR.blue

  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          const barHeight = (d.value / max) * (height - 18)
          return (
            <g key={i}>
              <motion.rect
                x={i * barWidth + barWidth * 0.15}
                y={height - 18 - barHeight}
                width={barWidth * 0.7}
                height={barHeight}
                rx="1"
                className={fill}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.4, delay: i * 0.02, ease: 'easeOut' }}
                style={{ transformOrigin: 'bottom' }}
                opacity={d.value === 0 ? 0.15 : 1}
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </motion.rect>
            </g>
          )
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1 px-0.5">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}
