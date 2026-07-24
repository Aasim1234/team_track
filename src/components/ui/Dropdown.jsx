import { useState } from 'react'

export default function Dropdown({ trigger, children, align = 'left', width = 'w-56' }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 ${width} glass rounded-md z-40 py-1 animate-scale-in`}
          >
            {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
          </div>
        </>
      )}
    </div>
  )
}

export function DropdownItem({ onClick, icon: Icon, children, destructive = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-gray-650 ${
        destructive ? 'text-red-600' : 'text-gray-300'
      }`}
    >
      {Icon && <Icon size={14} className="flex-shrink-0" />}
      {children}
    </button>
  )
}
