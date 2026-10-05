import { useEffect, useState } from 'react'
import { Tag, Pencil, Trash2, Check, X, Plus, RotateCcw, Archive, Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Modal from './ui/Modal'
import FormField, { inputClass } from './ui/FormField'
import PrimaryButton from './ui/Button'
import { useToast } from './ui/Toast'
import { usePermissions } from '../hooks/usePermissions'

// Release versions are their own records (release_versions), so one release
// can hold many test plans. The database enforces who may create or change
// them (Manage Release Versions) and logs every change.

const NEW_RELEASE = '__new'

// Newest first, comparing numbers as numbers: 12.71 before 12.70, 12.10 after 12.9.
export const sortReleases = (list) =>
  [...(list || [])].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }))

// "1 result" / "299 results"
const fmtCount = (n, word) => `${(n ?? 0).toLocaleString()} ${word}${n === 1 ? '' : 's'}`

const friendlyError = (error) =>
  error?.code === '23505' ? 'That release version already exists in this project.' : error?.message

async function createRelease(projectId, name) {
  const { data, error } = await supabase
    .from('release_versions')
    .insert({ project_id: projectId, name: name.trim() })
    .select('id, name')
    .single()
  return { data, error: error ? friendlyError(error) : null }
}

// Turns the picker's value into a release id, creating the release first when
// the user typed a new one.
export async function resolveReleaseId(projectId, value, newName) {
  if (value !== NEW_RELEASE) return { id: value }
  const { data, error } = await createRelease(projectId, newName)
  return error ? { error } : { id: data.id, name: data.name }
}

// Compact "Release Version 12.70" label, with an edit pencil when allowed.
export function ReleaseBadge({ name, onEdit }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] whitespace-nowrap ${
        name ? 'border-blue-500/30 bg-blue-500/10' : 'border-amber-500/30 bg-amber-500/10'
      }`}
    >
      <Tag size={12} className={name ? 'text-blue-400' : 'text-amber-500'} />
      <span className="text-gray-400">Release Version</span>
      <span className={`font-semibold ${name ? 'text-blue-400' : 'text-amber-500'}`}>{name || 'Not set'}</span>
      {onEdit && (
        <button onClick={onEdit} title="Edit Release Version" aria-label="Edit Release Version" className="text-gray-400 hover:text-white">
          <Pencil size={11} />
        </button>
      )}
    </span>
  )
}

// Choose an existing release version, or type a new one (Manage Release Versions only).
export function ReleaseVersionField({ releases, value, onChange, newName, onNewName, label = 'Release Version' }) {
  const { can } = usePermissions()
  const canManage = can('releases.manage')
  const sorted = sortReleases(releases)
  return (
    <FormField
      label={label}
      required
      hint={!sorted.length && !canManage ? 'No release versions yet — ask an Admin or Manager to create one.' : 'Which software release this test plan is testing.'}
    >
      <div className="flex gap-2">
        <select value={value} onChange={(e) => onChange(e.target.value)} required className={inputClass}>
          <option value="">Choose a release version…</option>
          {sorted.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          {canManage && <option value={NEW_RELEASE}>+ New release version…</option>}
        </select>
        {value === NEW_RELEASE && (
          <input
            value={newName}
            onChange={(e) => onNewName(e.target.value)}
            required
            autoFocus
            placeholder="e.g. 12.70"
            className={`${inputClass} w-40`}
          />
        )}
      </div>
    </FormField>
  )
}

export function ChangeReleaseModal({ open, onClose, plan, projectId, releases, onSaved }) {
  const toast = useToast()
  const [value, setValue] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  // What this release has done so far, and what other releases of this plan
  // still hold — so the dialog can say exactly what is kept and what returns.
  const [current, setCurrent] = useState(null)
  const [saved, setSaved] = useState([])

  useEffect(() => {
    if (!open || !plan) return
    setValue(plan.release_version_id || '')
    setNewName('')
    setSaving(false)
    setCurrent(null)
    setSaved([])
    let cancelled = false
    const rows = () => supabase.from('vms_test_plan_rows').select('id', { count: 'exact', head: true }).eq('plan_id', plan.id)
    Promise.all([
      rows(),
      rows().neq('result', 'not_tested'),
      rows().not('assigned_to', 'is', null),
      supabase.rpc('plan_release_contexts', { p_plan_id: plan.id }),
    ]).then(([total, executed, assigned, contexts]) => {
      if (cancelled) return
      setCurrent({ cases: total.count || 0, executed: executed.count || 0, assigned: assigned.count || 0 })
      setSaved(contexts.data || [])
    })
    return () => { cancelled = true }
  }, [open, plan])

  const finished = ['pass', 'discard'].includes(plan?.status)
  const target = saved.find((s) => s.releaseId === value)

  const submit = async (e) => {
    e.preventDefault()
    if (!plan || saving) return
    if (value === plan.release_version_id) { onClose(); return }
    setSaving(true)
    const resolved = await resolveReleaseId(projectId, value, newName)
    if (resolved.error) { setSaving(false); toast.error(resolved.error); return }
    // One call does the whole switch: save this release's work, clear every
    // test case for the new release, and bring back that release's own work.
    const { data, error } = await supabase.rpc('change_plan_release', {
      p_plan_id: plan.id,
      p_release_version_id: resolved.id,
    })
    setSaving(false)
    if (error) {
      toast.error(error.message || "You don't have permission to change this test plan's release version.")
      return
    }
    const name = data?.release || resolved.name || releases.find((r) => r.id === resolved.id)?.name
    if (data?.restored) {
      toast.success(`Now testing release ${name} — its ${fmtCount(data.restoredResults, 'result')} and ${fmtCount(data.restoredAssignments, 'assignment')} are back`)
    } else {
      toast.success(`Now testing release ${name} — ${fmtCount(data?.cases ?? 0, 'test case')} start as Not Tested`)
    }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Release Version">
      {plan && (
        <form onSubmit={submit} className="space-y-3.5">
          <div className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-[12px]">
            <p className="text-gray-500">Test Plan</p>
            <p className="text-white font-semibold">{plan.name}</p>
            <p className="text-gray-400 mt-0.5">Current release version: <span className="text-white font-medium">{plan.release?.name || 'Not set'}</span></p>
          </div>
          <ReleaseVersionField
            label="New release version"
            releases={releases}
            value={value}
            onChange={setValue}
            newName={newName}
            onNewName={setNewName}
          />

          {/* A release version is a fresh round of testing, so the new release
              starts from nothing while the old one keeps what it earned. */}
          {value && value !== plan.release_version_id && (
            <div className="space-y-2">
              <p className="flex items-start gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-2 text-[11px] text-gray-300">
                <RotateCcw size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <span>
                  {current
                    ? `All ${fmtCount(current.cases, 'test case')} stay in this plan and start as Not Tested, with nobody assigned and no To-Do tasks.`
                    : 'Every test case stays in this plan and starts as Not Tested, with nobody assigned and no To-Do tasks.'}
                </span>
              </p>
              {current && (current.executed > 0 || current.assigned > 0) && plan.release?.name && (
                <p className="flex items-start gap-1.5 rounded-md border border-gray-600 bg-gray-700 px-2.5 py-2 text-[11px] text-gray-300">
                  <Archive size={12} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <span>
                    Release <span className="text-white font-medium">{plan.release.name}</span> keeps its {fmtCount(current.executed, 'result')} and{' '}
                    {fmtCount(current.assigned, 'assignment')} — they come back if you move this plan to {plan.release.name} again.
                    {!finished && ' Its release report is only written when the plan is marked Pass or Discard.'}
                  </span>
                </p>
              )}
              {target && (
                <p className="flex items-start gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2 text-[11px] text-gray-300">
                  <Undo2 size={12} className="text-green-500 mt-0.5 flex-shrink-0" />
                  <span>
                    This plan was on <span className="text-white font-medium">{target.release}</span> before, so its {fmtCount(target.executed, 'result')} and{' '}
                    {fmtCount(target.assigned, 'assignment')} come back instead of a clean start.
                  </span>
                </p>
              )}
              {finished && (
                <p className="text-[11px] text-gray-500">
                  This plan is marked {plan.status === 'pass' ? 'Pass' : 'Discard'} for release {plan.release?.name}. That release report stays in Reports,
                  and the plan starts as Active in the new release version.
                </p>
              )}
            </div>
          )}

          <PrimaryButton type="submit" disabled={saving || !value}>
            {saving ? 'Saving…' : 'Save Release Version'}
          </PrimaryButton>
        </form>
      )}
    </Modal>
  )
}

// Add, rename and delete a project's release versions.
export function ManageReleasesModal({ open, onClose, projectId, releases, plans, onChanged }) {
  const toast = useToast()
  const [adding, setAdding] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setAdding(''); setEditingId(null); setBusy(false) }
  }, [open])

  const planCount = (id) => plans.filter((p) => p.release_version_id === id).length

  const add = async (e) => {
    e.preventDefault()
    if (!adding.trim() || busy) return
    setBusy(true)
    const { error } = await createRelease(projectId, adding)
    setBusy(false)
    if (error) { toast.error(error); return }
    toast.success(`Release version ${adding.trim()} created`)
    setAdding('')
    onChanged()
  }

  const rename = async (release) => {
    const name = editName.trim()
    if (!name || name === release.name) { setEditingId(null); return }
    const count = planCount(release.id)
    if (count && !confirm(`Rename release version ${release.name} to ${name}? ${count} test plan${count === 1 ? '' : 's'} will show ${name}.`)) return
    setBusy(true)
    const { data, error } = await supabase.from('release_versions').update({ name }).eq('id', release.id).select('id')
    setBusy(false)
    if (error || !data?.length) { toast.error(friendlyError(error) || "You don't have permission to rename release versions."); return }
    toast.success(`Release version renamed to ${name}`)
    setEditingId(null)
    onChanged()
  }

  const remove = async (release) => {
    if (!confirm(`Delete release version ${release.name}?`)) return
    setBusy(true)
    const { data, error } = await supabase.from('release_versions').delete().eq('id', release.id).select('id')
    setBusy(false)
    if (error || !data?.length) { toast.error(error?.message || "You don't have permission to delete release versions."); return }
    toast.success(`Release version ${release.name} deleted`)
    onChanged()
  }

  return (
    <Modal open={open} onClose={onClose} title="Release Versions">
      <div className="space-y-3">
        <form onSubmit={add} className="flex gap-2">
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="New release version, e.g. 12.71" className={inputClass} />
          <button type="submit" disabled={!adding.trim() || busy} className="flex items-center gap-1 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white px-3 rounded-md text-[12px] font-semibold whitespace-nowrap">
            <Plus size={13} /> Add
          </button>
        </form>

        <div className="space-y-1.5">
          {sortReleases(releases).map((r) => {
            const count = planCount(r.id)
            return (
              <div key={r.id} className="flex items-center gap-2 rounded-md border border-gray-600 bg-gray-700 px-2.5 py-1.5">
                <Tag size={12} className="text-blue-400 flex-shrink-0" />
                {editingId === r.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') rename(r); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                    className={`${inputClass} py-1`}
                  />
                ) : (
                  <span className="text-[13px] font-semibold text-white flex-1">{r.name}</span>
                )}
                <span className="text-[11px] text-gray-500 whitespace-nowrap">{count} test plan{count === 1 ? '' : 's'}</span>
                {editingId === r.id ? (
                  <>
                    <button onClick={() => rename(r)} disabled={busy} title="Save" className="p-1 text-green-500 hover:text-green-400"><Check size={13} /></button>
                    <button onClick={() => setEditingId(null)} title="Cancel" className="p-1 text-gray-400 hover:text-white"><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditingId(r.id); setEditName(r.name) }} title="Rename" className="p-1 text-gray-400 hover:text-white"><Pencil size={12} /></button>
                    <button
                      onClick={() => remove(r)}
                      disabled={busy || count > 0}
                      title={count > 0 ? 'Move its test plans to another release version before deleting it' : 'Delete'}
                      className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            )
          })}
          {!releases.length && <p className="text-[12px] text-gray-500">No release versions yet.</p>}
        </div>
      </div>
    </Modal>
  )
}
