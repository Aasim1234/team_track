import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import {
  Plus, GripVertical, Calendar, MessageSquare, Paperclip, Link as LinkIcon, Users,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import TopNav from '../components/TopNav'
import SprintBar from '../components/SprintBar'
import NewIssueModal from '../components/NewIssueModal'
import IssueListView from '../components/IssueListView'
import AppSidebar, { recordRecentProject } from '../components/AppSidebar'
import ProjectSummary from '../components/ProjectSummary'
import ProjectCode from '../components/ProjectCode'
import ProjectForms from '../components/ProjectForms'
import ProjectTimeline from '../components/ProjectTimeline'
import ProjectDocs from '../components/ProjectDocs'

const TABS = [
  { id: 'summary', label: 'Summary', icon: '🌐' },
  { id: 'list', label: 'List', icon: '☰' },
  { id: 'board', label: 'Board', icon: '📋' },
  { id: 'code', label: 'Code', icon: '</>' },
  { id: 'forms', label: 'Forms', icon: '📝' },
  { id: 'timeline', label: 'Timeline', icon: '📈' },
  { id: 'docs', label: 'Docs', icon: '📄' },
]

const COLUMNS = [
  { id: 'todo', label: 'To Do', dot: 'bg-gray-400', bar: 'bg-gray-500' },
  { id: 'in_progress', label: 'In Progress', dot: 'bg-blue-400', bar: 'bg-blue-500' },
  { id: 'in_review', label: 'In Review', dot: 'bg-orange-400', bar: 'bg-orange-500' },
  { id: 'done', label: 'Done', dot: 'bg-green-400', bar: 'bg-green-500', check: true },
]

const PRIORITY_CHIP = {
  low: 'bg-gray-500/15 text-gray-400',
  medium: 'bg-blue-500/15 text-blue-400',
  high: 'bg-orange-500/15 text-orange-400',
  urgent: 'bg-red-500/15 text-red-400',
}

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

  const assigneeName = members.find((m) => m.id === issue.assignee_id)?.name
  const isOverdue = issue.due_date && new Date(issue.due_date) < new Date() && issue.status !== 'done'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onClick(issue)}
      className="group relative bg-gray-700/80 border border-gray-600/40 hover:border-gray-500/60 rounded-xl p-3 mb-2 cursor-pointer touch-none card-lift"
    >
      <div className="flex justify-between items-start gap-1.5">
        <GripVertical
          size={13}
          className="text-gray-500 opacity-0 group-hover:opacity-70 flex-shrink-0 mt-0.5 -ml-1 cursor-grab"
        />
        <p className="text-[13px] font-medium text-white leading-snug flex-1">{issue.title}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
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

      <div className="flex flex-wrap gap-1.5 mt-2">
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize ${
            PRIORITY_CHIP[issue.priority] || PRIORITY_CHIP.medium
          }`}
        >
          {issue.priority}
        </span>
        {issue.due_date && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 ${
              isOverdue ? 'bg-red-500/15 text-red-400' : 'bg-gray-600/50 text-gray-300'
            }`}
          >
            <Calendar size={10} /> {issue.due_date}
          </span>
        )}
        {issue.labels?.map((l) => (
          <span key={l} className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-600/50 text-gray-300">
            {l}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2.5 mt-2.5">
        <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
          {TYPE_ICON[issue.type] || ''} {projectKey}-{issue.issue_number || '—'}
        </span>
        {issue._comments > 0 && (
          <span className="text-[11px] text-gray-500 flex items-center gap-0.5">
            <MessageSquare size={11} /> {issue._comments}
          </span>
        )}
        {issue._attachments > 0 && (
          <span className="text-[11px] text-gray-500 flex items-center gap-0.5">
            <Paperclip size={11} /> {issue._attachments}
          </span>
        )}
        <span
          className={`ml-auto w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
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

function Column({ column, droppableId, issues, onCardClick, onDeleteIssue, onAddIssue, members, projectKey }) {
  const { setNodeRef } = useDroppable({ id: droppableId })
  return (
    <div className="w-72 flex-shrink-0">
      <div className={`h-1 rounded-t-lg ${column.bar}`} />
      <div
        ref={setNodeRef}
        className="bg-gray-800/70 border border-t-0 border-gray-600/25 rounded-b-xl p-2.5 min-h-[140px]"
      >
        <div className="flex items-center gap-2 px-1 pb-2.5">
          {column.check ? (
            <span className="text-green-400 text-xs">✓</span>
          ) : (
            <span className={`w-2 h-2 rounded-full ${column.dot}`}></span>
          )}
          <h3 className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
            {column.label}
          </h3>
          <span className="text-[10px] font-semibold bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">
            {issues.length}
          </span>
          <button
            onClick={onAddIssue}
            title={`Add issue to ${column.label}`}
            className="ml-auto text-gray-500 hover:text-white p-1 rounded-md hover:bg-gray-700"
          >
            <Plus size={13} />
          </button>
        </div>
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
          <div className="border border-dashed border-gray-600/40 rounded-lg py-5 text-center">
            <p className="text-xs text-gray-500">No issues</p>
          </div>
        )}
      </div>
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
  const [activeTab, setActiveTab] = useState('board')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const fetchData = async () => {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
    setProject(proj)
    const { data: iss } = await supabase
      .from('issues')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: true })

    // Comment/attachment counts for card badges
    const ids = (iss || []).map((i) => i.id)
    const commentCounts = {}
    const attachCounts = {}
    if (ids.length > 0) {
      const [{ data: cs }, { data: as }] = await Promise.all([
        supabase.from('comments').select('issue_id').in('issue_id', ids),
        supabase.from('attachments').select('issue_id').in('issue_id', ids),
      ])
      ;(cs || []).forEach((c) => { commentCounts[c.issue_id] = (commentCounts[c.issue_id] || 0) + 1 })
      ;(as || []).forEach((a) => { attachCounts[a.issue_id] = (attachCounts[a.issue_id] || 0) + 1 })
    }
    setIssues(
      (iss || []).map((i) => ({
        ...i,
        _comments: commentCounts[i.id] || 0,
        _attachments: attachCounts[i.id] || 0,
      }))
    )
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

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <AppSidebar />
        <div className="flex-1 min-w-0 p-6 animate-pulse">
          <div className="h-8 w-64 bg-gray-800 rounded-lg mb-3" />
          <div className="h-4 w-96 bg-gray-800 rounded-lg mb-8" />
          <div className="flex gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="w-72 flex-shrink-0 space-y-2">
                <div className="h-8 bg-gray-800 rounded-lg" />
                <div className="h-24 bg-gray-800/70 rounded-xl" />
                <div className="h-24 bg-gray-800/50 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const doneCount = issues.filter((i) => i.status === 'done').length
  const overdueCount = issues.filter(
    (i) => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'done'
  ).length
  const donePercent = issues.length > 0 ? Math.round((doneCount / issues.length) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AppSidebar />
      <div className="flex-1 min-w-0">
      <TopNav
        breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: project.name }]}
        onQuickCreate={() => setShowForm(true)}
        quickCreateLabel="New Task"
      />

      {/* Project header */}
      <div className="px-6 pt-5 pb-4 animate-slide-up">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <span className="text-[11px] font-bold bg-blue-500/15 text-blue-400 px-2 py-1 rounded-md tracking-wide">
            {project.key}
          </span>
          <span className="text-[11px] font-semibold bg-green-500/15 text-green-400 px-2 py-1 rounded-md flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Active
          </span>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex -space-x-2 items-center" title={`${members.length} members`}>
              {members.slice(0, 5).map((m) => (
                <span
                  key={m.id}
                  title={m.name}
                  className={`w-7 h-7 rounded-full ring-2 ring-gray-900 flex items-center justify-center text-[10px] font-bold text-white ${getAvatarColor(m.name)}`}
                >
                  {getInitials(m.name)}
                </span>
              ))}
              {members.length > 5 && (
                <span className="w-7 h-7 rounded-full ring-2 ring-gray-900 bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300">
                  +{members.length - 5}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href)
                alert('Project link copied — share it to invite your team.')
              }}
              className="flex items-center gap-1.5 text-[13px] text-gray-300 bg-gray-800/80 border border-gray-600/40 hover:border-gray-500/60 px-3 py-1.5 rounded-lg"
            >
              <Users size={14} /> Invite
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href)
              }}
              title="Copy project link"
              className="text-gray-400 hover:text-white p-2 rounded-lg bg-gray-800/80 border border-gray-600/40 hover:border-gray-500/60"
            >
              <LinkIcon size={14} />
            </button>
          </div>
        </div>
        {project.description && (
          <p className="text-sm text-gray-400 mt-1.5 max-w-2xl">{project.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3 flex-wrap text-xs text-gray-400">
          <span>
            <span className="text-white font-semibold">{issues.length}</span> issues
          </span>
          <span>
            <span className="text-green-400 font-semibold">{doneCount}</span> done
          </span>
          {overdueCount > 0 && (
            <span>
              <span className="text-red-400 font-semibold">{overdueCount}</span> overdue
            </span>
          )}
          <div className="flex items-center gap-2">
            <div className="w-36 bg-gray-600/40 rounded-full h-1.5">
              <div
                className="bg-gradient-to-r from-blue-500 to-green-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${donePercent}%` }}
              />
            </div>
            <span className="font-semibold text-white">{donePercent}%</span>
          </div>
        </div>
      </div>

      {/* Jira-style project tabs */}
      <div className="flex items-center gap-1 px-6 bg-gray-800/60 border-b border-gray-800 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap ${
              activeTab === t.id
                ? 'border-blue-400 text-blue-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <span className="text-xs">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {(activeTab === 'board' || activeTab === 'list') && (
        <SprintBar
          projectId={id}
          activeSprintId={activeSprintId}
          onSprintChange={setActiveSprintId}
        />
      )}

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

      {(activeTab === 'board' || activeTab === 'list') && (
      <div className="px-6 pt-4 flex items-center gap-3 flex-wrap">
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
      )}

      {activeTab === 'summary' && (
        <ProjectSummary
          issues={issues}
          members={members}
          onIssueClick={(issue) => navigate(`/project/${id}/issue/${issue.id}`)}
        />
      )}
      {activeTab === 'code' && <ProjectCode projectId={id} />}
      {activeTab === 'forms' && <ProjectForms projectId={id} onCreated={fetchData} />}
      {activeTab === 'timeline' && <ProjectTimeline projectId={id} />}
      {activeTab === 'docs' && <ProjectDocs projectId={id} />}

      {activeTab === 'board' && (
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
                          onAddIssue={() => setShowForm(true)}
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
                    onAddIssue={() => setShowForm(true)}
                    members={members}
                    projectKey={project.key}
                  />
                ))}
              </div>
            )}
          </DndContext>
        </div>
      )}
      {activeTab === 'list' && (
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
