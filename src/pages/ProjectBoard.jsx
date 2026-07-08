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

const COLUMNS = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
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

function IssueCard({ issue, onClick, members, projectKey }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: issue.id })
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
      className="bg-gray-700 hover:bg-gray-650 rounded p-3 mb-2 cursor-pointer touch-none"
    >
      <div className="flex justify-between items-start">
        <p className="text-sm font-medium text-white">{issue.title}</p>
        <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ml-2 ${priorityColor}`}></span>
      </div>

      {issue.due_date && (
        <span
          className={`text-xs px-2 py-0.5 rounded mt-1 inline-block ${
            isOverdue ? 'bg-red-500/20 text-red-400' : 'bg-gray-600 text-gray-300'
          }`}
        >
          📅 {issue.due_date}
        </span>
      )}

      {issue.labels && issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {issue.labels.map((l) => (
            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-600 text-gray-300">
              {l}
            </span>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-400">
          {TYPE_ICON[issue.type] || ''} {projectKey}-{issue.issue_number || '—'}
        </span>
        {issue.assignee_id && (
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${getAvatarColor(
              assigneeName
            )}`}
            title={assigneeName}
          >
            {getInitials(assigneeName)}
          </span>
        )}
      </div>
    </div>
  )
}

function Column({ column, issues, onCardClick, members, projectKey }) {
  const { setNodeRef } = useDroppable({ id: column.id })
  return (
    <div ref={setNodeRef} className="bg-gray-800 rounded-lg p-3 w-72 flex-shrink-0">
      <h3 className="text-sm font-bold text-gray-300 mb-3 uppercase">
        {column.label} <span className="text-gray-500">({issues.length})</span>
      </h3>
      {issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} onClick={onCardClick} members={members} projectKey={projectKey} />
      ))}
    </div>
  )
}

export default function ProjectBoard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [project, setProject] = useState(null)
  const [issues, setIssues] = useState([])
  const [members, setMembers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [filterAssignee, setFilterAssignee] = useState('all')
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
  }, [id])

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over) return
    const newStatus = over.id
    const issue = issues.find((i) => i.id === active.id)
    if (!issue || issue.status === newStatus) return

    setIssues((prev) =>
      prev.map((i) => (i.id === active.id ? { ...i, status: newStatus } : i))
    )
    await supabase.from('issues').update({ status: newStatus }).eq('id', active.id)
  }

  const filteredIssuesFor = (colId) => {
    return issues
      .map((issue, index) => ({ ...issue, issue_number: index + 1 }))
      .filter((i) => {
        const statusMatch = i.status === colId
        const searchMatch = i.title.toLowerCase().includes(searchQuery.toLowerCase())
        const sprintMatch = activeSprintId === null ? !i.sprint_id : i.sprint_id === activeSprintId
        if (!searchMatch || !sprintMatch) return false
        if (filterAssignee === 'all') return statusMatch
        if (filterAssignee === 'unassigned') return statusMatch && !i.assignee_id
        return statusMatch && i.assignee_id === filterAssignee
      })
  }

  if (!project) return <div className="min-h-screen bg-gray-900 text-white p-8">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-900 text-white">
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
            + New Issue
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

        <label className="text-sm text-gray-400">Filter by assignee:</label>
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="px-3 py-1 rounded bg-gray-700 text-sm outline-none"
        >
          <option value="all">Everyone</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="🔍 Search issues..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1 rounded bg-gray-700 text-sm outline-none w-64"
        />
      </div>

      {viewMode === 'board' ? (
        <div className="p-6 overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4">
              {COLUMNS.map((col) => (
                <Column
                  key={col.id}
                  column={col}
                  issues={filteredIssuesFor(col.id)}
                  onCardClick={(issue) => navigate(`/project/${id}/issue/${issue.id}`)}
                  members={members}
                  projectKey={project.key}
                />
              ))}
            </div>
          </DndContext>
        </div>
      ) : (
        <IssueListView
          issues={issues.filter((i) => {
            const sprintMatch = activeSprintId === null ? !i.sprint_id : i.sprint_id === activeSprintId
            const searchMatch = i.title.toLowerCase().includes(searchQuery.toLowerCase())
            return sprintMatch && searchMatch
          })}
          members={members}
          projectKey={project.key}
          onIssueClick={(issue) => navigate(`/project/${id}/issue/${issue.id}`)}
        />
      )}
    </div>
  )
}
