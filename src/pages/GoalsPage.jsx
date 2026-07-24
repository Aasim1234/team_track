import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'

const STATUS_OPTIONS = [
  { value: 'on_track', label: 'On track', classes: 'bg-green-500/20 text-green-400' },
  { value: 'at_risk', label: 'At risk', classes: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'off_track', label: 'Off track', classes: 'bg-red-500/20 text-red-400' },
  { value: 'done', label: 'Done', classes: 'bg-blue-500/20 text-blue-400' },
]

export default function GoalsPage() {
  const { user } = useAuth()

  const [goals, setGoals] = useState([])
  const [projects, setProjects] = useState([])

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [targetDate, setTargetDate] = useState('')

  const fetchGoals = async () => {
    const { data } = await supabase
      .from('goals')
      .select('*, owner:profiles(name), project:projects(name, key)')
      .order('created_at', { ascending: false })
    setGoals(data || [])
  }

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('id, name, key').order('name')
    setProjects(data || [])
  }

  useEffect(() => {
    fetchGoals()
    fetchProjects()
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('goals').insert({
      name,
      project_id: projectId || null,
      target_date: targetDate || null,
      owner_id: user.id,
    })
    if (error) {
      alert(error.message)
      return
    }
    setName('')
    setProjectId('')
    setTargetDate('')
    setShowForm(false)
    fetchGoals()
  }

  const updateGoal = async (goalId, fields) => {
    // Optimistic update so sliders feel responsive
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, ...fields } : g)))
    await supabase.from('goals').update(fields).eq('id', goalId)
  }

  const handleDelete = async (goalId) => {
    if (!confirm('Delete this goal?')) return
    await supabase.from('goals').delete().eq('id', goalId)
    fetchGoals()
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />

      <div className="flex-1 min-w-0">
        <AppHeader
          breadcrumb={[{ label: 'My Workspace' }, { label: 'Goals' }]}
          onQuickCreate={() => setShowForm(true)}
          quickCreateLabel="New Goal"
        />

        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Team goals</h2>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold"
            >
              + New Goal
            </button>
          </div>

          {showForm && (
            <form
              onSubmit={handleCreate}
              className="bg-gray-800 p-4 rounded mb-6 flex flex-wrap gap-3 items-end"
            >
              <div className="flex-1 min-w-56">
                <label className="text-sm text-gray-400 block mb-1">Goal</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Ship v2 onboarding"
                  className="px-3 py-2 rounded bg-gray-700 outline-none w-full"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Project (optional)</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="px-3 py-2 rounded bg-gray-700 outline-none"
                >
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.key} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Target date</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="px-3 py-2 rounded bg-gray-700 outline-none"
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

          <div className="space-y-3">
            {goals.map((g) => {
              const status =
                STATUS_OPTIONS.find((s) => s.value === g.status) || STATUS_OPTIONS[0]
              const overdue =
                g.target_date && g.status !== 'done' && new Date(g.target_date) < new Date()
              return (
                <div key={g.id} className="bg-gray-800 rounded-lg p-4 group">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold flex-1 min-w-40">{g.name}</span>
                    {g.project && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                        {g.project.key}
                      </span>
                    )}
                    <select
                      value={g.status}
                      onChange={(e) => updateGoal(g.id, { status: e.target.value })}
                      className={`text-xs px-2 py-1 rounded outline-none cursor-pointer ${status.classes}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value} className="bg-gray-800 text-white">
                          {s.label}
                        </option>
                      ))}
                    </select>
                    {g.target_date && (
                      <span className={`text-xs ${overdue ? 'text-red-400' : 'text-gray-400'}`}>
                        🎯 {g.target_date}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{g.owner?.name}</span>
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={g.progress ?? 0}
                      onChange={(e) => updateGoal(g.id, { progress: Number(e.target.value) })}
                      className="flex-1 accent-green-500"
                    />
                    <div className="w-40 bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${g.progress ?? 0}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-400 w-9 text-right">
                      {g.progress ?? 0}%
                    </span>
                  </div>
                </div>
              )
            })}
            {goals.length === 0 && (
              <p className="text-gray-500">No goals yet — create one above.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
