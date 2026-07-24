export default function PageHeader({ title, subtitle, badge, actions }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-600 bg-gray-800">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[18px] font-semibold text-white truncate">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="text-[12px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
