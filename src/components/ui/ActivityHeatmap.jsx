// GitHub-style calendar grid of real per-day activity counts (audit-log
// status changes, test executions, bugs reported — never login/session
// data, which this app doesn't track). `days` must already be ordered
// oldest -> newest and padded so the first entry falls on a Sunday, so a
// plain grid-rows-7 flow produces correctly aligned week columns.
export default function ActivityHeatmap({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count))

  return (
    <div>
      <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: 'repeat(7, 11px)' }}>
        {days.map((d, i) => {
          const level = !d || d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max) * 4))
          return (
            <div
              key={d?.date || i}
              title={d ? `${d.date}: ${d.count} event${d.count === 1 ? '' : 's'}` : ''}
              className="w-[11px] h-[11px] rounded-[2px]"
              style={{
                backgroundColor: level === 0 ? 'var(--color-gray-750)' : 'var(--color-green-500)',
                opacity: level === 0 ? 1 : 0.3 + (level / 4) * 0.7,
              }}
            />
          )
        })}
      </div>
      <p className="text-[10px] text-gray-500 mt-2">
        Activity — days with recorded status changes, test executions, or bugs reported.
      </p>
    </div>
  )
}
