import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import Modal from './ui/Modal'
import FormField, { inputClass } from './ui/FormField'
import PrimaryButton from './ui/Button'
import { useToast } from './ui/Toast'

const TEST_TYPES = [
  'functional', 'regression', 'smoke', 'sanity', 'integration', 'system',
  'ui', 'api', 'performance', 'security', 'compatibility', 'uat', 'exploratory',
]
const PRIORITIES = ['critical', 'high', 'medium', 'low']
const AUTOMATION_STATUSES = ['not_automated', 'planned', 'in_progress', 'automated', 'not_applicable']

function label(value) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export default function NewTestCaseModal({ open, sections, defaultSectionId, members, onClose, onCreated }) {
  const toast = useToast()
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

  useEffect(() => {
    if (open) {
      setSectionId(defaultSectionId || sections[0]?.id || '')
      setTitle('')
      setPreconditions('')
      setObjective('')
      setTestType('functional')
      setPriority('medium')
      setAutomationStatus('not_automated')
      setOwnerId('')
      setTagsInput('')
    }
  }, [open, defaultSectionId, sections])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!sectionId) {
      toast.error('Create a section first, then add test cases to it.')
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
      toast.error(error.message)
      return
    }
    onCreated()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Test Case" size="lg">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <FormField label="Section" required>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} required className={inputClass}>
            <option value="" disabled>Select a section…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.pathLabel || s.name}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            placeholder="e.g. Add camera with valid credentials"
            className={inputClass}
          />
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Type">
            <select value={testType} onChange={(e) => setTestType(e.target.value)} className={`${inputClass} capitalize`}>
              {TEST_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </FormField>
          <FormField label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={`${inputClass} capitalize`}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </FormField>
          <FormField label="Automation">
            <select value={automationStatus} onChange={(e) => setAutomationStatus(e.target.value)} className={`${inputClass} capitalize`}>
              {AUTOMATION_STATUSES.map((a) => <option key={a} value={a}>{label(a)}</option>)}
            </select>
          </FormField>
        </div>

        <FormField label="Preconditions">
          <textarea
            value={preconditions}
            onChange={(e) => setPreconditions(e.target.value)}
            rows={2}
            placeholder="What state must the system be in before this test?"
            className={`${inputClass} resize-y`}
          />
        </FormField>

        <FormField label="Objective">
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={2}
            placeholder="What is this test verifying?"
            className={`${inputClass} resize-y`}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Owner">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputClass}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </FormField>
          <FormField label="Tags" hint="Comma-separated">
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="camera, smoke"
              className={inputClass}
            />
          </FormField>
        </div>

        <PrimaryButton type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create Test Case'}
        </PrimaryButton>
      </form>
    </Modal>
  )
}
