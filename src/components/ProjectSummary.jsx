const STATUS_META = [
  { id: 'todo', label: 'To Do', color: 'bg-gray-400' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-400' },
  { id: 'in_review', label: 'In Review', color: 'bg-yellow-400' },
  { id: 'done', label: 'Done', color: 'bg-green-400' },
]

const TYPE_META = [
  { id: 'bug', label: '🐞 Bugs' },
  { id: 'task', label: '✅ Tasks' },
  { id: 'story', label: '📗 Features' },
]

const PRIORITY_META = [
  { id: 'urgent', label: 'Urgent', color: 'bg-red-500' },
  { id: 'high', label: 'High', color: 'bg-orange-500' },
  { id: 'medium', label: 'Medium', color: 'bg-blue-500' },
  { id: 'low', label: 'Low', color: 'bg-gray-500' },
]

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <p className={`text-2xl font-bold ${accent || 'text-white'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  )
}

export default function ProjectSummary({ issues, members, onIssueClick }) {
  const total = issues.length
  const done = issues.filter((i) => i.status === 'done').length
  const inProgress = issues.filter((i) => i.status === 'in_progress').length
  const overdue = issues.filter(
    (i) => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'done'
  ).length
  const percent = total > 0 ? Math.round((done / total) * 100) : 0

  const recent = [...issues]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)

  return (
    <div className="p-6 space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total issues" value={total} />
        <StatCard label="In progress" value={inProgress} accent="text-blue-400" />
        <StatCard label="Done" value={done} accent="text-green-400" />
        <StatCard label="Overdue" value={overdue} accent={overdue > 0 ? 'text-red-400' : 'text-gray-500'} />
      </div>

      {/* Progress */}
      <div className="bg-gray-800 rounded-lg p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-semibold">Progress</span>
          <span className="text-gray-400">{done}/{total} done · {percent}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden flex">
          {STATUS_META.map((s) => {
            const count = issues.filter((i) => i.status === s.id).length
            if (!count || !total) return null
            return (
              <div
                key={s.id}
                className={`${s.color} h-2.5`}
                style={{ width: `${(count / total) * 100}%` }}
                title={`${s.label}: ${count}`}
              />
            )
          })}
        </div>
        <div className="flex gap-4 mt-3 flex-wrap">
          {STATUS_META.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
              {s.label} ({issues.filter((i) => i.status === s.id).length})
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Types & priorities */}
        <div className="bg-gray-800 rounded-lg p-5 space-y-5">
          <div>
            <p className="text-sm font-semibold mb-3">By type</p>
            {TYPE_META.map((t) => {
              const count = issues.filter((i) => i.type === t.id).length
              return (
                <div key={t.id} className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-gray-300 w-24">{t.label}</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full"
                      style={{ width: total ? `${(count / total) * 100}%` : 0 }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
          <div>
            <p className="text-sm font-semibold mb-3">By priority</p>
            {PRIORITY_META.map((p) => {
              const count = issues.filter((i) => i.priority === p.id).length
              return (
                <div key={p.id} className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-gray-300 w-24 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${p.color}`} />
                    {p.label}
                  </span>
                  <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`${p.color} h-1.5 rounded-full`}
                      style={{ width: total ? `${(count / total) * 100}%` : 0 }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent issues */}
        <div className="bg-gray-800 rounded-lg p-5">
          <p className="text-sm font-semibold mb-3">Recently created</p>
          <div className="space-y-1">
            {recent.map((i) => (
              <button
                key={i.id}
                onClick={() => onIssueClick(i)}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 flex items-center gap-2"
              >
                <span className="text-sm flex-1 truncate">{i.title}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">
                  {members.find((m) => m.id === i.assignee_id)?.name || 'Unassigned'}
                </span>
              </button>
            ))}
            {recent.length === 0 && <p className="text-xs text-gray-500">No issues yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
