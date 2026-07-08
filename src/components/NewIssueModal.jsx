import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const ISSUE_TYPES = [
  { value: 'bug', label: 'Bug', desc: 'An unexpected problem or behavior', color: 'text-red-400', icon: '●' },
  { value: 'story', label: 'Feature', desc: 'A request, idea, or new functionality', color: 'text-blue-400', icon: '●' },
  { value: 'task', label: 'Task', desc: 'A specific piece of work', color: 'text-yellow-400', icon: '●' },
]

const LABEL_OPTIONS = [
  { name: 'bug', color: 'bg-red-500' },
  { name: 'enhancement', color: 'bg-teal-500' },
  { name: 'documentation', color: 'bg-blue-500' },
  { name: 'urgent', color: 'bg-orange-500' },
  { name: 'blocked', color: 'bg-purple-500' },
  { name: 'good first issue', color: 'bg-green-500' },
  { name: 'needs review', color: 'bg-pink-500' },
  { name: 'wontfix', color: 'bg-gray-500' },
]

function getAvatarColor(name) {
  const colors = ['bg-pink-500', 'bg-purple-500', 'bg-blue-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-500']
  if (!name) return 'bg-gray-500'
  return colors[name.charCodeAt(0) % colors.length]
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function NewIssueModal({ projectId, sprintId, reporterId, members, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('task')
  const [assigneeId, setAssigneeId] = useState('')
  const [selectedLabels, setSelectedLabels] = useState([])
  const [dueDate, setDueDate] = useState('')

  const [showAssigneePicker, setShowAssigneePicker] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const [labelSearch, setLabelSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(assigneeSearch.toLowerCase())
  )
  const filteredLabels = LABEL_OPTIONS.filter((l) =>
    l.name.toLowerCase().includes(labelSearch.toLowerCase())
  )

  const toggleLabel = (name) => {
    setSelectedLabels((prev) =>
      prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('issues').insert({
      project_id: projectId,
      sprint_id: sprintId,
      title,
      description,
      type,
      reporter_id: reporterId,
      assignee_id: assigneeId || null,
      labels: selectedLabels,
      due_date: dueDate || null,
    })
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    onCreated()
    onClose()
  }

  const selectedType = ISSUE_TYPES.find((t) => t.value === type)
  const selectedMember = members.find((m) => m.id === assigneeId)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto text-white">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="font-semibold">Create new issue</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            required
            autoFocus
            className="w-full px-3 py-2 rounded bg-gray-700 outline-none text-sm mb-3 font-medium"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            rows={6}
            className="w-full px-3 py-2 rounded bg-gray-700 outline-none text-sm mb-4 resize-y"
          />

          <div className="flex flex-wrap gap-2 mb-4">
            {/* Assignee picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowAssigneePicker(!showAssigneePicker); setShowLabelPicker(false); setShowTypePicker(false) }}
                className="flex items-center gap-2 text-xs bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded"
              >
                {selectedMember ? (
                  <>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${getAvatarColor(selectedMember.name)}`}>
                      {getInitials(selectedMember.name)}
                    </span>
                    {selectedMember.name}
                  </>
                ) : (
                  <>👤 Assignee</>
                )}
              </button>
              {showAssigneePicker && (
                <div className="absolute top-full mt-1 left-0 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-10 p-2">
                  <input
                    value={assigneeSearch}
                    onChange={(e) => setAssigneeSearch(e.target.value)}
                    placeholder="Filter assignees"
                    className="w-full px-2 py-1.5 rounded bg-gray-700 outline-none text-xs mb-2"
                  />
                  <div className="max-h-48 overflow-y-auto">
                    <div
                      onClick={() => { setAssigneeId(''); setShowAssigneePicker(false) }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer text-xs text-gray-400"
                    >
                      Unassigned
                    </div>
                    {filteredMembers.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => { setAssigneeId(m.id); setShowAssigneePicker(false) }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer text-xs"
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${getAvatarColor(m.name)}`}>
                          {getInitials(m.name)}
                        </span>
                        {m.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Label picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowLabelPicker(!showLabelPicker); setShowAssigneePicker(false); setShowTypePicker(false) }}
                className="flex items-center gap-2 text-xs bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded"
              >
                🏷️ {selectedLabels.length > 0 ? `${selectedLabels.length} label${selectedLabels.length > 1 ? 's' : ''}` : 'Labels'}
              </button>
              {showLabelPicker && (
                <div className="absolute top-full mt-1 left-0 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-10 p-2">
                  <input
                    value={labelSearch}
                    onChange={(e) => setLabelSearch(e.target.value)}
                    placeholder="Filter labels"
                    className="w-full px-2 py-1.5 rounded bg-gray-700 outline-none text-xs mb-2"
                  />
                  <div className="max-h-48 overflow-y-auto">
                    {filteredLabels.map((l) => (
                      <label
                        key={l.name}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLabels.includes(l.name)}
                          onChange={() => toggleLabel(l.name)}
                          className="accent-green-500"
                        />
                        <span className={`w-2.5 h-2.5 rounded-full ${l.color}`}></span>
                        {l.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Type picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowTypePicker(!showTypePicker); setShowAssigneePicker(false); setShowLabelPicker(false) }}
                className="flex items-center gap-2 text-xs bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded"
              >
                <span className={selectedType.color}>{selectedType.icon}</span> {selectedType.label}
              </button>
              {showTypePicker && (
                <div className="absolute top-full mt-1 left-0 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-10 p-2">
                  {ISSUE_TYPES.map((t) => (
                    <div
                      key={t.value}
                      onClick={() => { setType(t.value); setShowTypePicker(false) }}
                      className={`px-2 py-2 rounded hover:bg-gray-700 cursor-pointer ${type === t.value ? 'bg-gray-700' : ''}`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className={t.color}>{t.icon}</span>
                        <span className="font-medium">{t.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 ml-4">{t.desc}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Due date */}
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded outline-none"
            />
          </div>

          {selectedLabels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-4">
              {selectedLabels.map((name) => {
                const l = LABEL_OPTIONS.find((opt) => opt.name === name)
                return (
                  <span
                    key={name}
                    className={`text-xs px-2 py-0.5 rounded-full text-white flex items-center gap-1 ${l?.color || 'bg-gray-500'}`}
                  >
                    {name}
                    <button type="button" onClick={() => toggleLabel(name)} className="hover:opacity-70">×</button>
                  </span>
                )
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm text-gray-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="bg-green-500 hover:bg-green-600 disabled:opacity-50 px-4 py-2 rounded text-sm font-semibold"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
