import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Sun, Moon, ChevronRight, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import NotificationBell from './NotificationBell'

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('tt:cmdk'))
}

export default function TopNav({ breadcrumb = [], onQuickCreate, quickCreateLabel = 'Create' }) {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header className="sticky top-0 z-20 glass border-x-0 border-t-0 flex items-center gap-3 px-5 py-2.5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 min-w-0 flex-1">
        {breadcrumb.map((crumb, i) => {
          const isLast = i === breadcrumb.length - 1
          return (
            <span key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight size={13} className="text-gray-500 flex-shrink-0" />}
              {crumb.to && !isLast ? (
                <button
                  onClick={() => navigate(crumb.to)}
                  className="text-[13px] text-gray-400 hover:text-white truncate"
                >
                  {crumb.label}
                </button>
              ) : (
                <span
                  className={`text-[13px] truncate ${
                    isLast ? 'text-white font-semibold' : 'text-gray-400'
                  }`}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          )
        })}
      </nav>

      {/* Global search → command palette */}
      <button
        onClick={openCommandPalette}
        className="hidden sm:flex items-center gap-2 w-64 px-3 py-1.5 rounded-lg bg-gray-800/80 border border-gray-600/40 hover:border-gray-500/70 text-gray-500 text-[13px]"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600/60 text-gray-400 font-sans">
          Ctrl K
        </kbd>
      </button>

      {/* Quick create */}
      {onQuickCreate && (
        <button
          onClick={onQuickCreate}
          className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3.5 py-1.5 rounded-lg text-[13px] font-semibold shadow-lg shadow-blue-500/25 active:scale-95"
        >
          <Plus size={15} />
          <span className="hidden md:inline">{quickCreateLabel}</span>
        </button>
      )}

      <NotificationBell />

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Profile avatar + menu */}
      <div className="relative">
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center text-[11px] font-bold text-white ring-2 ring-transparent hover:ring-blue-500/50"
        >
          {initials}
        </button>
        {profileOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-56 glass rounded-xl shadow-2xl z-40 py-1.5 animate-scale-in">
              <div className="px-3.5 py-2.5 border-b border-gray-600/40">
                <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
                <p className="text-[11px] text-gray-400 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => supabase.auth.signOut()}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-[13px] text-red-400 hover:bg-gray-700/60"
              >
                <LogOut size={14} /> Logout
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
