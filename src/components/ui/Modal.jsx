import { X } from 'lucide-react'

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' }

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${SIZES[size]} glass rounded-lg animate-scale-in max-h-[85vh] flex flex-col`}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-600 flex-shrink-0">
            <h3 className="text-[15px] font-semibold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white p-1 rounded hover:bg-gray-650"
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
