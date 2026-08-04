// Single source of truth for animation timing/easing across the app —
// every motion.div should pull from here rather than inventing its own
// duration/easing, so the whole app feels consistent.

export const TRANSITION = { duration: 0.2, ease: 'easeOut' }
export const TRANSITION_SLOW = { duration: 0.25, ease: 'easeOut' }

export const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
}

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
}

export const slideInRight = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 24 },
}

export const slideInFromTopRight = {
  initial: { opacity: 0, y: -12, x: 12 },
  animate: { opacity: 1, y: 0, x: 0 },
  exit: { opacity: 0, x: 40, transition: { duration: 0.15 } },
}

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.04 } },
}

export const buttonTap = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: TRANSITION,
}
