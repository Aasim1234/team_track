import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

function daysBetween(a, b) {
  return Math.ceil((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24))
}

export default function SprintBar({ projectId, activeSprintId, onSprintChange }) {
  const [sprints, setSprints] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [issueCounts, setIssueCounts] = useState({ total: 0, done: 0 })

  const fetchSprints = async () => {
    const { data } = await supabase
      .from('sprints')
      .select('*')
      .eq('project_id', projectId)
      .order('start_date', { ascending: false })
    setSprints(data || [])
  }

  useEffect(() => {
    fetchSprints()
  }, [projectId])

  useEffect(() => {
    const fetchCounts = async () => {
      if (!activeSprintId) {
        setIssueCounts({ total: 0, done: 0 })
        return
      }
      const { data } = await supabase
        .from('issues')
        .select('status')
        .eq('sprint_id', activeSprintId)
      const total = data?.length || 0
      const done = data?.filter((i) => i.status === 'done').length || 0
      setIssueCounts({ total, done })
    }
    fetchCounts()
  }, [activeSprintId])

  const handleCreateSprint = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('sprints').insert({
      project_id: projectId,
      name,
      start_date: startDate,
      end_date: endDate,
      status: 'planned',
    })
    if (!error) {
      setName('')
      setStartDate('')
      setEndDate('')
      setShowForm(false)
      fetchSprints()
    } else {
      alert(error.message)
    }
  }

  const handleStartSprint = async (sprintId) => {
    // enforce single active sprint: complete any currently active one first
    const current = sprints.find((s) => s.status === 'active')
    if (current) {
      await supabase.from('sprints').update({ status: 'completed' }).eq('id', current.id)
    }
    await supabase.from('sprints').update({ status: 'active' }).eq('id', sprintId)
    fetchSprints()
    onSprintChange(sprintId)
  }

  const handleCompleteSprint = async (sprintId) => {
    await supabase.from('sprints').update({ status: 'completed' }).eq('id', sprintId)
    fetchSprints()
    onSprintChange(null)
  }

  const activeSprint = sprints.find((s) => s.id === activeSprintId)
  const plannedSprints = sprints.filter((s) => s.status === 'planned')
  const pastSprints = sprints.filter((s) => s.status === 'completed')

  const today = new Date().toISOString().split('T')[0]
  const daysTotal = activeSprint ? daysBetween(activeSprint.start_date, activeSprint.end_date) : 0
  const daysLeft = activeSprint ? Math.max(0, daysBetween(today, activeSprint.end_date)) : 0
  const percentDone = issueCounts.total > 0 ? Math.round((issueCounts.done / issueCounts.total) * 100) : 0

  return (
    <div className="bg-gray-800 rounded-lg p-4 mx-6 mt-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onSprintChange(null)}
            className={`px-3 py-1 rounded text-sm font-semibold ${
              activeSprintId === null ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            Backlog
          </button>

          {activeSprint && (
            <button
              onClick={() => onSprintChange(activeSprint.id)}
              className={`px-3 py-1 rounded text-sm font-semibold ${
                activeSprintId === activeSprint.id ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'
              }`}
            >
              🏃 {activeSprint.name} (Active)
            </button>
          )}

          {pastSprints.map((s) => (
            <button
              key={s.id}
              onClick={() => onSprintChange(s.id)}
              className={`px-3 py-1 rounded text-sm ${
                activeSprintId === s.id ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'
              }`}
            >
              {s.name} (Completed)
            </button>
          ))}

          {plannedSprints.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => onSprintChange(s.id)}
                className={`px-3 py-1 rounded text-sm ${
                  activeSprintId === s.id ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'
                }`}
              >
                {s.name} (Planned)
              </button>
              <button
                onClick={() => handleStartSprint(s.id)}
                className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
              >
                Start
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {activeSprint && activeSprintId === activeSprint.id && (
            <button
              onClick={() => handleCompleteSprint(activeSprint.id)}
              className="text-xs bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-semibold"
            >
              Complete Sprint
            </button>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
          >
            + New Sprint
          </button>
        </div>
      </div>

      {activeSprint && activeSprintId === activeSprint.id && (
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{issueCounts.done}/{issueCounts.total} issues done</span>
              <span>{percentDone}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${percentDone}%` }}
              ></div>
            </div>
          </div>
          <span className="text-xs text-gray-400">
            📅 {daysLeft} of {daysTotal} days left
          </span>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreateSprint} className="mt-4 flex gap-3 items-end flex-wrap border-t border-gray-700 pt-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Sprint Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Sprint 1"
              className="px-3 py-2 rounded bg-gray-700 outline-none text-sm w-40"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="px-3 py-2 rounded bg-gray-700 outline-none text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className="px-3 py-2 rounded bg-gray-700 outline-none text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold text-sm"
          >
            Create
          </button>
        </form>
      )}
    </div>
  )
}
