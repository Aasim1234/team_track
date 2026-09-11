import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import BentoCard from '../ui/BentoCard'

// Colour roles live in index.css (--viz-*) so light and dark swap in one place.
// Test statuses MEAN good/bad, so they wear the status palette rather than
// categorical series colours, and never appear without a text label beside
// them — legend, tooltip and table view all carry the same numbers.
export const STATUS_SERIES = [
  { key: 'passed', label: 'Passed', color: 'var(--viz-pass)' },
  { key: 'failed', label: 'Failed', color: 'var(--viz-fail)' },
  { key: 'blocked', label: 'Blocked', color: 'var(--viz-blocked)' },
  { key: 'retest', label: 'Retest', color: 'var(--viz-retest)' },
  { key: 'skipped', label: 'Skipped', color: 'var(--viz-skipped)' },
  { key: 'untested', label: 'Untested', color: 'var(--viz-untested)' },
]

// Automation stages are ordered, so they take a one-hue ramp (validated with
// the dataviz --ordinal checks against both card surfaces) instead of hues.
export const AUTOMATION_SERIES = [
  { key: 'not_automated', label: 'Not automated', color: 'var(--viz-auto-1)' },
  { key: 'planned', label: 'Planned', color: 'var(--viz-auto-2)' },
  { key: 'in_progress', label: 'In progress', color: 'var(--viz-auto-3)' },
  { key: 'automated', label: 'Automated', color: 'var(--viz-auto-4)' },
]

export const fmt = (n) => (n ?? 0).toLocaleString()

export function pctLabel(part, whole) {
  if (!whole) return '0%'
  const p = (part / whole) * 100
  if (p > 0 && p < 0.1) return '<0.1%'
  return `${p.toFixed(1)}%`
}

// Card chrome for every chart: title, subtitle, and a Chart/Table toggle. The
// table is the accessible twin of the chart — same numbers, no colour needed.
export function ChartCard({ title, subtitle, className = '', table, children }) {
  const [view, setView] = useState('chart')
  return (
    <BentoCard noHover className={`p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-[12px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {table && (
          <div role="tablist" aria-label={`${title} view`} className="flex p-0.5 rounded-md bg-gray-700 border border-gray-600 flex-shrink-0">
            {['chart', 'table'].map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded ${
                  view === v ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {v === 'chart' ? 'Chart' : 'Table'}
              </button>
            ))}
          </div>
        )}
      </div>
      {view === 'table' && table ? table : children}
    </BentoCard>
  )
}

// Legend mirrors the mark: a small rounded rect for bars. Only series that
// actually occur are listed; colours never shift, because they follow the key.
export function Legend({ series, totals }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {series
        .filter((s) => !totals || totals[s.key] > 0)
        .map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[12px] text-gray-400">
            <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
    </div>
  )
}

// One tooltip lists every status for the row, value first; the hovered
// segment stays full-strength while the others step back.
function Tooltip({ tip, series }) {
  if (!tip) return null
  const { x, y, row, focusKey, flip } = tip
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 min-w-[190px] max-w-[260px] rounded-lg border border-gray-600 bg-gray-800 shadow-xl px-3 py-2"
      style={{ left: x, top: y, transform: `translate(${flip ? 'calc(-100% - 14px)' : '14px'}, -50%)` }}
    >
      <p className="text-[11px] text-gray-400 mb-1.5 truncate">{row.label}</p>
      <div className="space-y-1">
        {series
          .filter((s) => row.counts[s.key] > 0)
          .map((s) => (
            <div key={s.key} className={`flex items-center gap-2 text-[12px] ${focusKey && focusKey !== s.key ? 'opacity-50' : ''}`}>
              <span className="w-3 h-[2px] rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-white font-semibold tabular-nums">{fmt(row.counts[s.key])}</span>
              <span className="text-gray-400 flex-1">{s.label}</span>
              <span className="text-gray-500 tabular-nums">{pctLabel(row.counts[s.key], row.total)}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

// Horizontal 100% stacked bars — the part-to-whole form for many or
// long-named categories. Marks are 12px thick with a 2px surface gap between
// segments and a 4px rounded data-end; each segment's hover area is the full
// 24px row height, not just the painted pixels.
export function StackedBars({ rows, series, valueLabel, headers, compact = false }) {
  const wrapRef = useRef(null)
  const [tip, setTip] = useState(null)

  const tipAt = (clientX, clientY, row, focusKey) => {
    const box = wrapRef.current.getBoundingClientRect()
    const x = clientX - box.left
    setTip({ x, y: clientY - box.top, row, focusKey, flip: x > box.width - 250 })
  }

  const tipAtElement = (el, row) => {
    const box = wrapRef.current.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    const x = b.left - box.left + b.width * 0.6
    setTip({ x, y: b.top - box.top + b.height / 2, row, focusKey: null, flip: x > box.width - 250 })
  }

  const bar = (row, i) => {
    const present = series.filter((s) => row.counts[s.key] > 0)
    return (
      <motion.div
        tabIndex={0}
        role="img"
        aria-label={`${row.label}: ${present.map((s) => `${row.counts[s.key]} ${s.label}`).join(', ') || 'no data'}`}
        onFocus={(e) => tipAtElement(e.currentTarget, row)}
        onBlur={() => setTip(null)}
        className="flex gap-[2px] h-6 items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, delay: Math.min(i * 0.03, 0.4), ease: 'easeOut' }}
        style={{ transformOrigin: 'left' }}
      >
        {present.length === 0 ? (
          <div className="h-3 flex-1 rounded-r-[4px]" style={{ background: 'var(--viz-untested)' }} />
        ) : (
          present.map((s, idx) => (
            <div
              key={s.key}
              onPointerMove={(e) => tipAt(e.clientX, e.clientY, row, s.key)}
              className="h-full flex items-center group"
              style={{ flexGrow: row.counts[s.key], flexBasis: 0, minWidth: 3 }}
            >
              <div
                className={`h-3 w-full transition-[filter] duration-150 group-hover:brightness-110 ${idx === present.length - 1 ? 'rounded-r-[4px]' : ''}`}
                style={{ background: s.color }}
              />
            </div>
          ))
        )}
      </motion.div>
    )
  }

  return (
    <div ref={wrapRef} className="relative" onPointerLeave={() => setTip(null)}>
      {compact ? (
        rows.map((row, i) => <div key={row.id}>{bar(row, i)}</div>)
      ) : (
        <>
          {headers && (
            <div className="grid grid-cols-[minmax(0,34%)_1fr_104px] gap-3 mb-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              <span>{headers[0]}</span>
              <span />
              <span className="text-right">{headers[1]}</span>
            </div>
          )}
          <div className="space-y-1">
            {rows.map((row, i) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,34%)_1fr_104px] items-center gap-3">
                <span className="text-[12px] text-gray-300 truncate" title={row.label}>{row.label}</span>
                {bar(row, i)}
                <span className="text-[12px] text-right whitespace-nowrap tabular-nums">{valueLabel(row)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <Tooltip tip={tip} series={series} />
    </div>
  )
}

// Part-to-whole at a glance (<= 6 segments). Segments are separated by a 2px
// surface gap; hovering or focusing a status swaps the centre readout to it.
export function Donut({ series, counts, active, onActive, size = 196, thickness = 22, centerValue, centerLabel }) {
  const present = series.filter((s) => counts[s.key] > 0)
  const total = present.reduce((sum, s) => sum + counts[s.key], 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const gap = present.length > 1 ? 2 : 0
  let cursor = 0
  const current = present.find((s) => s.key === active)

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={present.map((s) => `${s.label} ${counts[s.key]}`).join(', ')}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-gray-750" />
        {present.map((s, idx) => {
          const len = (counts[s.key] / total) * c
          const visible = Math.max(len - gap, 1)
          const offset = -cursor
          cursor += len
          const isActive = active === s.key
          return (
            <motion.circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeDashoffset={offset}
              initial={{ strokeDasharray: `0 ${c}` }}
              animate={{ strokeDasharray: `${visible} ${c - visible}` }}
              transition={{ duration: 0.6, delay: idx * 0.08, ease: 'easeOut' }}
              style={{
                strokeWidth: isActive ? thickness + 5 : thickness,
                opacity: active && !isActive ? 0.45 : 1,
                transition: 'stroke-width 150ms, opacity 150ms',
              }}
              onPointerEnter={() => onActive?.(s.key)}
              onPointerLeave={() => onActive?.(null)}
            >
              <title>{`${s.label}: ${fmt(counts[s.key])} (${pctLabel(counts[s.key], total)})`}</title>
            </motion.circle>
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
        {current ? (
          <>
            <span className="text-[28px] font-bold text-white leading-none">{fmt(counts[current.key])}</span>
            <span className="text-[12px] text-gray-400 mt-1">{current.label}</span>
            <span className="text-[11px] text-gray-500 tabular-nums">{pctLabel(counts[current.key], total)}</span>
          </>
        ) : (
          <>
            <span className="text-[28px] font-bold text-white leading-none">{centerValue}</span>
            <span className="text-[12px] text-gray-400 mt-1">{centerLabel}</span>
          </>
        )}
      </div>
    </div>
  )
}

export function DataTable({ rows, series, firstColumn }) {
  const present = series.filter((s) => rows.some((r) => r.counts[s.key] > 0))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-gray-500 text-left">
            <th className="font-medium py-1.5 pr-2">{firstColumn}</th>
            {present.map((s) => (
              <th key={s.key} className="font-medium py-1.5 px-2 text-right whitespace-nowrap">{s.label}</th>
            ))}
            <th className="font-medium py-1.5 pl-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-750">
              <td className="py-1.5 pr-2 text-gray-300 max-w-[280px] truncate" title={r.label}>{r.label}</td>
              {present.map((s) => (
                <td key={s.key} className="py-1.5 px-2 text-right tabular-nums text-gray-300">{fmt(r.counts[s.key] || 0)}</td>
              ))}
              <td className="py-1.5 pl-2 text-right tabular-nums text-white font-medium">{fmt(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
