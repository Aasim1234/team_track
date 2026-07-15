import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const DAY_MS = 24 * 60 * 60 * 1000

const SPRINT_COLORS = {
  planned: 'bg-blue-500/70',
  active: 'bg-green-500/70',
  completed: 'bg-gray-500/70',
}

function monthsBetween(start, end) {
  const months = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor <= end) {
    months.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

export default function ProjectTimeline({ projectId }) {
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSprints = async () => {
      const { data } = await supabase
        .from('sprints')
        .select('*')
        .eq('project_id', projectId)
        .order('start_date')
      setSprints(data || [])
      setLoading(false)
    }
    fetchSprints()
  }, [projectId])

  if (loading) return <div className="p-6 text-gray-500 text-sm">Loading timeline...</div>

  if (sprints.length === 0) {
    return (
      <div className="p-6">
        <p className="text-gray-500 text-sm">
          No sprints yet — create one from the sprint bar on the Board tab to see it here.
        </p>
      </div>
    )
  }

  const dates = sprints.flatMap((s) => [new Date(s.start_date), new Date(s.end_date)])
  const rangeStart = new Date(Math.min(...dates).getFullYear(), Math.min(...dates).getMonth(), 1)
  const rawEnd = new Date(Math.max(...dates))
  const rangeEnd = new Date(rawEnd.getFullYear(), rawEnd.getMonth() + 1, 0)
  const totalDays = (rangeEnd - rangeStart) / DAY_MS
  const months = monthsBetween(rangeStart, rangeEnd)
  const today = new Date()
  const todayPct =
    today >= rangeStart && today <= rangeEnd
      ? ((today - rangeStart) / DAY_MS / totalDays) * 100
      : null

  const barStyle = (sprint) => {
    const start = (new Date(sprint.start_date) - rangeStart) / DAY_MS
    const days = (new Date(sprint.end_date) - new Date(sprint.start_date)) / DAY_MS + 1
    return {
      left: `${(start / totalDays) * 100}%`,
      width: `${Math.max((days / totalDays) * 100, 2)}%`,
    }
  }

  return (
    <div className="p-6">
      <div className="bg-gray-800 rounded-lg p-5 overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Month header */}
          <div className="flex border-b border-gray-700 pb-1 mb-2 ml-40">
            {months.map((m) => (
              <div
                key={m.toISOString()}
                className="text-xs text-gray-400"
                style={{
                  width: `${
                    (new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate() / totalDays) * 100
                  }%`,
                }}
              >
                {m.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
              </div>
            ))}
          </div>

          {/* One row per sprint */}
          {sprints.map((s) => (
            <div key={s.id} className="flex items-center mb-2">
              <div className="w-40 flex-shrink-0 pr-3">
                <span className="text-sm truncate block">{s.name}</span>
              </div>
              <div className="relative flex-1 h-8 bg-gray-900/60 rounded">
                {todayPct !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400/70"
                    style={{ left: `${todayPct}%` }}
                  />
                )}
                <div
                  title={`${s.name}: ${s.start_date} → ${s.end_date} (${s.status})`}
                  className={`absolute top-1 bottom-1 rounded px-1.5 text-[11px] leading-6 truncate ${
                    SPRINT_COLORS[s.status] || 'bg-blue-500/70'
                  }`}
                  style={barStyle(s)}
                >
                  {s.start_date} → {s.end_date}
                </div>
              </div>
            </div>
          ))}

          <div className="flex gap-4 mt-4 text-xs text-gray-400 ml-40">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-500/70" /> Planned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-green-500/70" /> Active
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-gray-500/70" /> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-px h-3 bg-red-400/70" /> Today
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
