import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import EnterpriseTable from '../../components/ui/EnterpriseTable'
import Modal from '../../components/ui/Modal'
import FormField, { inputClass } from '../../components/ui/FormField'

export default function AdminProjectsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)

  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const fetchProjects = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('*, project_members(count), creator:profiles!created_by(name)')
      .order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('projects').insert({ name, key: key.toUpperCase(), created_by: user.id })
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setName('')
    setKey('')
    setShowCreate(false)
    fetchProjects()
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase
      .from('projects')
      .update({ name: editing.name, key: editing.key.toUpperCase(), description: editing.description })
      .eq('id', editing.id)
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setEditing(null)
    fetchProjects()
  }

  const handleDelete = async () => {
    if (deleteConfirmText !== deleteTarget.key) return
    await supabase.from('projects').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    setDeleteConfirmText('')
    fetchProjects()
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Projects' }]} />
        <PageHeader
          title="Projects"
          subtitle="Every project in this workspace"
          actions={
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
            >
              <Plus size={14} /> Add Project
            </button>
          }
        />

        <div className="p-6">
          <EnterpriseTable
            loading={loading}
            rows={projects}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/project/${p.id}/overview`)}
            columns={[
              {
                key: 'name',
                label: 'Project',
                render: (p) => (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{p.key}</span>
                    <span className="text-white font-medium">{p.name}</span>
                  </div>
                ),
              },
              { key: 'creator', label: 'Created By', render: (p) => p.creator?.name || '—' },
              {
                key: 'members',
                label: 'Members',
                render: (p) => p.project_members?.[0]?.count ?? 0,
              },
              {
                key: 'created_at',
                label: 'Created',
                render: (p) => new Date(p.created_at).toLocaleDateString(),
              },
              {
                key: 'actions',
                label: '',
                width: '90px',
                render: (p) => (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditing({ ...p })}
                      title="Edit"
                      className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-650"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      title="Delete"
                      className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-650"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Project">
        <form onSubmit={handleCreate} className="space-y-3.5">
          <FormField label="Project name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputClass} />
          </FormField>
          <FormField label="Key" required hint="Short uppercase code, e.g. VMS">
            <input value={key} onChange={(e) => setKey(e.target.value)} required maxLength={5} className={`${inputClass} w-28 uppercase`} />
          </FormField>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 py-2 rounded-md text-[13px] font-semibold text-white"
          >
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Project">
        {editing && (
          <form onSubmit={handleSaveEdit} className="space-y-3.5">
            <FormField label="Project name" required>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
                className={inputClass}
              />
            </FormField>
            <FormField label="Key" required>
              <input
                value={editing.key}
                onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                required
                maxLength={5}
                className={`${inputClass} w-28 uppercase`}
              />
            </FormField>
            <FormField label="Description">
              <textarea
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                rows={3}
                className={`${inputClass} resize-y`}
              />
            </FormField>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 py-2 rounded-md text-[13px] font-semibold text-white"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteConfirmText('') }}
        title="Delete Project"
      >
        {deleteTarget && (
          <div className="space-y-3">
            <p className="text-[13px] text-gray-300">
              This permanently deletes <span className="font-semibold text-white">{deleteTarget.name}</span> and all
              of its test suites, cases, issues, and history. This cannot be undone.
            </p>
            <FormField label={`Type "${deleteTarget.key}" to confirm`}>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </FormField>
            <button
              onClick={handleDelete}
              disabled={deleteConfirmText !== deleteTarget.key}
              className="w-full bg-red-500 hover:bg-red-400 disabled:opacity-40 py-2 rounded-md text-[13px] font-semibold text-white"
            >
              Delete Project
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
