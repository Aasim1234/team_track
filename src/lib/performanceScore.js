// Formatting helpers for the Team Performance pages.
//
// The figures themselves are not computed here: team_performance() and
// member_performance() build them in the database from assignments, To-Do task
// status, recorded results and the activity log, so the page, the member
// profile and anyone else reading the data see the same numbers.

export function toDate(dateStr) {
  if (!dateStr) return null
  const hasOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(dateStr)
  const d = new Date(hasOffset ? dateStr : `${dateStr}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isToday(dateStr) {
  const d = toDate(dateStr)
  return d ? d.toDateString() === new Date().toDateString() : false
}

export function timeAgo(dateStr) {
  const d = toDate(dateStr)
  if (!d) return 'Never'
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// "Today" has to mean the viewer's day, so the browser's zone is sent with
// every request rather than assuming the database server's.
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// GitHub-style calendar grid: fills whole weeks (Sunday first) from per-day
// counts so ActivityHeatmap can flow them into columns.
export function buildHeatmapDays(activityByDay, numDays = 98) {
  const counts = Object.fromEntries((activityByDay || []).map((d) => [d.date, d.count]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - (numDays - 1))
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(today)
  end.setDate(end.getDate() + (6 - end.getDay()))

  const days = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    days.push({ date: key, count: counts[key] || 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}
