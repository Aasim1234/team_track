import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Sun, Moon, ChevronRight, LogOut, Clock, HelpCircle,
  ShieldCheck, Keyboard,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useProjectAdminAccess } from '../hooks/useProjectAdminAccess'
import { getRecentIds, recordRecentProject } from '../lib/recentProjects'
import Dropdown, { DropdownItem } from './ui/Dropdown'
import NotificationBell from './NotificationBell'

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('tt:cmdk'))
}

export default function AppHeader({ breadcrumb = [], onQuickCreate, quickCreateLabel = 'Create' }) {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { isAdmin: isProjectAdmin } = useProjectAdminAccess()
  const [recentProjects, setRecentProjects] = useState([])

  const loadRecent = async () => {
    const ids = getRecentIds()
    if (ids.length === 0) {
      setRecentProjects([])
      return
    }
    const { data } = await supabase.from('projects').select('id, name, key').in('id', ids)
    setRecentProjects(ids.map((id) => (data || []).find((p) => p.id === id)).filter(Boolean))
  }

  const goToProject = (projectId) => {
    recordRecentProject(projectId)
    navigate(`/project/${projectId}/overview`)
  }

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header className="sticky top-0 z-20 bg-gray-800 border-b border-gray-600 flex items-center gap-3 px-4 h-12">
      {/* LEFT: logo + breadcrumb + quick add */}
      <div className="flex-1 flex items-center gap-2.5 min-w-0">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 flex-shrink-0">
          <span className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center text-[11px] font-bold text-white">
            TT
          </span>
        </button>
        <span className="text-gray-300 flex-shrink-0">/</span>
        <nav className="flex items-center gap-1 min-w-0">
          {breadcrumb.map((crumb, i) => {
            const isLast = i === breadcrumb.length - 1
            return (
              <span key={i} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />}
                {crumb.to && !isLast ? (
                  <button
                    onClick={() => navigate(crumb.to)}
                    className="text-[13px] text-gray-400 hover:text-white truncate"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span
                    className={`text-[13px] truncate ${isLast ? 'text-white font-semibold' : 'text-gray-400'}`}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            )
          })}
        </nav>
        {onQuickCreate && (
          <button
            onClick={onQuickCreate}
            className="flex items-center gap-1 bg-blue-500 hover:bg-blue-400 text-white px-2.5 py-1 rounded-md text-[12px] font-semibold flex-shrink-0 ml-1"
          >
            <Plus size={13} />
            <span className="hidden lg:inline">{quickCreateLabel}</span>
          </button>
        )}
      </div>

      {/* CENTER: search */}
      <div className="flex-1 flex justify-center min-w-0">
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 w-full max-w-md px-3 py-1.5 rounded-md bg-gray-700 border border-gray-600 hover:border-gray-500 text-gray-500 text-[13px]"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search projects, test cases, issues…</span>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600 text-gray-500 font-sans">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* RIGHT: working on, help, notifications, theme, profile, admin */}
      <div className="flex-1 flex items-center justify-end gap-0.5">
        <Dropdown
          align="right"
          trigger={
            <button className="flex items-center gap-1 text-gray-400 hover:text-white text-[12px] px-2 py-1.5 rounded-md hover:bg-gray-650">
              <Clock size={14} /> <span className="hidden xl:inline">Working On</span>
            </button>
          }
        >
          <div onMouseEnter={loadRecent}>
            <p className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
              Recent projects
            </p>
            {recentProjects.length === 0 && (
              <p className="px-3 pb-2 text-[12px] text-gray-500">Nothing yet</p>
            )}
            {recentProjects.map((p) => (
              <DropdownItem key={p.id} onClick={() => goToProject(p.id)}>
                <span className="text-blue-500 font-mono text-[11px]">{p.key}</span> {p.name}
              </DropdownItem>
            ))}
          </div>
        </Dropdown>

        <Dropdown
          align="right"
          trigger={
            <button className="text-gray-400 hover:text-white p-2 rounded-md hover:bg-gray-650">
              <HelpCircle size={16} />
            </button>
          }
        >
          <p className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
            Keyboard shortcuts
          </p>
          <div className="px-3 pb-2 space-y-1.5">
            <div className="flex items-center justify-between text-[12px] text-gray-300">
              <span className="flex items-center gap-1.5"><Keyboard size={12} /> Open search</span>
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600">Ctrl K</kbd>
            </div>
          </div>
        </Dropdown>

        <NotificationBell />

        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="text-gray-400 hover:text-white p-2 rounded-md hover:bg-gray-650"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {isProjectAdmin && (
          <button
            onClick={() => navigate('/admin')}
            title="Admin"
            className="text-gray-400 hover:text-white p-2 rounded-md hover:bg-gray-650"
          >
            <ShieldCheck size={16} />
          </button>
        )}

        <Dropdown
          align="right"
          trigger={
            <button className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-[11px] font-bold text-white ml-1">
              {initials}
            </button>
          }
        >
          <div className="px-3.5 py-2.5 border-b border-gray-600">
            <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
            <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
          </div>
          <DropdownItem onClick={() => supabase.auth.signOut()} icon={LogOut} destructive>
            Logout
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  )
}
