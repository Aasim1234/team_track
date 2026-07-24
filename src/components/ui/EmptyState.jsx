import { Info } from 'lucide-react'

// Simple centered empty state — the default for most lists/pages.
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-14 px-6">
      {Icon && (
        <span className="inline-flex w-11 h-11 rounded-lg bg-blue-50 text-blue-600 items-center justify-center mb-3">
          <Icon size={20} />
        </span>
      )}
      <h3 className="text-[14px] font-semibold text-white">{title}</h3>
      {description && <p className="text-[12px] text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Two-column bordered variant — "This project doesn't contain any X yet" +
// a "What's an X?" explainer panel, matching the Reports-style empty state.
export function InfoPanelEmptyState({ title, description, infoTitle, infoBody, action }) {
  return (
    <div className="border border-gray-600 rounded-lg grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-600">
      <div className="p-5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-300">
          <Info size={14} className="text-gray-400" /> {title}
        </p>
        <p className="text-[12px] text-gray-500 mt-1.5">{description}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div className="p-5">
        <p className="text-[13px] font-semibold text-gray-300">{infoTitle}</p>
        <p className="text-[12px] text-gray-500 mt-1.5">{infoBody}</p>
      </div>
    </div>
  )
}
