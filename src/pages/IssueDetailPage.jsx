import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import ActivityFeed from '../components/ActivityFeed'
import CommentComposer, { renderMarkdown } from '../components/CommentComposer'
import { uploadAttachment, deleteAttachment } from '../lib/attachments'

const AVATAR_COLORS = ['bg-pink-500', 'bg-purple-500', 'bg-blue-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-500']

function getAvatarColor(name) {
  if (!name) return 'bg-gray-500'
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

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

export default function IssueDetailPage() {
  const { id: projectId, issueId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [project, setProject] = useState(null)
  const [issue, setIssue] = useState(null)
  const [members, setMembers] = useState([])
  const [comments, setComments] = useState([])
  const [attachments, setAttachments] = useState([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [activeTab, setActiveTab] = useState('comments')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [descEditTab, setDescEditTab] = useState('write')
  const [showDescMenu, setShowDescMenu] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchIssue = async () => {
    const { data } = await supabase.from('issues').select('*').eq('id', issueId).single()
    setIssue(data)
  }

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(name)')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  const fetchAttachments = async () => {
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: true })
    setAttachments(data || [])
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).single()
      setProject(proj)
      const { data: mem } = await supabase.from('profiles').select('id, name')
      setMembers(mem || [])
      await fetchIssue()
      await fetchComments()
      await fetchAttachments()
      setLoading(false)
    }
    load()
  }, [issueId, projectId])

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploadingFile(true)
    for (const file of files) {
      try {
        await uploadAttachment(file, issueId, user.id)
      } catch (err) {
        alert(`Failed to upload ${file.name}: ${err.message}`)
      }
    }
    setUploadingFile(false)
    fetchAttachments()
    e.target.value = ''
  }

  const handleDeleteAttachment = async (attachment) => {
    if (!confirm(`Remove ${attachment.file_name}?`)) return
    await deleteAttachment(attachment)
    fetchAttachments()
  }

  const handleAddComment = async (text) => {
    const { error } = await supabase.from('comments').insert({
      issue_id: issueId,
      user_id: user.id,
      body: text,
    })
    if (!error) fetchComments()
  }

  const handleToggleStatus = async (newStatus) => {
    await updateField('status', newStatus)
  }

  const updateField = async (field, value) => {
    await supabase.from('issues').update({ [field]: value }).eq('id', issueId)
    fetchIssue()
  }

  const startEditingTitle = () => {
    setTitleDraft(issue.title)
    setEditingTitle(true)
  }

  const saveTitle = async () => {
    if (!titleDraft.trim()) return
    await updateField('title', titleDraft.trim())
    setEditingTitle(false)
  }

  const startEditingDescription = () => {
    setDescriptionDraft(issue.description || '')
    setDescEditTab('write')
    setEditingDescription(true)
    setShowDescMenu(false)
  }

  const saveDescription = async () => {
    await updateField('description', descriptionDraft)
    setEditingDescription(false)
  }

  if (loading || !issue || !project) {
    return <div className="min-h-screen bg-gray-900 text-white p-8">Loading...</div>
  }

  const reporter = members.find((m) => m.id === issue.reporter_id)
  const isDone = issue.status === 'done'

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <nav className="flex items-center gap-3 px-8 py-4 bg-gray-800">
        <button
          onClick={() => navigate(`/project/${projectId}/classic`)}
          className="text-gray-400 hover:text-white"
        >
          &larr; Back to board
        </button>
        <span className="text-gray-600">/</span>
        <span className="text-sm text-gray-400">{project.name} ({project.key})</span>
      </nav>

      <div className="max-w-6xl mx-auto p-6 flex gap-8 flex-col lg:flex-row">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex gap-2 mb-2">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                className="flex-1 text-2xl font-bold bg-gray-800 rounded px-3 py-1 outline-none"
              />
              <button
                onClick={saveTitle}
                className="bg-green-500 hover:bg-green-600 px-4 rounded text-sm font-semibold"
              >
                Save
              </button>
              <button
                onClick={() => setEditingTitle(false)}
                className="bg-gray-700 hover:bg-gray-600 px-4 rounded text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold mb-2 group flex items-center gap-2">
              {issue.title}
              <button
                onClick={startEditingTitle}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white text-base"
                title="Edit title"
              >
                ✏️
              </button>
            </h1>
          )}

          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${isDone ? 'bg-purple-600/30 text-purple-300' : 'bg-green-600/30 text-green-300'}`}>
              {isDone ? '✓ Done' : '○ Open'}
            </span>
            <span className="text-sm text-gray-500">
              {project.key}-{issue.issue_number ?? '—'} · opened {timeAgo(issue.created_at)}
              {reporter && ` by ${reporter.name}`}
            </span>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            {editingDescription ? (
              <div>
                <div className="flex gap-4 border-b border-gray-700 mb-2">
                  <button
                    onClick={() => setDescEditTab('write')}
                    className={`text-sm pb-2 ${descEditTab === 'write' ? 'text-white border-b-2 border-orange-500' : 'text-gray-500'}`}
                  >
                    Write
                  </button>
                  <button
                    onClick={() => setDescEditTab('preview')}
                    className={`text-sm pb-2 ${descEditTab === 'preview' ? 'text-white border-b-2 border-orange-500' : 'text-gray-500'}`}
                  >
                    Preview
                  </button>
                </div>
                {descEditTab === 'write' ? (
                  <textarea
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    rows={6}
                    autoFocus
                    className="w-full bg-gray-900 rounded p-3 outline-none text-sm resize-y"
                  />
                ) : (
                  <div
                    className="text-sm text-gray-300 bg-gray-900 rounded p-3 min-h-[140px]"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(descriptionDraft) || '<span class="text-gray-500">Nothing to preview</span>',
                    }}
                  />
                )}
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => setEditingDescription(false)}
                    className="px-3 py-1.5 rounded text-sm text-gray-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveDescription}
                    className="bg-green-500 hover:bg-green-600 px-4 py-1.5 rounded text-sm font-semibold"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-end relative mb-1">
                  <button
                    onClick={() => setShowDescMenu(!showDescMenu)}
                    className="text-gray-500 hover:text-white px-2"
                  >
                    ⋯
                  </button>
                  {showDescMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowDescMenu(false)}></div>
                      <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20 py-1 w-40">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.href)
                            setShowDescMenu(false)
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                        >
                          🔗 Copy link
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(issue.description || '')
                            setShowDescMenu(false)
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                        >
                          📋 Copy Markdown
                        </button>
                        <button
                          onClick={startEditingDescription}
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                        >
                          ✏️ Edit
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {issue.description ? (
                  <div
                    className="text-sm text-gray-300"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(issue.description) }}
                  />
                ) : (
                  <p className="text-sm text-gray-500">No description provided.</p>
                )}
              </>
            )}
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-gray-500 uppercase font-semibold">
                Attachments {attachments.length > 0 && `(${attachments.length})`}
              </p>
              <label className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded cursor-pointer">
                {uploadingFile ? 'Uploading...' : '📎 Add file'}
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  className="hidden"
                />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {attachments.map((a) => (
                  <div key={a.id} className="relative bg-gray-800 rounded-lg overflow-hidden group">
                    {a.file_type === 'image' && (
                      <a href={a.file_url} target="_blank" rel="noreferrer">
                        <img src={a.file_url} alt={a.file_name} className="w-full h-28 object-cover" />
                      </a>
                    )}
                    {a.file_type === 'video' && (
                      <video src={a.file_url} controls className="w-full h-28 object-cover bg-black" />
                    )}
                    {a.file_type === 'file' && (
                      <a
                        href={a.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full h-28 flex items-center justify-center text-3xl"
                      >
                        📄
                      </a>
                    )}
                    <p className="text-[10px] text-gray-400 px-2 py-1 truncate">{a.file_name}</p>
                    <button
                      onClick={() => handleDeleteAttachment(a)}
                      className="absolute top-1 right-1 bg-black/70 text-white w-5 h-5 rounded-full text-xs opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4 border-b border-gray-700 mb-4">
            <button
              onClick={() => setActiveTab('comments')}
              className={`pb-2 text-sm font-semibold ${
                activeTab === 'comments' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'
              }`}
            >
              Comments ({comments.length})
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`pb-2 text-sm font-semibold ${
                activeTab === 'activity' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'
              }`}
            >
              Activity
            </button>
          </div>

          {activeTab === 'comments' ? (
            <>
              <div className="space-y-3 mb-4">
                {comments.map((c) => (
                  <div key={c.id} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${getAvatarColor(c.profiles?.name)}`}>
                        {getInitials(c.profiles?.name)}
                      </span>
                      <span className="text-sm font-semibold text-green-400">{c.profiles?.name || 'Unknown'}</span>
                      <span className="text-xs text-gray-500">{timeAgo(c.created_at)}</span>
                    </div>
                    <div
                      className="text-sm text-gray-300"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }}
                    />
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-gray-500 text-sm">No comments yet.</p>
                )}
              </div>

              <CommentComposer
                onSubmit={handleAddComment}
                issueStatus={issue.status}
                onToggleStatus={handleToggleStatus}
              />
            </>
          ) : (
            <div className="bg-gray-800 rounded-lg p-4">
              <ActivityFeed issueId={issueId} />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-72 flex-shrink-0">
          <div className="border-b border-gray-700 pb-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-gray-500 uppercase font-semibold">Assignee</p>
            </div>
            <select
              value={issue.assignee_id || ''}
              onChange={(e) => updateField('assignee_id', e.target.value || null)}
              className="w-full bg-transparent text-sm outline-none cursor-pointer hover:bg-gray-800 rounded px-1 py-1 -ml-1"
            >
              <option value="" className="bg-gray-800">No one — assign someone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id} className="bg-gray-800">{m.name}</option>
              ))}
            </select>
          </div>

          <div className="border-b border-gray-700 pb-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-gray-500 uppercase font-semibold">Status</p>
            </div>
            <select
              value={issue.status}
              onChange={(e) => updateField('status', e.target.value)}
              className="w-full bg-transparent text-sm outline-none cursor-pointer hover:bg-gray-800 rounded px-1 py-1 -ml-1"
            >
              <option value="todo" className="bg-gray-800">To Do</option>
              <option value="in_progress" className="bg-gray-800">In Progress</option>
              <option value="in_review" className="bg-gray-800">In Review</option>
              <option value="done" className="bg-gray-800">Done</option>
            </select>
          </div>

          <div className="border-b border-gray-700 pb-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-gray-500 uppercase font-semibold">Labels</p>
            </div>
            {issue.labels && issue.labels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((l) => (
                  <span key={l} className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                    {l}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">None yet</p>
            )}
          </div>

          <div className="border-b border-gray-700 pb-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-gray-500 uppercase font-semibold">Type</p>
            </div>
            <p className="text-sm capitalize text-gray-300">{issue.type}</p>
          </div>

          <div className="border-b border-gray-700 pb-4 mb-4">
            <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Fields</p>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">Priority</span>
              <select
                value={issue.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                className="bg-transparent text-sm outline-none cursor-pointer hover:bg-gray-800 rounded px-1 py-0.5"
              >
                <option value="low" className="bg-gray-800">Low</option>
                <option value="medium" className="bg-gray-800">Medium</option>
                <option value="high" className="bg-gray-800">High</option>
                <option value="urgent" className="bg-gray-800">Urgent</option>
              </select>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Due Date</span>
              <input
                type="date"
                value={issue.due_date || ''}
                onChange={(e) => updateField('due_date', e.target.value || null)}
                className="bg-transparent text-sm outline-none cursor-pointer hover:bg-gray-800 rounded px-1 py-0.5 text-right"
              />
            </div>
          </div>

          <div className="border-b border-gray-700 pb-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-gray-500 uppercase font-semibold">Project</p>
            </div>
            <p className="text-sm text-blue-400">{project.name} ({project.key})</p>
          </div>

          <div className="pb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-gray-500 uppercase font-semibold">Milestone</p>
            </div>
            <p className="text-sm text-gray-500">No milestone</p>
          </div>
        </div>
      </div>
    </div>
  )
}
