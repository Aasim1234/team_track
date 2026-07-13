import { useState } from 'react'
import { timeAgo } from '../lib/time'

const AVATAR_COLORS = ['bg-pink-500', 'bg-purple-500', 'bg-blue-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-500']

function getAvatarColor(name) {
  if (!name) return 'bg-gray-500'
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function CommentIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

const TYPE_COLOR = {
  bug: 'bg-red-500/20 text-red-400',
  story: 'bg-blue-500/20 text-blue-400',
  task: 'bg-yellow-500/20 text-yellow-400',
}

const PRIORITY_LABEL = {
  low: { text: 'Low', color: 'bg-gray-600 text-gray-300' },
  medium: { text: 'Medium', color: 'bg-blue-600/30 text-blue-300' },
  high: { text: 'High', color: 'bg-orange-600/30 text-orange-300' },
  urgent: { text: 'Urgent', color: 'bg-red-600/30 text-red-300' },
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'priority', label: 'Priority' },
]

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }

export default function IssueListView({ issues, members, projectKey, onIssueClick }) {
  const [tab, setTab] = useState('open') // 'open' | 'closed'
  const [sort, setSort] = useState('newest')
  const [authorFilter, setAuthorFilter] = useState('all')

  const openIssues = issues.filter((i) => i.status !== 'done')
  const closedIssues = issues.filter((i) => i.status === 'done')

  let list = tab === 'open' ? openIssues : closedIssues

  if (authorFilter !== 'all') {
    list = list.filter((i) => i.reporter_id === authorFilter)
  }

  list = [...list].sort((a, b) => {
    if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at)
    if (sort === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
    if (sort === 'priority') return (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4)
    return 0
  })

  const reporters = members.filter((m) => issues.some((i) => i.reporter_id === m.id))

  return (
    <div className="mx-6 mt-4 bg-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-wrap gap-3">
        <div className="flex gap-4">
          <button
            onClick={() => setTab('open')}
            className={`text-sm font-medium flex items-center gap-1 ${
              tab === 'open' ? 'text-white' : 'text-gray-500'
            }`}
          >
            <span className="text-green-500">●</span> Open <span className="text-gray-500">{openIssues.length}</span>
          </button>
          <button
            onClick={() => setTab('closed')}
            className={`text-sm font-medium flex items-center gap-1 ${
              tab === 'closed' ? 'text-white' : 'text-gray-500'
            }`}
          >
            <span className="text-purple-500">✓</span> Closed <span className="text-gray-500">{closedIssues.length}</span>
          </button>
        </div>

        <div className="flex gap-2">
          <select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            className="text-xs bg-gray-700 rounded px-2 py-1.5 outline-none"
          >
            <option value="all">All authors</option>
            {reporters.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-xs bg-gray-700 rounded px-2 py-1.5 outline-none"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        {list.length === 0 && (
          <p className="text-gray-500 text-sm p-6 text-center">No issues here.</p>
        )}
        {list.map((issue, index) => {
          const assignee = members.find((m) => m.id === issue.assignee_id)
          const reporter = members.find((m) => m.id === issue.reporter_id)
          const priority = PRIORITY_LABEL[issue.priority]

          return (
            <div
              key={issue.id}
              onClick={() => onIssueClick(issue)}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 last:border-0 hover:bg-gray-750 cursor-pointer"
            >
              <span className={tab === 'open' ? 'text-green-500' : 'text-purple-500'}>
                {tab === 'open' ? '○' : '●'}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white truncate">{issue.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${TYPE_COLOR[issue.type] || 'bg-gray-600 text-gray-300'}`}>
                    {issue.type}
                  </span>
                  {priority && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${priority.color}`}>
                      {priority.text}
                    </span>
                  )}
                  {issue.labels && issue.labels.map((l) => (
                    <span key={l} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-600 text-gray-300">
                      {l}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {projectKey}-{index + 1} · opened {timeAgo(issue.created_at)}
                  {reporter && ` by ${reporter.name}`}
                </p>
              </div>

              {issue.comment_count > 0 && (
                <span
                  className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0"
                  title={`${issue.comment_count} comment${issue.comment_count > 1 ? 's' : ''}`}
                >
                  <CommentIcon className="w-4 h-4" />
                  {issue.comment_count}
                </span>
              )}

              {assignee && (
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${getAvatarColor(assignee.name)}`}
                  title={assignee.name}
                >
                  {getInitials(assignee.name)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
