import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

const RECENT_KEY = 'team_tracker_recent_projects'

function getRecentIds() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

export function recordRecentProject(projectId) {
  try {
    const current = getRecentIds().filter((id) => id !== projectId)
    current.unshift(projectId)
    localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, 5)))
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
}

export default function AppSidebar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { id: currentProjectId } = useParams()
  const { pathname } = useLocation()

  const [projects, setProjects] = useState([])
  const [starredIds, setStarredIds] = useState(new Set())
  const [spacesOpen, setSpacesOpen] = useState(true)
  const [recentOpen, setRecentOpen] = useState(true)

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('id, name, key').order('name')
    setProjects(data || [])
  }

  const fetchStarred = async () => {
    if (!user) return
    const { data } = await supabase
      .from('starred_projects')
      .select('project_id')
      .eq('user_id', user.id)
    setStarredIds(new Set((data || []).map((r) => r.project_id)))
  }

  useEffect(() => {
    fetchProjects()
    fetchStarred()
  }, [user])

  const toggleStar = async (e, projectId) => {
    e.stopPropagation()
    if (!user) return
    if (starredIds.has(projectId)) {
      await supabase.from('starred_projects').delete().eq('user_id', user.id).eq('project_id', projectId)
    } else {
      await supabase.from('starred_projects').insert({ user_id: user.id, project_id: projectId })
    }
    fetchStarred()
  }

  const goToProject = (projectId) => {
    recordRecentProject(projectId)
    navigate(`/project/${projectId}`)
  }

  const starredProjects = projects.filter((p) => starredIds.has(p.id))
  const recentIds = getRecentIds()
  const recentProjects = recentIds
    .map((rid) => projects.find((p) => p.id === rid))
    .filter(Boolean)

  return (
    <div className="w-60 flex-shrink-0 bg-gray-900 border-r border-gray-800 h-screen sticky top-0 overflow-y-auto text-sm">
      <div className="p-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 font-bold text-white text-base mb-4"
        >
          <span className="w-7 h-7 bg-green-500 rounded flex items-center justify-center text-sm">TT</span>
          Team Tracker
        </button>

        <nav className="space-y-0.5 mb-5">
          <button
            onClick={() => navigate('/dashboard')}
            className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 flex items-center gap-2 ${
              pathname === '/dashboard' ? 'bg-gray-800 text-white' : 'text-gray-300'
            }`}
          >
            👤 For you
          </button>
          <button
            onClick={() => navigate('/plans')}
            className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 flex items-center gap-2 ${
              pathname === '/plans' ? 'bg-gray-800 text-white' : 'text-gray-300'
            }`}
          >
            🗺️ Plans
          </button>
          <button
            onClick={() => navigate('/goals')}
            className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 flex items-center gap-2 ${
              pathname === '/goals' ? 'bg-gray-800 text-white' : 'text-gray-300'
            }`}
          >
            🎯 Goals
          </button>
        </nav>

        {/* Recent */}
        <div className="mb-5">
          <button
            onClick={() => setRecentOpen(!recentOpen)}
            className="w-full flex items-center justify-between px-2 py-1 text-xs text-gray-500 uppercase font-semibold hover:text-gray-300"
          >
            Recent
            <span className={`transition-transform ${recentOpen ? '' : '-rotate-90'}`}>▾</span>
          </button>
          {recentOpen && (
            <div className="mt-1 space-y-0.5">
              {recentProjects.length === 0 && (
                <p className="px-2 py-1 text-xs text-gray-600">Nothing yet</p>
              )}
              {recentProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goToProject(p.id)}
                  className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 flex items-center gap-2 ${
                    currentProjectId === p.id ? 'bg-gray-800 text-white' : 'text-gray-300'
                  }`}
                >
                  <span className="w-5 h-5 bg-blue-500/20 text-blue-400 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {p.key?.slice(0, 2)}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Starred */}
        {starredProjects.length > 0 && (
          <div className="mb-5">
            <p className="px-2 py-1 text-xs text-gray-500 uppercase font-semibold">⭐ Starred</p>
            <div className="mt-1 space-y-0.5">
              {starredProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goToProject(p.id)}
                  className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 flex items-center gap-2 group ${
                    currentProjectId === p.id ? 'bg-gray-800 text-white' : 'text-gray-300'
                  }`}
                >
                  <span className="w-5 h-5 bg-blue-500/20 text-blue-400 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {p.key?.slice(0, 2)}
                  </span>
                  <span className="truncate flex-1">{p.name}</span>
                  <span
                    onClick={(e) => toggleStar(e, p.id)}
                    className="text-yellow-400 opacity-0 group-hover:opacity-100"
                  >
                    ★
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Spaces (all projects) */}
        <div>
          <div className="flex items-center px-2 py-1">
            <button
              onClick={() => setSpacesOpen(!spacesOpen)}
              className="flex-1 flex items-center justify-between text-xs text-gray-500 uppercase font-semibold hover:text-gray-300"
            >
              Spaces
              <span className={`transition-transform ${spacesOpen ? '' : '-rotate-90'}`}>▾</span>
            </button>
            <button
              onClick={() => navigate('/dashboard?new=1')}
              title="New space"
              className="ml-2 text-gray-500 hover:text-white leading-none"
            >
              +
            </button>
          </div>
          {spacesOpen && (
            <div className="mt-1 space-y-0.5">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goToProject(p.id)}
                  className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 flex items-center gap-2 group ${
                    currentProjectId === p.id ? 'bg-gray-800 text-white' : 'text-gray-300'
                  }`}
                >
                  <span className="w-5 h-5 bg-blue-500/20 text-blue-400 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {p.key?.slice(0, 2)}
                  </span>
                  <span className="truncate flex-1">{p.name}</span>
                  <span
                    onClick={(e) => toggleStar(e, p.id)}
                    className={`opacity-0 group-hover:opacity-100 ${starredIds.has(p.id) ? 'opacity-100 text-yellow-400' : 'text-gray-500'}`}
                  >
                    ★
                  </span>
                </button>
              ))}
              {projects.length === 0 && (
                <p className="px-2 py-1 text-xs text-gray-600">No projects yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
