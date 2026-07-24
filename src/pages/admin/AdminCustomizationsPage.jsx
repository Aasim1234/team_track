import { useState, useEffect } from 'react'
import { Tag, Plus, Trash2, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { COLOR_MAP } from '../../lib/statusConfig'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import EnterpriseTable from '../../components/ui/EnterpriseTable'
import EmptyState from '../../components/ui/EmptyState'
import Modal from '../../components/ui/Modal'
import FormField, { inputClass } from '../../components/ui/FormField'

const COLOR_OPTIONS = Object.keys(COLOR_MAP)

export default function AdminCustomizationsPage() {
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('blue')
  const [saving, setSaving] = useState(false)

  const fetchLabels = async () => {
    setLoading(true)
    const { data } = await supabase.from('label_definitions').select('*').order('name')
    setLabels(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchLabels()
  }, [])

  const openCreate = () => {
    setName('')
    setColor('blue')
    setShowCreate(true)
  }

  const openEdit = (l) => {
    setEditing(l)
    setName(l.name)
    setColor(l.color)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('label_definitions').insert({ name: name.trim(), color })
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setShowCreate(false)
    fetchLabels()
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase
      .from('label_definitions')
      .update({ name: name.trim(), color })
      .eq('id', editing.id)
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setEditing(null)
    fetchLabels()
  }

  const handleDelete = async (l) => {
    if (!confirm(`Delete the "${l.name}" label? Issues already tagged with it will keep the tag text, but it won't be selectable for new issues.`)) return
    await supabase.from('label_definitions').delete().eq('id', l.id)
    fetchLabels()
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Customizations' }]} />
        <PageHeader
          title="Customizations"
          subtitle="Manage the shared issue label vocabulary"
          actions={
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
            >
              <Plus size={14} /> Add Label
            </button>
          }
        />

        <div className="p-6">
          <EnterpriseTable
            loading={loading}
            rows={labels}
            rowKey={(l) => l.id}
            emptyState={
              <EmptyState icon={Tag} title="No labels defined" description="Add a label so it becomes selectable when creating issues." />
            }
            columns={[
              {
                key: 'name',
                label: 'Label',
                render: (l) => (
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${COLOR_MAP[l.color]?.dot}`} />
                    <span className="text-white font-medium">{l.name}</span>
                  </span>
                ),
              },
              { key: 'color', label: 'Color', render: (l) => <span className="capitalize">{l.color}</span> },
              { key: 'created_at', label: 'Created', render: (l) => new Date(l.created_at).toLocaleDateString() },
              {
                key: 'actions',
                label: '',
                width: '90px',
                render: (l) => (
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(l)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-650">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(l)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-650">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ),
              },
            ]}
          />

          <p className="text-[11px] text-gray-500 mt-4 max-w-lg">
            Custom fields, statuses, and templates aren't built yet — those need new schema (a generic
            custom-fields table plus form-rendering support wherever fields are edited) beyond this label list.
          </p>
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Label">
        <form onSubmit={handleCreate} className="space-y-3.5">
          <FormField label="Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputClass} />
          </FormField>
          <FormField label="Color">
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full ${COLOR_MAP[c].bar} ${color === c ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-white' : ''}`}
                  title={c}
                />
              ))}
            </div>
          </FormField>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 py-2 rounded-md text-[13px] font-semibold text-white"
          >
            {saving ? 'Creating…' : 'Create Label'}
          </button>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Label">
        {editing && (
          <form onSubmit={handleSaveEdit} className="space-y-3.5">
            <FormField label="Name" required>
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
            </FormField>
            <FormField label="Color">
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full ${COLOR_MAP[c].bar} ${color === c ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-white' : ''}`}
                    title={c}
                  />
                ))}
              </div>
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
    </div>
  )
}
