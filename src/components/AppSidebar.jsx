import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Map, Target, Clock, Star, Boxes, Plus,
  PanelLeftClose, PanelLeftOpen, ChevronsUpDown, ChevronDown,
  LogOut, Check, ArrowLeft, Home, ListChecks, PlayCircle, Flag,
  BarChart3, CheckSquare, KanbanSquare,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

const RECENT_KEY = 'team_tracker_recent_projects'
const COLLAPSED_KEY = 'tt_sidebar_collapsed'

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

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/plans', label: 'Plans', icon: Map },
  { to: '/goals', label: 'Goals', icon: Target },
]

function projectNavItems(projectId) {
  const base = `/project/${projectId}`
  return [
    { to: `${base}/overview`, label: 'Overview', icon: Home },
    { to: `${base}/cases`, label: 'Test Cases', icon: ListChecks },
    { to: `${base}/runs`, label: 'Test Runs & Results', icon: PlayCircle },
    { to: `${base}/milestones`, label: 'Milestones', icon: Flag },
    { to: `${base}/reports`, label: 'Reports', icon: BarChart3 },
    { to: `${base}/todo`, label: 'To-Do', icon: CheckSquare },
  ]
}

function NavButton({ item, active, collapsed, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`relative w-full flex items-center gap-2.5 rounded-lg text-sm font-medium ${
        collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
      } ${
        active
          ? 'bg-blue-500/10 text-blue-400'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-blue-500" />
      )}
      <Icon size={17} strokeWidth={2} className="flex-shrink-0" />
      {!collapsed && item.label}
    </button>
  )
}

function ProjectRow({ project, active, starred, onOpen, onToggleStar }) {
  return (
    <button
      onClick={onOpen}
      className={`w-full text-left pl-3 pr-2 py-1.5 rounded-lg flex items-center gap-2.5 group text-sm ${
        active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <span className="w-5 h-5 bg-blue-500/15 text-blue-400 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0">
        {project.key?.slice(0, 2)}
      </span>
      <span className="truncate flex-1">{project.name}</span>
      <span
        onClick={onToggleStar}
        className={`opacity-0 group-hover:opacity-100 ${
          starred ? 'opacity-100 text-orange-400' : 'text-gray-500 hover:text-orange-400'
        }`}
      >
        <Star size={13} fill={starred ? 'currentColor' : 'none'} />
      </span>
    </button>
  )
}

function SectionHeader({ icon: Icon, label, open, onToggle, action }) {
  return (
    <div className="flex items-center pl-3 pr-2 py-1 group/head">
      <button
        onClick={onToggle}
        className="flex-1 flex items-center gap-1.5 text-[11px] text-gray-500 uppercase font-semibold tracking-wider hover:text-gray-300"
      >
        <Icon size={12} />
        {label}
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {action}
    </div>
  )
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
  const [wsMenuOpen, setWsMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === '1'
  )

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

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
  const recentProjects = getRecentIds()
    .map((rid) => projects.find((p) => p.id === rid))
    .filter(Boolean)

  const inProjectContext = Boolean(currentProjectId) && pathname.startsWith('/project/')
  const currentProject = projects.find((p) => p.id === currentProjectId)

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside
      className={`${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      } flex-shrink-0 bg-gray-900/70 border-r border-gray-800 h-screen sticky top-0 flex flex-col transition-all duration-300`}
    >
      {/* Header: logo + collapse toggle, or project identity when inside a project workspace */}
      {inProjectContext ? (
        <div className="p-3">
          <div className="flex items-center justify-between mb-2.5">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs font-medium"
            >
              <ArrowLeft size={13} />
              {!collapsed && 'All Projects'}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 flex-shrink-0"
            >
              {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
              {currentProject?.key?.slice(0, 2) || '··'}
            </span>
            {!collapsed && (
              <span className="font-bold text-white text-[14px] tracking-tight truncate">
                {currentProject?.name || 'Loading…'}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className={`flex items-center gap-2 p-3 ${collapsed ? 'flex-col' : ''}`}>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2.5 flex-1 min-w-0"
          >
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center text-[13px] font-extrabold text-white shadow-lg shadow-blue-500/20 flex-shrink-0">
              TT
            </span>
            {!collapsed && (
              <span className="font-bold text-white text-[15px] tracking-tight truncate">
                Team Tracker
              </span>
            )}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 flex-shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      )}

      {/* Workspace switcher */}
      {!collapsed && !inProjectContext && (
        <div className="px-3 pb-2 relative">
          <button
            onClick={() => setWsMenuOpen(!wsMenuOpen)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-800/70 border border-gray-600/40 hover:border-gray-500/60 text-left"
          >
            <span className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
              W
            </span>
            <span className="text-[13px] text-gray-300 font-medium flex-1 truncate">
              My Workspace
            </span>
            <ChevronsUpDown size={13} className="text-gray-500" />
          </button>
          {wsMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setWsMenuOpen(false)} />
              <div className="absolute left-3 right-3 top-full mt-1 glass rounded-lg shadow-2xl z-40 py-1 animate-scale-in">
                <div className="px-3 py-2 flex items-center gap-2 text-[13px] text-white">
                  <span className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                    W
                  </span>
                  My Workspace
                  <Check size={13} className="ml-auto text-blue-400" />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-5">
        {inProjectContext ? (
          <>
            <nav className="space-y-0.5">
              {projectNavItems(currentProjectId).map((item) => (
                <NavButton
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  active={pathname.startsWith(item.to)}
                  onClick={() => navigate(item.to)}
                />
              ))}
            </nav>
            <div className="pt-4 mt-1 border-t border-gray-800">
              {!collapsed && (
                <p className="pl-3 pb-1 text-[11px] text-gray-500 uppercase font-semibold tracking-wider">
                  Classic
                </p>
              )}
              <NavButton
                item={{ to: `/project/${currentProjectId}/classic`, label: 'Kanban / Sprints', icon: KanbanSquare }}
                collapsed={collapsed}
                active={pathname.startsWith(`/project/${currentProjectId}/classic`)}
                onClick={() => navigate(`/project/${currentProjectId}/classic`)}
              />
            </div>
          </>
        ) : (
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.to}
              item={item}
              collapsed={collapsed}
              active={pathname === item.to}
              onClick={() => navigate(item.to)}
            />
          ))}
        </nav>
        )}

        {!collapsed && !inProjectContext && (
          <>
            {/* Recent */}
            <div>
              <SectionHeader
                icon={Clock}
                label="Recent"
                open={recentOpen}
                onToggle={() => setRecentOpen(!recentOpen)}
              />
              {recentOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {recentProjects.length === 0 && (
                    <p className="pl-3 py-1 text-xs text-gray-500">Nothing yet</p>
                  )}
                  {recentProjects.map((p) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      active={currentProjectId === p.id}
                      starred={starredIds.has(p.id)}
                      onOpen={() => goToProject(p.id)}
                      onToggleStar={(e) => toggleStar(e, p.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Starred */}
            {starredProjects.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 pl-3 pr-2 py-1 text-[11px] text-gray-500 uppercase font-semibold tracking-wider">
                  <Star size={12} /> Starred
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {starredProjects.map((p) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      active={currentProjectId === p.id}
                      starred
                      onOpen={() => goToProject(p.id)}
                      onToggleStar={(e) => toggleStar(e, p.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Spaces */}
            <div>
              <SectionHeader
                icon={Boxes}
                label="Spaces"
                open={spacesOpen}
                onToggle={() => setSpacesOpen(!spacesOpen)}
                action={
                  <button
                    onClick={() => navigate('/dashboard?new=1')}
                    title="New space"
                    className="text-gray-500 hover:text-white p-0.5 rounded hover:bg-gray-800"
                  >
                    <Plus size={13} />
                  </button>
                }
              />
              {spacesOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {projects.map((p) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      active={currentProjectId === p.id}
                      starred={starredIds.has(p.id)}
                      onOpen={() => goToProject(p.id)}
                      onToggleStar={(e) => toggleStar(e, p.id)}
                    />
                  ))}
                  {projects.length === 0 && (
                    <p className="pl-3 py-1 text-xs text-gray-500">No projects yet</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Profile footer */}
      <div
        className={`border-t border-gray-800 p-3 flex items-center gap-2.5 ${
          collapsed ? 'flex-col' : ''
        }`}
      >
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
          {initials}
        </span>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white truncate">{displayName}</p>
            <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
          </div>
        )}
        <button
          onClick={() => supabase.auth.signOut()}
          title="Logout"
          className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-gray-800 flex-shrink-0"
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}
