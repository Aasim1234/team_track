import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'

function timeAgo(dateStr) {
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const TYPE_ICON = {
  assigned: '👤',
  status_changed: '🔄',
  comment: '💬',
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const handleClick = async (n) => {
    if (!n.read) await markAsRead(n.id)
    setOpen(false)
    if (n.project_id) navigate(`/project/${n.project_id}`)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative text-gray-300 hover:text-white p-2"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-80 bg-gray-800 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto border border-gray-700">
            <div className="flex justify-between items-center p-3 border-b border-gray-700">
              <span className="font-semibold text-white text-sm">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-green-400 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 && (
              <p className="text-gray-500 text-sm p-4 text-center">No notifications yet.</p>
            )}

            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`p-3 border-b border-gray-700 cursor-pointer hover:bg-gray-700 ${
                  !n.read ? 'bg-gray-700/50' : ''
                }`}
              >
                <div className="flex gap-2 items-start">
                  <span>{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-200">{n.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-green-500 mt-1"></span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
