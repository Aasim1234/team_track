import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Modal from './ui/Modal'
import FormField, { inputClass } from './ui/FormField'

export default function NewTestRunModal({ open, onClose, projectId, cases, members, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState(new Set())
  const [assignToId, setAssignToId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setChecked(new Set(cases.map((c) => c.id)))
      setName('')
      setDescription('')
      setSearch('')
      setAssignToId('')
    }
  }, [open, cases])

  const filteredCases = cases.filter(
    (c) => !search || `${c.human_id} ${c.title}`.toLowerCase().includes(search.toLowerCase())
  )

  const toggleCase = (id) => {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setChecked((prev) => (prev.size === cases.length ? new Set() : new Set(cases.map((c) => c.id))))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (checked.size === 0) {
      alert('Select at least one test case to include in this run.')
      return
    }
    setSaving(true)
    const { data: run, error } = await supabase
      .from('test_runs')
      .insert({ project_id: projectId, name, description: description || null })
      .select()
      .single()
    if (error) {
      setSaving(false)
      alert(error.message)
      return
    }
    const rows = [...checked].map((testCaseId) => ({
      run_id: run.id,
      test_case_id: testCaseId,
      assigned_to: assignToId || null,
    }))
    const { error: caseError } = await supabase.from('test_run_cases').insert(rows)
    setSaving(false)
    if (caseError) {
      alert(caseError.message)
      return
    }
    onCreated(run.id)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Test Run" size="lg">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <FormField label="Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputClass} />
        </FormField>
        <FormField label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`${inputClass} resize-y`}
          />
        </FormField>

        <FormField
          label="Test Cases"
          hint={`${checked.size} of ${cases.length} selected`}
        >
          <div className="border border-gray-600 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 p-2 border-b border-gray-600 bg-gray-700/50">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search cases"
                  className="w-full pl-7 pr-2 py-1 rounded-md bg-gray-700 border border-gray-600 text-[12px] outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[11px] font-medium text-blue-400 hover:text-blue-300 flex-shrink-0"
              >
                {checked.size === cases.length ? 'Select none' : 'Select all'}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filteredCases.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] hover:bg-gray-650 cursor-pointer border-b border-gray-100 last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={checked.has(c.id)}
                    onChange={() => toggleCase(c.id)}
                    className="accent-blue-500"
                  />
                  <span className="text-[11px] font-mono text-blue-500 flex-shrink-0">{c.human_id}</span>
                  <span className="truncate">{c.title}</span>
                </label>
              ))}
              {filteredCases.length === 0 && (
                <p className="text-[12px] text-gray-500 text-center py-4">No matching cases</p>
              )}
            </div>
          </div>
        </FormField>

        <FormField label="Assign all cases to" hint="Optional — you can reassign individual cases later">
          <select value={assignToId} onChange={(e) => setAssignToId(e.target.value)} className={inputClass}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </FormField>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 py-2 rounded-md text-[13px] font-semibold text-white"
        >
          {saving ? 'Creating…' : 'Create Test Run'}
        </button>
      </form>
    </Modal>
  )
}
