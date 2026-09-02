import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import Modal from './ui/Modal'
import FormField, { inputClass } from './ui/FormField'
import PrimaryButton from './ui/Button'
import { useToast } from './ui/Toast'

// Doubles as the edit modal: pass `plan` to pre-fill and update instead of
// insert. onSaved(newId) is called with the new id on create, with no
// argument on edit — the caller just refetches either way.
export default function NewTestPlanModal({ open, onClose, projectId, members, userId, plan, onSaved }) {
  const toast = useToast()
  const isEdit = Boolean(plan)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [releaseVersion, setReleaseVersion] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(plan?.name || '')
      setDescription(plan?.description || '')
      setReleaseVersion(plan?.release_version || '')
      setTargetDate(plan?.target_date || '')
      setOwnerId(plan?.owner_id || '')
    }
  }, [open, plan])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const fields = {
      name,
      description: description || null,
      release_version: releaseVersion || null,
      target_date: targetDate || null,
      owner_id: ownerId || null,
    }

    if (isEdit) {
      const { error } = await supabase.from('test_plans').update(fields).eq('id', plan.id)
      setSaving(false)
      if (error) { toast.error(error.message); return }
      onSaved()
    } else {
      const { data, error } = await supabase
        .from('test_plans')
        .insert({ ...fields, project_id: projectId, created_by: userId })
        .select()
        .single()
      setSaving(false)
      if (error) { toast.error(error.message); return }
      onSaved(data.id)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Test Plan' : 'New Test Plan'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <FormField label="Plan name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. VMS 12.60 Release Validation" className={inputClass} />
        </FormField>
        <FormField label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this plan covers" className={`${inputClass} resize-y`} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Release version" hint="e.g. 12.60">
            <input value={releaseVersion} onChange={(e) => setReleaseVersion(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Target date">
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="Owner">
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputClass}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </FormField>
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Test Plan'}
        </PrimaryButton>
      </form>
    </Modal>
  )
}
