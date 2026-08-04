import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { slideInFromTopRight, TRANSITION } from '../../lib/motion'

const ToastContext = createContext(null)

const VARIANTS = {
  success: { icon: CheckCircle2, iconClass: 'text-green-600', barClass: 'bg-green-500' },
  error: { icon: XCircle, iconClass: 'text-red-600', barClass: 'bg-red-500' },
  info: { icon: Info, iconClass: 'text-blue-600', barClass: 'bg-blue-500' },
}

const DEFAULT_DURATION = 4000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((variant, message, duration = DEFAULT_DURATION) => {
    const id = ++nextId.current
    setToasts((prev) => [...prev, { id, variant, message }])
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }, [dismiss])

  const toast = useRef({
    success: (message, duration) => push('success', message, duration),
    error: (message, duration) => push('error', message, duration),
    info: (message, duration) => push('info', message, duration),
  }).current

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const v = VARIANTS[t.variant] || VARIANTS.info
            const Icon = v.icon
            return (
              <motion.div
                key={t.id}
                role="status"
                layout
                initial="initial"
                animate="animate"
                exit="exit"
                variants={slideInFromTopRight}
                transition={TRANSITION}
                className="glass rounded-lg overflow-hidden pointer-events-auto"
              >
                <div className="flex items-start gap-2.5 px-3.5 py-3">
                  <Icon size={17} className={`${v.iconClass} flex-shrink-0 mt-0.5`} />
                  <p className="text-[13px] text-white flex-1 leading-snug">{t.message}</p>
                  <button
                    onClick={() => dismiss(t.id)}
                    className="text-gray-500 hover:text-white p-0.5 rounded flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className={`h-0.5 ${v.barClass}`} />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
