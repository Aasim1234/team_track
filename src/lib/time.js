// Shared relative-time formatter.
//
// Why this exists: `created_at` columns in the DB are Postgres `timestamp`
// (no timezone) columns. Supabase/PostgREST serializes those as strings with
// NO timezone suffix, e.g. "2026-07-08T11:24:05" instead of
// "2026-07-08T11:24:05Z" — even though the value is actually UTC.
//
// Per the ECMAScript spec, `new Date(str)` treats an ISO date-time string
// that has NO timezone designator as LOCAL time, not UTC. So a browser in
// IST (UTC+5:30) parses "2026-07-08T11:24:05" as 11:24:05 IST, which is 5.5
// hours *earlier* than the true UTC instant. The result: every "opened Xh
// ago" / "Xm ago" label is inflated by the viewer's UTC offset (an issue
// created 30 minutes ago showed as "6h ago" for an IST user).
//
// Fix: if the string has no explicit timezone (no trailing Z and no
// +HH:MM/-HH:MM offset), treat it as UTC by appending "Z" before parsing.
function toUtcDate(dateStr) {
  if (!dateStr) return null
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(dateStr)
  return new Date(hasTimezone ? dateStr : `${dateStr}Z`)
}

export function timeAgo(dateStr) {
  const date = toUtcDate(dateStr)
  if (!date || Number.isNaN(date.getTime())) return ''

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}