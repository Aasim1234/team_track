import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, LayoutDashboard, FolderKanban, Users, Sparkles,
  SlidersHorizontal, Plug, Database, Settings, LogOut,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { to: '/admin/users', label: 'Users & Roles', icon: Users },
  { to: '/admin/ai-hub', label: 'AI Hub', icon: Sparkles },
  { to: '/admin/customizations', label: 'Customizations', icon: SlidersHorizontal },
  { to: '/admin/integration', label: 'Integration', icon: Plug },
  { to: '/admin/data-management', label: 'Data Management', icon: Database },
  { to: '/admin/site-settings', label: 'Site Settings', icon: Settings },
]

export default function AdminSidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <aside className="w-[216px] flex-shrink-0 bg-gray-800 border-r border-gray-600 h-screen sticky top-0 flex flex-col">
      <div className="px-2.5 py-2 border-b border-gray-600">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-gray-500 hover:text-white text-[11px] font-medium mb-1.5"
        >
          <ArrowLeft size={12} /> Back to App
        </button>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            TT
          </span>
          <span className="font-semibold text-white text-[13px]">Administration</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to)
          return (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className={`relative w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium ${
                active ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-white hover:bg-gray-650'
              }`}
            >
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-blue-500" />}
              <Icon size={15} strokeWidth={2} className="flex-shrink-0" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-gray-600 p-2 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
          {initials}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white truncate">{displayName}</p>
          <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
        </div>
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
