import { motion } from 'framer-motion'
import { buttonTap } from '../../lib/motion'

// Shared primary submit button so every form's whileHover/whileTap
// micro-interaction lives in one place instead of copy-pasted per modal.
export default function PrimaryButton({ children, className = '', ...props }) {
  return (
    <motion.button
      {...buttonTap}
      className={`w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 py-2 rounded-md text-[13px] font-semibold text-white ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}
