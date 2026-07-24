// A titled panel for page-specific quick actions, meant to sit in a sidebar
// or content rail (e.g. "Milestones — Add | View All" under Project Overview
// nav). Only render this with REAL actions wired to real data — an empty or
// fake instance is worse than omitting it.
export default function ContextActionPanel({ title, actions, children }) {
  return (
    <div className="px-2.5 py-2.5 border-t border-gray-600">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">{title}</p>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
