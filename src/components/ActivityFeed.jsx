import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

function timeAgo(dateStr) {
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const STATUS_LABELS = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

function describeActivity(entry, actorName) {
  switch (entry.action_type) {
    case 'created':
      return `${actorName} created this issue`
    case 'status_changed':
      return `${actorName} changed status from ${STATUS_LABELS[entry.old_value] || entry.old_value} to ${STATUS_LABELS[entry.new_value] || entry.new_value}`
    case 'priority_changed':
      return `${actorName} changed priority from ${entry.old_value} to ${entry.new_value}`
    case 'assignee_changed':
      return entry.new_value
        ? `${actorName} assigned this to ${entry.new_value}`
        : `${actorName} unassigned this issue`
    case 'due_date_changed':
      return entry.new_value
        ? `${actorName} set due date to ${entry.new_value}`
        : `${actorName} removed the due date`
    case 'title_changed':
      return `${actorName} renamed this issue`
    default:
      return `${actorName} made a change`
  }
}

export default function ActivityFeed({ issueId }) {
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchActivity = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('activity_log')
        .select('*, profiles(name)')
        .eq('issue_id', issueId)
        .order('created_at', { ascending: true })
      setActivity(data || [])
      setLoading(false)
    }
    fetchActivity()
  }, [issueId])

  if (loading) return <p className="text-gray-500 text-sm">Loading activity...</p>

  if (activity.length === 0) {
    return <p className="text-gray-500 text-sm">No activity yet.</p>
  }

  return (
    <div className="space-y-2">
      {activity
        .filter((a) => a.action_type !== 'comment_added')
        .map((entry) => (
          <div key={entry.id} className="flex gap-2 text-sm">
            <span className="text-gray-500">•</span>
            <div>
              <span className="text-gray-300">
                {describeActivity(entry, entry.profiles?.name || 'Someone')}
              </span>
              <span className="text-gray-500 text-xs ml-2">{timeAgo(entry.created_at)}</span>
            </div>
          </div>
        ))}
    </div>
  )
}
