import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import IssueDetail from '../components/IssueDetail'

const COLUMNS = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
]

const TYPE_ICON = { bug: '🐞', task: '✅', story: '📗' }

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
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-400">
          {TYPE_ICON[issue.type] || ''} {projectKey}-{issue.issue_number || '—'}
        </span>
        {issue.assignee_id && (
          <span className="text-xs bg-gray-600 text-gray-200 px-2 py-0.5 rounded-full">
            {members.find((m) => m.id === issue.assignee_id)?.name?.split(' ')[0] || '?'}
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
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('task')
  const [assigneeId, setAssigneeId] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [selectedIssue, setSelectedIssue] = useState(null)

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

  useEffect(() => {
    fetchData()
    fetchMembers()
  }, [id])

  const handleCreateIssue = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('issues').insert({
      project_id: id,
      title,
      description,
      type,
      reporter_id: user.id,
      assignee_id: assigneeId || null,
    })
    if (!error) {
      setTitle('')
      setDescription('')
      setAssigneeId('')
      setShowForm(false)
      fetchData()
    } else {
      alert(error.message)
    }
  }

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
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold text-sm"
        >
          + New Issue
        </button>
      </nav>

      {showForm && (
        <form onSubmit={handleCreateIssue} className="bg-gray-800 p-4 m-6 rounded flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-sm text-gray-400 block mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="px-3 py-2 rounded bg-gray-700 outline-none w-64"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="px-3 py-2 rounded bg-gray-700 outline-none w-64"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="px-3 py-2 rounded bg-gray-700 outline-none"
            >
              <option value="task">Task</option>
              <option value="bug">Bug</option>
              <option value="story">Story</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Assignee</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="px-3 py-2 rounded bg-gray-700 outline-none"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold">
            Create
          </button>
        </form>
      )}

      <div className="px-6 pt-4 flex items-center gap-3">
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
      </div>

      <div className="p-6 overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-4">
            {COLUMNS.map((col) => (
              <Column
                key={col.id}
                column={col}
                issues={filteredIssuesFor(col.id)}
                onCardClick={setSelectedIssue}
                members={members}
                projectKey={project.key}
              />
            ))}
          </div>
        </DndContext>
      </div>

      {selectedIssue && (
        <IssueDetail
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onUpdate={fetchData}
        />
      )}
    </div>
  )
}