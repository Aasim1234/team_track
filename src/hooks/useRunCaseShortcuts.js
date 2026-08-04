import { useEffect } from 'react'

// Page-scoped keydown listener for the test-run execution workspace —
// same window-listener + cleanup lifecycle as CommandPalette's global
// Ctrl/Cmd+K handler, but only active while this hook's owner is mounted
// and only fires when `enabled` (e.g. an active, authored case is selected).
export default function useRunCaseShortcuts({ enabled, onNext, onPrev, onMark }) {
  useEffect(() => {
    if (!enabled) return undefined

    const handler = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const key = e.key.toLowerCase()
      if (key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        onNext?.()
      } else if (key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        onPrev?.()
      } else if (key === 'p') {
        onMark?.('passed')
      } else if (key === 'f') {
        onMark?.('failed')
      } else if (key === 'b') {
        onMark?.('blocked')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onNext, onPrev, onMark])
}
