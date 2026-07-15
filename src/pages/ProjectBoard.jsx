import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import NotificationBell from '../components/NotificationBell'
import SprintBar from '../components/SprintBar'
import NewIssueModal from '../components/NewIssueModal'
import IssueListView from '../components/IssueListView'
import AppSidebar, { recordRecentProject } from '../components/AppSidebar'

const COLUMNS = [
  { id: 'todo', label: 'To Do', dot: 'bg-gray-400' },
  { id: 'in_progress', label: 'In Progress', dot: 'bg-blue-400' },
  { id: 'in_review', label: 'In Review', dot: 'bg-yellow-400' },
  { id: 'done', label: 'Done', dot: 'bg-green-400', check: true },
]

const TYPE_ICON = { bug: '🐞', task: '✅', story: '📗' }

const AVATAR_COLORS = ['bg-pink-500', 'bg-purple-500', 'bg-blue-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-500']

function getAvatarColor(name) {
  if (!name) return 'bg-gray-500'
  const index = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function IssueCard({ issue, onClick, onDelete, members, projectKey }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: issue.id })
  const [showMenu, setShowMenu] = useState(false)
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const priorityColor = {
    low: 'bg-gray-500',
    medium: 'bg-blue-500',
    high: 'bg-orange-500',
    urgent: 'bg-red-500',
  }[issue.priority]

  const assigneeName = members.find((m) => m.id === issue.assignee_id)?.name
  const isOverdue = issue.due_date && new Date(issue.due_date) < new Date() && issue.status !== 'done'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onClick(issue)}
      className="group relative bg-gray-700 hover:bg-gray-650 rounded-lg p-3 mb-2 cursor-pointer touch-none shadow-sm"
    >
      <div className="flex justify-between items-start gap-2">
        <p className="text-sm font-medium text-white leading-snug">{issue.title}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${priorityColor}`}></span>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600"
            >
              ⋯
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowMenu(false) }}></div>
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20 py-1 w-36"
                >
                  <button
                    onClick={() => { onClick(issue); setShowMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/project/${issue.project_id}/issue/${issue.id}`)
                      setShowMenu(false)
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
                  >
                    🔗 Copy link
                  </button>
                  <button
                    onClick={() => { onDelete(issue); setShowMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700"
                  >
                    🗑 Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {issue.due_date && (
        <span
          className={`text-xs px-2 py-0.5 rounded mt-1.5 inline-flex items-center gap-1 ${
            isOverdue ? 'bg-red-500/20 text-red-400' : 'bg-gray-600 text-gray-300'
          }`}
        >
          📅 {issue.due_date}
        </span>
      )}

      {issue.labels && issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {issue.labels.map((l) => (
            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-600 text-gray-300">
              {l}
            </span>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          {TYPE_ICON[issue.type] || ''} {projectKey}-{issue.issue_number || '—'}
        </span>
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
            issue.assignee_id ? getAvatarColor(assigneeName) : 'bg-gray-600 border border-dashed border-gray-500'
          }`}
          title={assigneeName || 'Unassigned'}
        >
          {issue.assignee_id ? getInitials(assigneeName) : ''}
        </span>
      </div>
    </div>
  )
}

function Column({ column, droppableId, issues, onCardClick, onDeleteIssue, members, projectKey }) {
  const { setNodeRef } = useDroppable({ id: droppableId })
  return (
    <div ref={setNodeRef} className="bg-gray-800 rounded-lg p-3 w-72 flex-shrink-0">
      <h3 className="text-sm font-bold text-gray-300 mb-3 uppercase flex items-center gap-2">
        {column.check ? (
          <span className="text-green-400">✓</span>
        ) : (
          <span className={`w-2 h-2 rounded-full ${column.dot}`}></span>
        )}
        {column.label} <span className="text-gray-500 normal-case font-normal">{issues.length}</span>
      </h3>
      {issues.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          onClick={onCardClick}
          onDelete={onDeleteIssue}
          members={members}
          projectKey={projectKey}
        />
      ))}
      {issues.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-4">No issues</p>
      )}
    </div>
  )
}

const GROUP_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Type' },
]

const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }
const TYPE_LABELS = { bug: 'Bug', task: 'Task', story: 'Feature' }

export default function ProjectBoard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [project, setProject] = useState(null)
  const [issues, setIssues] = useState([])
  const [members, setMembers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [groupBy, setGroupBy] = useState('none')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSprintId, setActiveSprintId] = useState(null)
  const [viewMode, setViewMode] = useState('board') // 'board' | 'list'

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const fetchData = async () => {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
    setProject(proj)
    const { data: iss } = await supabase
      .from('issues')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: true })
    setIssues(iss || [])
  }

  const fetchMembers = async () => {
    const { data } = await supabase.from('profiles').select('id, name')
    setMembers(data || [])
  }

  const fetchActiveSprint = async () => {
    const { data } = await supabase
      .from('sprints')
      .select('id')
      .eq('project_id', id)
      .eq('status', 'active')
      .maybeSingle()
    if (data) setActiveSprintId(data.id)
  }

  useEffect(() => {
    fetchData()
    fetchMembers()
    fetchActiveSprint()
    recordRecentProject(id)
  }, [id])

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over) return
    const newStatus = String(over.id).split('::')[0]
    const issue = issues.find((i) => i.id === active.id)
    if (!issue || issue.status === newStatus) return

    setIssues((prev) =>
      prev.map((i) => (i.id === active.id ? { ...i, status: newStatus } : i))
    )
    await supabase.from('issues').update({ status: newStatus }).eq('id', active.id)
  }

  const handleDeleteIssue = async (issue) => {
    if (!confirm(`Delete "${issue.title}"? This cannot be undone.`)) return
    setIssues((prev) => prev.filter((i) => i.id !== issue.id))
    await supabase.from('issues').delete().eq('id', issue.id)
  }

  const baseFilter = (i) => {
    const searchMatch = i.title.toLowerCase().includes(searchQuery.toLowerCase())
    const sprintMatch = activeSprintId === null ? !i.sprint_id : i.sprint_id === activeSprintId
    if (!searchMatch || !sprintMatch) return false
    if (filterAssignee === 'all') return true
    if (filterAssignee === 'unassigned') return !i.assignee_id
    return i.assignee_id === filterAssignee
  }

  const filteredIssuesFor = (colId, groupValue) => {
    return issues.filter((i) => {
      if (i.status !== colId) return false
      if (!baseFilter(i)) return false
      if (groupBy === 'assignee') {
        return groupValue === 'unassigned' ? !i.assignee_id : i.assignee_id === groupValue
      }
      if (groupBy === 'priority') return i.priority === groupValue
      if (groupBy === 'type') return i.type === groupValue
      return true
    })
  }

  // Determine swimlane groups when grouping is active
  let swimlanes = null
  if (groupBy === 'assignee') {
    const ids = new Set(issues.filter(baseFilter).map((i) => i.assignee_id || 'unassigned'))
    swimlanes = Array.from(ids).map((val) => ({
      value: val,
      label: val === 'unassigned' ? 'Unassigned' : members.find((m) => m.id === val)?.name || 'Unknown',
    }))
  } else if (groupBy === 'priority') {
    const vals = new Set(issues.filter(baseFilter).map((i) => i.priority))
    swimlanes = Array.from(vals).map((val) => ({ value: val, label: PRIORITY_LABELS[val] || val }))
  } else if (groupBy === 'type') {
    const vals = new Set(issues.filter(baseFilter).map((i) => i.type))
    swimlanes = Array.from(vals).map((val) => ({ value: val, label: TYPE_LABELS[val] || val }))
  }

  if (!project) return <div className="min-h-screen bg-gray-900 text-white p-8">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AppSidebar />
      <div className="flex-1 min-w-0">
      <nav className="flex justify-between items-center px-8 py-4 bg-gray-800">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white">
            &larr; Back
          </button>
          <h1 className="text-lg font-bold">{project.name} <span className="text-gray-500">({project.key})</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold text-sm"
          >
            + Create
          </button>
        </div>
      </nav>

      <SprintBar
        projectId={id}
        activeSprintId={activeSprintId}
        onSprintChange={setActiveSprintId}
      />

      {showForm && (
        <NewIssueModal
          projectId={id}
          sprintId={activeSprintId}
          reporterId={user.id}
          members={members}
          onClose={() => setShowForm(false)}
          onCreated={fetchData}
        />
      )}

      <div className="px-6 pt-4 flex items-center gap-3 flex-wrap">
        <div className="flex bg-gray-800 rounded overflow-hidden">
          <button
            onClick={() => setViewMode('board')}
            className={`text-sm px-3 py-1.5 ${viewMode === 'board' ? 'bg-green-500 text-white' : 'text-gray-400'}`}
          >
            📋 Board
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`text-sm px-3 py-1.5 ${viewMode === 'list' ? 'bg-green-500 text-white' : 'text-gray-400'}`}
          >
            ☰ List
          </button>
        </div>

        {/* Search box with icon, Jira-style */}
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          <input
            type="text"
            placeholder="Search board"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-3 py-1.5 rounded bg-gray-800 text-sm outline-none w-56"
          />
        </div>

        {/* Group by dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Group by</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="px-2 py-1.5 rounded bg-gray-800 text-sm outline-none"
          >
            {GROUP_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>

        {/* Filter button + dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="text-sm px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 flex items-center gap-1"
          >
            🧰 Filter {filterAssignee !== 'all' && <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>}
          </button>
          {showFilterMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)}></div>
              <div className="absolute top-full mt-1 left-0 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20 p-2 w-48">
                <p className="text-xs text-gray-500 px-2 pb-1">Assignee</p>
                {[{ value: 'all', label: 'Everyone' }, { value: 'unassigned', label: 'Unassigned' }, ...members.map((m) => ({ value: m.id, label: m.name }))].map((opt) => (
                  <div
                    key={opt.value}
                    onClick={() => { setFilterAssignee(opt.value); setShowFilterMenu(false) }}
                    className={`px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-gray-700 ${
                      filterAssignee === opt.value ? 'text-green-400' : 'text-gray-300'
                    }`}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {viewMode === 'board' ? (
        <div className="p-6 overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {swimlanes ? (
              <div className="space-y-6">
                {swimlanes.map((lane) => (
                  <div key={lane.value}>
                    <h4 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
                      {groupBy === 'assignee' && (
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                            lane.value === 'unassigned' ? 'bg-gray-600' : getAvatarColor(lane.label)
                          }`}
                        >
                          {lane.value === 'unassigned' ? '?' : getInitials(lane.label)}
                        </span>
                      )}
                      {lane.label}
                    </h4>
                    <div className="flex gap-4">
                      {COLUMNS.map((col) => (
                        <Column
                          key={col.id}
                          column={col}
                          droppableId={`${col.id}::${lane.value}`}
                          issues={filteredIssuesFor(col.id, lane.value)}
                          onCardClick={(issue) => navigate(`/project/${id}/issue/${issue.id}`)}
                          onDeleteIssue={handleDeleteIssue}
                          members={members}
                          projectKey={project.key}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {swimlanes.length === 0 && (
                  <p className="text-gray-500 text-sm">No issues match the current filters.</p>
                )}
              </div>
            ) : (
              <div className="flex gap-4">
                {COLUMNS.map((col) => (
                  <Column
                    key={col.id}
                    column={col}
                    droppableId={col.id}
                    issues={issues.filter((i) => i.status === col.id && baseFilter(i))}
                    onCardClick={(issue) => navigate(`/project/${id}/issue/${issue.id}`)}
                    onDeleteIssue={handleDeleteIssue}
                    members={members}
                    projectKey={project.key}
                  />
                ))}
              </div>
            )}
          </DndContext>
        </div>
      ) : (
        <IssueListView
          issues={issues.filter(baseFilter)}
          members={members}
          projectKey={project.key}
          onIssueClick={(issue) => navigate(`/project/${id}/issue/${issue.id}`)}
        />
      )}
      </div>
    </div>
  )
}
