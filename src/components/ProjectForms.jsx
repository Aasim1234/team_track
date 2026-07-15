import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

const FORM_TYPES = [
  { value: 'bug', label: '🐞 Bug report', blurb: 'Something is broken or not working as expected' },
  { value: 'story', label: '📗 Feature request', blurb: 'Suggest a new feature or improvement' },
  { value: 'task', label: '✅ General task', blurb: 'Any other piece of work for the team' },
]

export default function ProjectForms({ projectId, onCreated }) {
  const { user } = useAuth()
  const [formType, setFormType] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const reset = () => {
    setFormType(null)
    setTitle('')
    setDescription('')
    setPriority('medium')
    setSubmitted(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('issues').insert({
      project_id: projectId,
      title,
      description,
      type: formType,
      priority,
      reporter_id: user.id,
    })
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setSubmitted(true)
    onCreated?.()
  }

  if (submitted) {
    return (
      <div className="p-6 max-w-xl">
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-3xl mb-3">🎉</p>
          <h3 className="text-lg font-semibold mb-1">Request submitted</h3>
          <p className="text-sm text-gray-400 mb-5">
            Your request was added to the project backlog.
          </p>
          <button
            onClick={reset}
            className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold text-sm"
          >
            Submit another
          </button>
        </div>
      </div>
    )
  }

  if (!formType) {
    return (
      <div className="p-6 max-w-2xl">
        <h3 className="text-lg font-semibold mb-1">Forms</h3>
        <p className="text-sm text-gray-400 mb-5">
          Pick a form to submit a request to this project — it lands straight in the backlog.
        </p>
        <div className="space-y-3">
          {FORM_TYPES.map((f) => (
            <button
              key={f.value}
              onClick={() => setFormType(f.value)}
              className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-4 flex items-center gap-3"
            >
              <div className="flex-1">
                <p className="font-semibold text-sm">{f.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{f.blurb}</p>
              </div>
              <span className="text-gray-500">→</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const selected = FORM_TYPES.find((f) => f.value === formType)

  return (
    <div className="p-6 max-w-xl">
      <button onClick={reset} className="text-sm text-gray-400 hover:text-white mb-3">
        ← All forms
      </button>
      <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold mb-4">{selected.label}</h3>
        <div className="mb-3">
          <label className="text-sm text-gray-400 block mb-1">Summary</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="One-line summary"
            className="px-3 py-2 rounded bg-gray-700 outline-none w-full"
          />
        </div>
        <div className="mb-3">
          <label className="text-sm text-gray-400 block mb-1">Details</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder={
              formType === 'bug'
                ? 'What happened? What did you expect? Steps to reproduce...'
                : 'Describe the request...'
            }
            className="px-3 py-2 rounded bg-gray-700 outline-none w-full resize-y"
          />
        </div>
        <div className="mb-5">
          <label className="text-sm text-gray-400 block mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="px-3 py-2 rounded bg-gray-700 outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-green-500 hover:bg-green-600 disabled:opacity-50 px-4 py-2 rounded font-semibold text-sm"
        >
          {saving ? 'Submitting...' : 'Submit request'}
        </button>
      </form>
    </div>
  )
}
