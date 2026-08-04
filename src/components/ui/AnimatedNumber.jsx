import { useEffect, useRef } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'

// Count-up effect for stat values. Only animates plain finite numbers —
// anything else (formatted strings like "3d" or "82%") passes through
// unchanged so this is a safe drop-in wherever StatCard's value prop is used.
export default function AnimatedNumber({ value, duration = 0.6 }) {
  const isNumeric = typeof value === 'number' && Number.isFinite(value)
  const ref = useRef(null)
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { duration: duration * 1000, bounce: 0 })

  useEffect(() => {
    if (isNumeric) motionValue.set(value)
  }, [value, isNumeric, motionValue])

  useEffect(() => {
    if (!isNumeric) return undefined
    return spring.on('change', (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString()
    })
  }, [spring, isNumeric])

  if (!isNumeric) return <>{value}</>

  return <span ref={ref}>0</span>
}
