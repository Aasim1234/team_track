import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function ProjectDocs({ projectId }) {
  const { user } = useAuth()
  const [docs, setDocs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const fetchDocs = async () => {
    const { data } = await supabase
      .from('project_docs')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
    setDocs(data || [])
    return data || []
  }

  useEffect(() => {
    fetchDocs()
    setSelectedId(null)
  }, [projectId])

  const openDoc = (doc) => {
    if (dirty && !confirm('Discard unsaved changes?')) return
    setSelectedId(doc.id)
    setTitle(doc.title)
    setBody(doc.body || '')
    setDirty(false)
  }

  const handleNew = async () => {
    const { data: doc, error } = await supabase
      .from('project_docs')
      .insert({ project_id: projectId, title: 'Untitled', body: '', created_by: user.id })
      .select()
      .single()
    if (error) {
      alert(error.message)
      return
    }
    await fetchDocs()
    setSelectedId(doc.id)
    setTitle(doc.title)
    setBody('')
    setDirty(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('project_docs')
      .update({ title, body, updated_at: new Date().toISOString() })
      .eq('id', selectedId)
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setDirty(false)
    fetchDocs()
  }

  const handleDelete = async (docId) => {
    if (!confirm('Delete this document?')) return
    await supabase.from('project_docs').delete().eq('id', docId)
    if (selectedId === docId) {
      setSelectedId(null)
      setDirty(false)
    }
    fetchDocs()
  }

  return (
    <div className="p-6 flex gap-5 items-start">
      {/* Doc list */}
      <div className="w-64 flex-shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-gray-300 uppercase">Docs</h3>
          <button
            onClick={handleNew}
            className="bg-green-500 hover:bg-green-600 px-2.5 py-1 rounded font-semibold text-xs"
          >
            + New
          </button>
        </div>
        <div className="space-y-1">
          {docs.map((d) => (
            <div
              key={d.id}
              onClick={() => openDoc(d)}
              className={`px-3 py-2 rounded cursor-pointer group flex items-center gap-2 ${
                selectedId === d.id ? 'bg-gray-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              <span className="flex-shrink-0">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{d.title}</p>
                <p className="text-[10px] text-gray-500">
                  {new Date(d.updated_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(d.id)
                }}
                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
          {docs.length === 0 && (
            <p className="text-xs text-gray-500 px-1">No docs yet — create the first one.</p>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <div className="bg-gray-800 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setDirty(true)
                }}
                className="flex-1 bg-transparent text-xl font-bold outline-none border-b border-transparent focus:border-gray-600 pb-1"
                placeholder="Document title"
              />
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="bg-green-500 hover:bg-green-600 disabled:opacity-40 px-4 py-1.5 rounded font-semibold text-sm flex-shrink-0"
              >
                {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
              </button>
            </div>
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                setDirty(true)
              }}
              rows={18}
              placeholder="Write your notes, specs, meeting minutes..."
              className="w-full bg-gray-900/60 rounded p-4 text-sm outline-none resize-y leading-relaxed"
            />
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-10 text-center text-gray-500 text-sm">
            Select a doc on the left, or create a new one.
          </div>
        )}
      </div>
    </div>
  )
}
