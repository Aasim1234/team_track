import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import ActivityFeed from './ActivityFeed'

export default function IssueDetail({ issue, onClose, onUpdate }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [members, setMembers] = useState([])
  const [activeTab, setActiveTab] = useState('comments')
  const { user } = useAuth()

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(name)')
      .eq('issue_id', issue.id)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  useEffect(() => {
    fetchComments()
    supabase.from('profiles').select('id, name').then(({ data }) => setMembers(data || []))
  }, [issue.id])

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim()) return
    const { error } = await supabase.from('comments').insert({
      issue_id: issue.id,
      user_id: user.id,
      body: newComment,
    })
    if (!error) {
      setNewComment('')
      fetchComments()
    }
  }

  const handlePriorityChange = async (priority) => {
    await supabase.from('issues').update({ priority }).eq('id', issue.id)
    onUpdate()
  }

  const handleAssigneeChange = async (assigneeId) => {
    await supabase.from('issues').update({ assignee_id: assigneeId || null }).eq('id', issue.id)
    onUpdate()
  }

  const handleStatusChange = async (status) => {
    await supabase.from('issues').update({ status }).eq('id', issue.id)
    onUpdate()
  }

  const handleDueDateChange = async (dueDate) => {
    await supabase.from('issues').update({ due_date: dueDate || null }).eq('id', issue.id)
    onUpdate()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 text-white">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">{issue.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">
            &times;
          </button>
        </div>

        <p className="text-gray-300 mb-4">{issue.description || 'No description'}</p>

        <div className="flex gap-4 mb-6 text-sm flex-wrap">
          <div>
            <span className="text-gray-500 block">Type</span>
            <span className="capitalize">{issue.type}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Status</span>
            <select
              value={issue.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1"
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div>
            <span className="text-gray-500 block">Priority</span>
            <select
              value={issue.priority}
              onChange={(e) => handlePriorityChange(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <span className="text-gray-500 block">Assignee</span>
            <select
              value={issue.assignee_id || ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-gray-500 block">Due Date</span>
            <input
              type="date"
              value={issue.due_date || ''}
              onChange={(e) => handleDueDateChange(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1"
            />
          </div>
        </div>

        <div className="flex gap-4 border-b border-gray-700 mb-4">
          <button
            onClick={() => setActiveTab('comments')}
            className={`pb-2 text-sm font-semibold ${
              activeTab === 'comments'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-gray-400'
            }`}
          >
            Comments ({comments.length})
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`pb-2 text-sm font-semibold ${
              activeTab === 'activity'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-gray-400'
            }`}
          >
            Activity
          </button>
        </div>

        {activeTab === 'comments' && (
          <>
            <div className="space-y-3 mb-4">
              {comments.map((c) => (
                <div key={c.id} className="bg-gray-700 rounded p-3">
                  <div className="text-sm font-semibold text-green-400">
                    {c.profiles?.name || 'Unknown'}
                  </div>
                  <div className="text-sm">{c.body}</div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-gray-500 text-sm">No comments yet.</p>
              )}
            </div>

            <form onSubmit={handleAddComment} className="flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 px-3 py-2 rounded bg-gray-700 outline-none text-sm"
              />
              <button
                type="submit"
                className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded text-sm font-semibold"
              >
                Post
              </button>
            </form>
          </>
        )}

        {activeTab === 'activity' && <ActivityFeed issueId={issue.id} />}
      </div>
    </div>
  )
}
