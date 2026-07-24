import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const TEST_TYPES = [
  'functional', 'regression', 'smoke', 'sanity', 'integration', 'system',
  'ui', 'api', 'performance', 'security', 'compatibility', 'uat', 'exploratory',
]
const PRIORITIES = ['critical', 'high', 'medium', 'low']
const AUTOMATION_STATUSES = ['not_automated', 'planned', 'in_progress', 'automated', 'not_applicable']

function label(value) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export default function NewTestCaseModal({ sections, defaultSectionId, members, onClose, onCreated }) {
  const [sectionId, setSectionId] = useState(defaultSectionId || sections[0]?.id || '')
  const [title, setTitle] = useState('')
  const [preconditions, setPreconditions] = useState('')
  const [objective, setObjective] = useState('')
  const [testType, setTestType] = useState('functional')
  const [priority, setPriority] = useState('medium')
  const [automationStatus, setAutomationStatus] = useState('not_automated')
  const [ownerId, setOwnerId] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!sectionId) {
      alert('Create a section first, then add test cases to it.')
      return
    }
    setSaving(true)
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const { error } = await supabase.from('test_cases').insert({
      section_id: sectionId,
      title,
      preconditions: preconditions || null,
      objective: objective || null,
      test_type: testType,
      priority,
      automation_status: automationStatus,
      owner_id: ownerId || null,
      tags,
    })
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    onCreated()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl glass rounded-2xl p-6 shadow-2xl animate-scale-in max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold">New Test Case</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-700"
          >
            <X size={17} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[13px] text-gray-400 block mb-1.5">Section</label>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none focus:border-blue-500/70 text-sm"
            >
              <option value="" disabled>Select a section…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.pathLabel || s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[13px] text-gray-400 block mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Add camera with valid credentials"
              className="w-full px-3.5 py-2.5 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none focus:border-blue-500/70 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[13px] text-gray-400 block mb-1.5">Type</label>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none text-xs capitalize"
              >
                {TEST_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[13px] text-gray-400 block mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none text-xs capitalize"
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[13px] text-gray-400 block mb-1.5">Automation</label>
              <select
                value={automationStatus}
                onChange={(e) => setAutomationStatus(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none text-xs capitalize"
              >
                {AUTOMATION_STATUSES.map((a) => <option key={a} value={a}>{label(a)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[13px] text-gray-400 block mb-1.5">Preconditions</label>
            <textarea
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
              rows={2}
              placeholder="What state must the system be in before this test?"
              className="w-full px-3.5 py-2.5 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none focus:border-blue-500/70 text-sm resize-y"
            />
          </div>

          <div>
            <label className="text-[13px] text-gray-400 block mb-1.5">Objective</label>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={2}
              placeholder="What is this test verifying?"
              className="w-full px-3.5 py-2.5 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none focus:border-blue-500/70 text-sm resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[13px] text-gray-400 block mb-1.5">Owner</label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none text-xs"
              >
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[13px] text-gray-400 block mb-1.5">Tags (comma-separated)</label>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="camera, smoke"
                className="w-full px-2.5 py-2 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none text-xs"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full mt-6 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 py-2.5 rounded-lg font-semibold text-sm shadow-lg shadow-blue-500/25"
        >
          {saving ? 'Creating...' : 'Create Test Case'}
        </button>
      </form>
    </div>
  )
}
