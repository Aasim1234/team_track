const AVATAR_COLORS = ['bg-pink-500', 'bg-purple-500', 'bg-blue-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-500']

function initialsOf(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function colorFor(name) {
  if (!name) return 'bg-gray-500'
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

// Overlapping-avatar cell for tables/lists that show several people at once
// (e.g. a team-membership column). `ringColor` should match whatever
// surface the stack sits on so the punch-out reads correctly.
export default function AvatarStack({ names = [], max = 4, size = 22, ringColor = 'ring-gray-800' }) {
  const visible = names.slice(0, max)
  const overflow = names.length - visible.length

  return (
    <div className="flex items-center">
      {visible.map((name, i) => (
        <span
          key={`${name}-${i}`}
          title={name}
          className={`rounded-full ${ringColor} ring-2 flex items-center justify-center text-white font-bold flex-shrink-0 ${colorFor(name)}`}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.4), marginLeft: i === 0 ? 0 : -Math.round(size * 0.3) }}
        >
          {initialsOf(name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={`rounded-full ${ringColor} ring-2 bg-gray-600 flex items-center justify-center text-gray-200 font-bold flex-shrink-0`}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.35), marginLeft: -Math.round(size * 0.3) }}
        >
          +{overflow}
        </span>
      )}
      {names.length === 0 && <span className="text-gray-500 text-[12px]">—</span>}
    </div>
  )
}
