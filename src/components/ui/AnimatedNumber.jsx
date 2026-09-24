import { useEffect, useRef } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'

// Count-up effect for stat values. Only animates plain finite numbers —
// anything else (formatted strings like "3d" or "82%") passes through
// unchanged so this is a safe drop-in wherever StatCard's value prop is used.
export default function AnimatedNumber({ value, duration = 0.6 }) {
  const isNumeric = typeof value === 'number' && Number.isFinite(value)
  const ref = useRef(null)
  const motionValue = useMotionValue(0)
  // framer-motion takes a spring's duration in seconds; passing milliseconds
  // stretched every count-up to ten minutes, so tiles sat on 0.
  const spring = useSpring(motionValue, { duration, bounce: 0 })

  useEffect(() => {
    if (!isNumeric) return undefined
    const paint = (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString()
    }
    // Subscribe before setting the target so no update is missed, and paint the
    // final number once the animation is due to be over: a tab that gets no
    // animation frames (a background tab, a window that isn't drawing) would
    // otherwise leave the tile showing 0 for good.
    const stop = spring.on('change', paint)
    motionValue.set(value)
    const settle = setTimeout(() => paint(value), duration * 1000 + 300)
    return () => { stop(); clearTimeout(settle) }
  }, [spring, motionValue, value, isNumeric, duration])

  if (!isNumeric) return <>{value}</>

  return <span ref={ref}>0</span>
}
