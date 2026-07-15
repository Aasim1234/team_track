import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AppSidebar from '../components/AppSidebar'
import TopNav from '../components/TopNav'

const DAY_MS = 24 * 60 * 60 * 1000

function monthsBetween(start, end) {
  const months = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor <= end) {
    months.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

const SPRINT_COLORS = {
  planned: 'bg-blue-500/70',
  active: 'bg-green-500/70',
  completed: 'bg-gray-500/70',
}

export default function PlansPage() {
  const { user } = useAuth()

  const [plans, setPlans] = useState([])
  const [projects, setProjects] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [sprints, setSprints] = useState([])

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [checkedIds, setCheckedIds] = useState(new Set())

  const fetchPlans = async () => {
    const { data } = await supabase
      .from('plans')
      .select('*, plan_projects(project_id)')
      .order('created_at', { ascending: false })
    setPlans(data || [])
  }

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('id, name, key').order('name')
    setProjects(data || [])
  }

  useEffect(() => {
    fetchPlans()
    fetchProjects()
  }, [])

  const openPlan = async (plan) => {
    setSelectedPlan(plan)
    const projectIds = (plan.plan_projects || []).map((pp) => pp.project_id)
    if (projectIds.length === 0) {
      setSprints([])
      return
    }
    const { data } = await supabase
      .from('sprints')
      .select('*')
      .in('project_id', projectIds)
      .order('start_date')
    setSprints(data || [])
  }

  const selectedProjectIds = (selectedPlan?.plan_projects || []).map((pp) => pp.project_id)
  const planProjects = projects.filter((p) => selectedProjectIds.includes(p.id))

  const toggleChecked = (projectId) => {
    const next = new Set(checkedIds)
    if (next.has(projectId)) next.delete(projectId)
    else next.add(projectId)
    setCheckedIds(next)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    const { data: plan, error } = await supabase
      .from('plans')
      .insert({ name, created_by: user.id })
      .select()
      .single()
    if (error) {
      alert(error.message)
      return
    }
    if (checkedIds.size > 0) {
      await supabase
        .from('plan_projects')
        .insert([...checkedIds].map((pid) => ({ plan_id: plan.id, project_id: pid })))
    }
    setName('')
    setCheckedIds(new Set())
    setShowForm(false)
    fetchPlans()
  }

  const handleDelete = async (e, planId) => {
    e.stopPropagation()
    if (!confirm('Delete this plan? Projects and sprints are not affected.')) return
    await supabase.from('plans').delete().eq('id', planId)
    if (selectedPlan?.id === planId) setSelectedPlan(null)
    fetchPlans()
  }

  // Timeline range: pad to full months around all sprint dates
  const dates = sprints.flatMap((s) => [new Date(s.start_date), new Date(s.end_date)])
  const rangeStart = dates.length
    ? new Date(Math.min(...dates).getFullYear(), Math.min(...dates).getMonth(), 1)
    : null
  const rawEnd = dates.length ? new Date(Math.max(...dates)) : null
  const rangeEnd = rawEnd ? new Date(rawEnd.getFullYear(), rawEnd.getMonth() + 1, 0) : null
  const totalDays = rangeStart ? (rangeEnd - rangeStart) / DAY_MS : 0
  const months = rangeStart ? monthsBetween(rangeStart, rangeEnd) : []
  const today = new Date()
  const todayPct =
    rangeStart && today >= rangeStart && today <= rangeEnd
      ? ((today - rangeStart) / DAY_MS / totalDays) * 100
      : null

  const barStyle = (sprint) => {
    const start = (new Date(sprint.start_date) - rangeStart) / DAY_MS
    const days = (new Date(sprint.end_date) - new Date(sprint.start_date)) / DAY_MS + 1
    return {
      left: `${(start / totalDays) * 100}%`,
      width: `${Math.max((days / totalDays) * 100, 2)}%`,
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AppSidebar />

      <div className="flex-1 min-w-0">
        <TopNav
          breadcrumb={[{ label: 'My Workspace' }, { label: 'Plans' }]}
          onQuickCreate={() => setShowForm(true)}
          quickCreateLabel="New Plan"
        />

        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Cross-project timelines</h2>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold"
            >
              + New Plan
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} className="bg-gray-800 p-4 rounded mb-6">
              <div className="mb-3">
                <label className="text-sm text-gray-400 block mb-1">Plan Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="px-3 py-2 rounded bg-gray-700 outline-none w-72"
                />
              </div>
              <p className="text-sm text-gray-400 mb-2">Projects in this plan</p>
              <div className="flex flex-wrap gap-3 mb-4">
                {projects.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 bg-gray-700 px-3 py-1.5 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(p.id)}
                      onChange={() => toggleChecked(p.id)}
                    />
                    <span className="text-sm">
                      {p.key} — {p.name}
                    </span>
                  </label>
                ))}
                {projects.length === 0 && (
                  <p className="text-sm text-gray-500">No projects yet.</p>
                )}
              </div>
              <button
                type="submit"
                className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded font-semibold"
              >
                Create
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => openPlan(plan)}
                className={`p-5 rounded-lg cursor-pointer group ${
                  selectedPlan?.id === plan.id
                    ? 'bg-gray-700 ring-1 ring-green-500'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <button
                    onClick={(e) => handleDelete(e, plan.id)}
                    className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 text-sm"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {plan.plan_projects?.length || 0} project
                  {(plan.plan_projects?.length || 0) === 1 ? '' : 's'}
                </p>
              </div>
            ))}
            {plans.length === 0 && (
              <p className="text-gray-500">No plans yet — create one above.</p>
            )}
          </div>

          {selectedPlan && (
            <div className="bg-gray-800 rounded-lg p-5">
              <h3 className="text-lg font-semibold mb-4">{selectedPlan.name} — Timeline</h3>

              {sprints.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No sprints with dates in this plan's projects yet.
                </p>
              )}

              {sprints.length > 0 && (
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    {/* Month header */}
                    <div className="relative flex border-b border-gray-700 pb-1 mb-2 ml-40">
                      {months.map((m) => (
                        <div
                          key={m.toISOString()}
                          className="text-xs text-gray-400"
                          style={{
                            width: `${
                              ((new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) /
                                totalDays) *
                              100
                            }%`,
                          }}
                        >
                          {m.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
                        </div>
                      ))}
                    </div>

                    {/* One row per project */}
                    {planProjects.map((p) => {
                      const projectSprints = sprints.filter((s) => s.project_id === p.id)
                      return (
                        <div key={p.id} className="flex items-center mb-2">
                          <div className="w-40 flex-shrink-0 flex items-center gap-2 pr-3">
                            <span className="w-5 h-5 bg-blue-500/20 text-blue-400 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                              {p.key?.slice(0, 2)}
                            </span>
                            <span className="text-sm truncate">{p.name}</span>
                          </div>
                          <div className="relative flex-1 h-8 bg-gray-900/60 rounded">
                            {todayPct !== null && (
                              <div
                                className="absolute top-0 bottom-0 w-px bg-red-400/70"
                                style={{ left: `${todayPct}%` }}
                              />
                            )}
                            {projectSprints.map((s) => (
                              <div
                                key={s.id}
                                title={`${s.name}: ${s.start_date} → ${s.end_date} (${s.status})`}
                                className={`absolute top-1 bottom-1 rounded px-1.5 text-[11px] leading-6 truncate ${
                                  SPRINT_COLORS[s.status] || 'bg-blue-500/70'
                                }`}
                                style={barStyle(s)}
                              >
                                {s.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}

                    <div className="flex gap-4 mt-4 text-xs text-gray-400 ml-40">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-blue-500/70" /> Planned
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-green-500/70" /> Active
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-gray-500/70" /> Completed
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-px h-3 bg-red-400/70" /> Today
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
