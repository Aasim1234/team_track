import { X } from 'lucide-react'

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-2xl' }

export default function SidePanel({ open, onClose, title, subtitle, children, footer, width = 'lg' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 animate-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute right-0 top-0 bottom-0 w-full ${WIDTHS[width]} glass border-l border-gray-600 flex flex-col animate-slide-in-right`}
      >
        {title && (
          <div className="flex items-start justify-between px-5 py-4 border-b border-gray-600 flex-shrink-0">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-white truncate">{title}</h3>
              {subtitle && <p className="text-[12px] text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white p-1 rounded hover:bg-gray-650 flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-gray-600 flex items-center justify-end gap-2 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
