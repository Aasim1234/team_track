import { motion } from 'framer-motion'
import { fadeInUp, TRANSITION } from '../../lib/motion'
import BentoCard from './BentoCard'
import AnimatedNumber from './AnimatedNumber'

// Shared stat tile — used across Dashboard, Team Performance, and Project
// Overview. Relies on an ancestor with variants={staggerContainer}
// initial="animate" animate="animate" to get the stagger-in effect (as
// Dashboard's summary grid does); without one it just renders statically.
export default function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <BentoCard
      as={motion.div}
      variants={fadeInUp}
      transition={TRANSITION}
      whileHover={{ scale: 1.02, y: -2 }}
      className="p-4 flex items-center gap-3"
    >
      <span className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${tint}`}>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-white leading-tight truncate">
          <AnimatedNumber value={value} />
        </p>
        <p className="text-[12px] text-gray-500">{label}</p>
      </div>
    </BentoCard>
  )
}
