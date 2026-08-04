import { motion } from 'framer-motion'

// Shared nav button for ProjectSidebar/AdminSidebar — each passes its own
// indicatorId so the layoutId-based active indicator animates independently
// per sidebar rather than sliding between two unrelated sidebars.
export default function SidebarNavButton({ item, active, collapsed = false, indicatorId, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`group relative w-full flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors duration-200 ${
        collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5'
      } ${active ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-white hover:bg-gray-650'}`}
    >
      {active && (
        <motion.span
          layoutId={indicatorId}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-blue-500"
        />
      )}
      <Icon size={15} strokeWidth={2} className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && item.label}
    </button>
  )
}
