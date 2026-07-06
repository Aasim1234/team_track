import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function Dashboard() {
  const [projects, setProjects] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setProjects(data)
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('projects').insert({
      name,
      key: key.toUpperCase(),
      created_by: user.id,
    })
    if (!error) {
      setName('')
      setKey('')
      setShowForm(false)
      fetchProjects()
    } else {
      alert(error.message)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <nav className="flex justify-between items-center px-8 py-4 bg-gray-800">
        <h1 className="text-xl font-bold">Team Tracker</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-300 hover:text-white"
        >
          Logout
        </button>
      </nav>

      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Projects</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold"
          >
            + New Project
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="bg-gray-800 p-4 rounded mb-6 flex gap-3 items-end"
          >
            <div>
              <label className="text-sm text-gray-400 block mb-1">Project Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="px-3 py-2 rounded bg-gray-700 outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Key (e.g. DEV)</label>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
                maxLength={5}
                className="px-3 py-2 rounded bg-gray-700 outline-none w-24"
              />
            </div>
            <button
              type="submit"
              className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold"
            >
              Create
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/project/${p.id}`)}
              className="bg-gray-800 hover:bg-gray-700 cursor-pointer p-5 rounded-lg"
            >
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                {p.key}
              </span>
              <h3 className="text-lg font-semibold mt-2">{p.name}</h3>
            </div>
          ))}
          {projects.length === 0 && (
            <p className="text-gray-500">No projects yet — create one above.</p>
          )}
        </div>
      </div>
    </div>
  )
}