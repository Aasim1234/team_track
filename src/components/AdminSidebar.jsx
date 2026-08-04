import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, LayoutDashboard, FolderKanban, Users, Sparkles,
  SlidersHorizontal, Plug, Database, Settings, Gauge,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import SidebarNavButton from './ui/SidebarNavButton'
import SidebarFooter from './ui/SidebarFooter'

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { to: '/admin/users', label: 'Users & Roles', icon: Users },
  { to: '/admin/team-performance', label: 'Team Performance', icon: Gauge },
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
            TF
          </span>
          <span className="font-semibold text-white text-[13px]">Administration</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <SidebarNavButton
            key={item.to}
            indicatorId="admin-nav-indicator"
            item={item}
            active={item.exact ? pathname === item.to : pathname.startsWith(item.to)}
            onClick={() => navigate(item.to)}
          />
        ))}
      </nav>

      <SidebarFooter user={user} />
    </aside>
  )
}
