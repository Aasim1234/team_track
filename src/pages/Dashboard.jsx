import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FolderKanban, CircleDot, CheckCircle2, AlertTriangle, ArrowUpRight, X,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AppSidebar from '../components/AppSidebar'
import TopNav from '../components/TopNav'

function StatCard({ icon: Icon, label, value, tint, delay }) {
  return (
    <div
      className="bg-gray-800/80 border border-gray-600/30 rounded-xl p-4 flex items-center gap-3.5 card-lift animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${tint.bg}`}>
        <Icon size={18} className={tint.text} />
      </span>
      <div>
        <p className="text-2xl font-bold text-white leading-tight">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  )
}

function ProgressRing({ percent, size = 44 }) {
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90 flex-shrink-0">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" strokeWidth={stroke}
        className="stroke-gray-600/50"
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (percent / 100) * c}
        className="stroke-green-500 transition-all duration-500"
      />
    </svg>
  )
}

export default function Dashboard() {
  const [projects, setProjects] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*, issues(id, status, due_date)')
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

  const allIssues = projects.flatMap((p) => p.issues || [])
  const openCount = allIssues.filter((i) => i.status !== 'done').length
  const doneCount = allIssues.filter((i) => i.status === 'done').length
  const overdueCount = allIssues.filter(
    (i) => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'done'
  ).length

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AppSidebar />

      <div className="flex-1 min-w-0">
        <TopNav
          breadcrumb={[{ label: 'My Workspace' }, { label: 'Projects' }]}
          onQuickCreate={() => setShowForm(true)}
          quickCreateLabel="New Project"
        />

        <div className="p-6 md:p-8 max-w-7xl mx-auto">
          <div className="mb-7 animate-slide-up">
            <h2 className="text-2xl font-bold tracking-tight">Projects</h2>
            <p className="text-sm text-gray-400 mt-1">
              Everything your team is working on, in one place.
            </p>
          </div>

          {/* Analytics cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon={FolderKanban} label="Projects" value={projects.length} delay={0}
              tint={{ bg: 'bg-blue-500/15', text: 'text-blue-400' }} />
            <StatCard icon={CircleDot} label="Open issues" value={openCount} delay={50}
              tint={{ bg: 'bg-orange-500/15', text: 'text-orange-400' }} />
            <StatCard icon={CheckCircle2} label="Completed" value={doneCount} delay={100}
              tint={{ bg: 'bg-green-500/15', text: 'text-green-400' }} />
            <StatCard icon={AlertTriangle} label="Overdue" value={overdueCount} delay={150}
              tint={{ bg: 'bg-red-500/15', text: 'text-red-400' }} />
          </div>

          {/* Project grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((p, idx) => {
              const total = p.issues?.length || 0
              const done = p.issues?.filter((i) => i.status === 'done').length || 0
              const percent = total > 0 ? Math.round((done / total) * 100) : 0

              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/project/${p.id}`)}
                  className="group bg-gray-800/80 border border-gray-600/30 rounded-xl p-5 cursor-pointer card-lift animate-slide-up"
                  style={{ animationDelay: `${200 + idx * 40}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-[11px] font-bold bg-blue-500/15 text-blue-400 px-2 py-1 rounded-md tracking-wide">
                      {p.key}
                    </span>
                    <ArrowUpRight
                      size={16}
                      className="text-gray-600 group-hover:text-blue-400 transition-colors"
                    />
                  </div>
                  <h3 className="text-[15px] font-semibold mb-0.5">{p.name}</h3>
                  <p className="text-xs text-gray-500 mb-4 line-clamp-1">
                    {p.description || `${total} issue${total === 1 ? '' : 's'} tracked`}
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <ProgressRing percent={percent} />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                        {percent}%
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-400">
                        <span className="text-white font-semibold">{done}</span>
                        <span className="text-gray-500"> / {total} done</span>
                      </p>
                      <div className="w-full bg-gray-600/40 rounded-full h-1.5 mt-1.5">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-green-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {projects.length === 0 && (
            <div className="text-center py-20 animate-fade-in">
              <span className="inline-flex w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 items-center justify-center mb-4">
                <FolderKanban size={26} />
              </span>
              <h3 className="text-lg font-semibold">No projects yet</h3>
              <p className="text-sm text-gray-400 mt-1 mb-5">
                Create your first project to start tracking work.
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-lg font-semibold text-sm shadow-lg shadow-blue-500/25"
              >
                + New Project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create project modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowForm(false)}
        >
          <form
            onSubmit={handleCreate}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass rounded-2xl p-6 shadow-2xl animate-scale-in"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">New Project</h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-700"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mb-4">
              <label className="text-[13px] text-gray-400 block mb-1.5">Project name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                placeholder="e.g. Mobile App"
                className="w-full px-3.5 py-2.5 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none focus:border-blue-500/70 text-sm"
              />
            </div>
            <div className="mb-6">
              <label className="text-[13px] text-gray-400 block mb-1.5">Key</label>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
                maxLength={5}
                placeholder="e.g. APP"
                className="w-28 px-3.5 py-2.5 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none focus:border-blue-500/70 text-sm uppercase"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-400 py-2.5 rounded-lg font-semibold text-sm shadow-lg shadow-blue-500/25"
            >
              Create Project
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
