import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function ProjectCode({ projectId }) {
  const { user } = useAuth()
  const [repos, setRepos] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  const fetchRepos = async () => {
    const { data } = await supabase
      .from('project_repos')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at')
    setRepos(data || [])
  }

  useEffect(() => {
    fetchRepos()
  }, [projectId])

  const handleAdd = async (e) => {
    e.preventDefault()
    const cleanUrl = url.trim()
    if (!/^https?:\/\//i.test(cleanUrl)) {
      alert('URL must start with http:// or https://')
      return
    }
    const { error } = await supabase.from('project_repos').insert({
      project_id: projectId,
      name: name.trim(),
      url: cleanUrl,
      created_by: user.id,
    })
    if (error) {
      alert(error.message)
      return
    }
    setName('')
    setUrl('')
    setShowForm(false)
    fetchRepos()
  }

  const handleDelete = async (repoId) => {
    if (!confirm('Remove this repository link?')) return
    await supabase.from('project_repos').delete().eq('id', repoId)
    fetchRepos()
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Linked repositories</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded font-semibold text-sm"
        >
          + Link repository
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-gray-800 p-4 rounded mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm text-gray-400 block mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. team-tracker"
              className="px-3 py-2 rounded bg-gray-700 outline-none"
            />
          </div>
          <div className="flex-1 min-w-64">
            <label className="text-sm text-gray-400 block mb-1">URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://github.com/you/repo"
              className="px-3 py-2 rounded bg-gray-700 outline-none w-full"
            />
          </div>
          <button
            type="submit"
            className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold"
          >
            Add
          </button>
        </form>
      )}

      <div className="space-y-2">
        {repos.map((r) => (
          <div key={r.id} className="bg-gray-800 rounded-lg p-4 flex items-center gap-3 group">
            <span className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
              {'</>'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{r.name}</p>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline truncate block"
              >
                {r.url}
              </a>
            </div>
            <button
              onClick={() => handleDelete(r.id)}
              className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 text-sm"
            >
              ✕
            </button>
          </div>
        ))}
        {repos.length === 0 && (
          <p className="text-gray-500 text-sm">
            No repositories linked yet — connect your GitHub/GitLab repos so the team can find the code.
          </p>
        )}
      </div>
    </div>
  )
}
