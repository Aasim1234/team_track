import { LogOut } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

export default function SidebarFooter({ user, collapsed = false }) {
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
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
  )
}
