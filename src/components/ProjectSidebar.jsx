import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Map, Target, Clock, Star, Boxes, Plus,
  PanelLeftClose, PanelLeftOpen, ChevronDown,
  LogOut, ArrowLeft, Home, ListChecks, PlayCircle, Flag,
  BarChart3, CheckSquare, KanbanSquare,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { getRecentIds, recordRecentProject } from '../lib/recentProjects'

export { recordRecentProject }

const COLLAPSED_KEY = 'tt_sidebar_collapsed'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/plans', label: 'Plans', icon: Map },
  { to: '/goals', label: 'Goals', icon: Target },
]

function projectNavItems(projectId) {
  const base = `/project/${projectId}`
  return [
    { to: `${base}/overview`, label: 'Project Overview', icon: Home },
    { to: `${base}/todo`, label: 'To-Do', icon: CheckSquare },
    { to: `${base}/cases`, label: 'Test Cases', icon: ListChecks },
    { to: `${base}/runs`, label: 'Test Runs & Results', icon: PlayCircle },
    { to: `${base}/milestones`, label: 'Milestones', icon: Flag },
    { to: `${base}/reports`, label: 'Reports', icon: BarChart3 },
  ]
}

function NavButton({ item, active, collapsed, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`relative w-full flex items-center gap-2.5 rounded-md text-[13px] font-medium ${
        collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5'
      } ${active ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-white hover:bg-gray-650'}`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-blue-500" />
      )}
      <Icon size={15} strokeWidth={2} className="flex-shrink-0" />
      {!collapsed && item.label}
    </button>
  )
}

function ProjectRow({ project, active, starred, onOpen, onToggleStar }) {
  return (
    <button
      onClick={onOpen}
      className={`w-full text-left pl-2.5 pr-2 py-1.5 rounded-md flex items-center gap-2 group text-[13px] ${
        active ? 'bg-gray-650 text-white' : 'text-gray-400 hover:bg-gray-650 hover:text-white'
      }`}
    >
      <span className="w-4.5 h-4.5 bg-blue-50 text-blue-600 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0">
        {project.key?.slice(0, 2)}
      </span>
      <span className="truncate flex-1">{project.name}</span>
      <span
        onClick={onToggleStar}
        className={`opacity-0 group-hover:opacity-100 ${
          starred ? 'opacity-100 text-orange-500' : 'text-gray-400 hover:text-orange-500'
        }`}
      >
        <Star size={12} fill={starred ? 'currentColor' : 'none'} />
      </span>
    </button>
  )
}

function SectionHeader({ icon: Icon, label, open, onToggle, action }) {
  return (
    <div className="flex items-center pl-2.5 pr-2 py-1 group/head">
      <button
        onClick={onToggle}
        className="flex-1 flex items-center gap-1.5 text-[10px] text-gray-500 uppercase font-semibold tracking-wider hover:text-gray-300"
      >
        <Icon size={11} />
        {label}
        <ChevronDown size={11} className={`transition-transform duration-150 ${open ? '' : '-rotate-90'}`} />
      </button>
      {action}
    </div>
  )
}

export default function ProjectSidebar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { id: currentProjectId } = useParams()
  const { pathname } = useLocation()

  const [projects, setProjects] = useState([])
  const [starredIds, setStarredIds] = useState(new Set())
  const [spacesOpen, setSpacesOpen] = useState(true)
  const [recentOpen, setRecentOpen] = useState(true)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1')

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('id, name, key').order('name')
    setProjects(data || [])
  }

  const fetchStarred = async () => {
    if (!user) return
    const { data } = await supabase.from('starred_projects').select('project_id').eq('user_id', user.id)
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
  const recentProjects = getRecentIds().map((rid) => projects.find((p) => p.id === rid)).filter(Boolean)

  const inProjectContext = Boolean(currentProjectId) && pathname.startsWith('/project/')
  const currentProject = projects.find((p) => p.id === currentProjectId)

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <aside
      className={`${collapsed ? 'w-14' : 'w-[216px]'} flex-shrink-0 bg-gray-800 border-r border-gray-600 h-screen sticky top-0 flex flex-col transition-all duration-150`}
    >
      {inProjectContext ? (
        <div className="px-2.5 py-2 border-b border-gray-600">
          <div className="flex items-center justify-between mb-1.5">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1 text-gray-500 hover:text-white text-[11px] font-medium"
            >
              <ArrowLeft size={12} />
              {!collapsed && 'All Projects'}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-gray-650 flex-shrink-0"
            >
              {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {currentProject?.key?.slice(0, 2) || '··'}
            </span>
            {!collapsed && (
              <span className="font-semibold text-white text-[13px] truncate">
                {currentProject?.name || 'Loading…'}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-600">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
              TT
            </span>
            {!collapsed && <span className="font-semibold text-white text-[13px] truncate">Team Tracker</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-gray-650 flex-shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
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
            <div className="pt-3 border-t border-gray-600">
              {!collapsed && (
                <p className="pl-2.5 pb-1 text-[10px] text-gray-500 uppercase font-semibold tracking-wider">
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
            <div>
              <SectionHeader icon={Clock} label="Recent" open={recentOpen} onToggle={() => setRecentOpen(!recentOpen)} />
              {recentOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {recentProjects.length === 0 && <p className="pl-2.5 py-1 text-[11px] text-gray-500">Nothing yet</p>}
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

            {starredProjects.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 pl-2.5 pr-2 py-1 text-[10px] text-gray-500 uppercase font-semibold tracking-wider">
                  <Star size={11} /> Starred
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
                    className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-gray-650"
                  >
                    <Plus size={12} />
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
                  {projects.length === 0 && <p className="pl-2.5 py-1 text-[11px] text-gray-500">No projects yet</p>}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className={`border-t border-gray-600 p-2 flex items-center gap-2 ${collapsed ? 'flex-col' : ''}`}>
        <span className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
          {initials}
        </span>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-white truncate">{displayName}</p>
            <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
          </div>
        )}
        <button
          onClick={() => supabase.auth.signOut()}
          title="Logout"
          className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-650 flex-shrink-0"
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  )
}
