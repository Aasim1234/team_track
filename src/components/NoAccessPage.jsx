import { Lock } from 'lucide-react'
import ProjectSidebar from './ProjectSidebar'
import AppHeader from './AppHeader'

export function NoAccess({
  title = "You don't have access to this",
  description = 'Your role doesn’t include the permission needed here. Ask an Admin if you need it.',
}) {
  return (
    <div className="text-center py-16 px-6">
      <span className="inline-flex w-11 h-11 rounded-lg bg-gray-700 text-gray-400 items-center justify-center mb-3">
        <Lock size={20} />
      </span>
      <h3 className="text-[14px] font-semibold text-white">{title}</h3>
      <p className="text-[12px] text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>
    </div>
  )
}

// Shown in place of a page the signed-in user's role doesn't allow.
export default function NoAccessPage({ title }) {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: title || 'No access' }]} />
        <NoAccess title={title ? `You don't have access to ${title}` : undefined} />
      </div>
    </div>
  )
}
