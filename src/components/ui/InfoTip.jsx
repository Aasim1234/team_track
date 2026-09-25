import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

const EDGE = 8
const GAP = 6
const FALLBACK_WIDTH = 240

// A small ⓘ that explains one number. Hovering or focusing it opens the note;
// tapping pins it open, because touch devices have no hover. The bubble is
// portalled to <body> and positioned in viewport coordinates, so a card, a
// table cell or a sticky header can never clip it.
export default function InfoTip({ label, text, className = '' }) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState(null)
  const buttonRef = useRef(null)
  const tipRef = useRef(null)
  const id = useId()
  const open = hovered || pinned

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return undefined
    }
    const place = () => {
      const anchor = buttonRef.current?.getBoundingClientRect()
      if (!anchor) return
      const tip = tipRef.current?.getBoundingClientRect()
      const width = tip?.width || FALLBACK_WIDTH
      const height = tip?.height || 0
      // clientWidth/Height are the visible page box, without the scrollbars.
      // A hidden or not-yet-painted page reports 0, and then the only sane
      // thing is to sit under the icon and skip the clamping.
      const viewWidth = document.documentElement.clientWidth || window.innerWidth || 0
      const viewHeight = document.documentElement.clientHeight || window.innerHeight || 0
      const centred = Math.max(EDGE, anchor.left + anchor.width / 2 - width / 2)
      const left = viewWidth ? Math.min(centred, Math.max(EDGE, viewWidth - width - EDGE)) : centred
      // Above by preference, below when there is no room, and clamped when
      // neither side fits — a note off the screen helps nobody.
      let top
      if (anchor.top - height - GAP >= EDGE) top = anchor.top - height - GAP
      else if (!viewHeight || anchor.bottom + height + GAP <= viewHeight - EDGE) top = anchor.bottom + GAP
      else top = Math.min(Math.max(EDGE, anchor.bottom + GAP), Math.max(EDGE, viewHeight - height - EDGE))
      setPos({ left, top })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // A pinned note closes on Escape or on a click anywhere else.
  useEffect(() => {
    if (!pinned) return undefined
    const onKeyDown = (e) => { if (e.key === 'Escape') setPinned(false) }
    const onPointerDown = (e) => {
      if (!buttonRef.current?.contains(e.target) && !tipRef.current?.contains(e.target)) setPinned(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [pinned])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`What ${label} means`}
        aria-describedby={open ? id : undefined}
        aria-expanded={pinned}
        onClick={(e) => { e.stopPropagation(); setPinned((p) => !p) }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={`inline-flex items-center justify-center text-gray-500 hover:text-gray-300 focus-visible:text-gray-300 outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60 rounded-full align-middle ${className}`}
      >
        <Info size={12} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{
            left: pos ? pos.left : 0,
            top: pos ? pos.top : 0,
            visibility: pos ? 'visible' : 'hidden',
          }}
          className="fixed z-50 w-60 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-[11px] leading-relaxed text-gray-300 shadow-xl normal-case tracking-normal font-normal"
        >
          <span className="block text-[11px] font-semibold text-white mb-0.5">{label}</span>
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}
