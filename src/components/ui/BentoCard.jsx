// Shared premium surface primitive for bento-grid tiles, stat cards, and
// other large in-flow cards — rounded-2xl/shadow-lg, deliberately solid
// (no blur; that stays reserved for floating surfaces like Modal/SidePanel).
export default function BentoCard({ as: Component = 'div', span = '', className = '', noHover = false, children, ...props }) {
  return (
    <Component
      className={`bg-gray-800 border border-gray-600 rounded-2xl shadow-lg ${noHover ? '' : 'bento-hover'} ${span} ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
}
