import { useNavigate, useParams } from 'react-router-dom'
import ProjectSidebar from './ProjectSidebar'
import AppHeader from './AppHeader'

export default function ComingSoonPage({ title, description, icon: Icon, phase }) {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: title }]} />
        <div className="flex flex-col items-center justify-center text-center px-6 py-24 animate-fade-in">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 items-center justify-center mb-4">
            <Icon size={26} />
          </span>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-gray-400 mt-2 max-w-md">
            {description} This module is planned for {phase} and isn't built yet — nothing here
            is functional, so there's nothing to click.
          </p>
          <button
            onClick={() => navigate(`/project/${id}/cases`)}
            className="mt-6 text-sm text-blue-400 hover:text-blue-300 hover:underline"
          >
            ← Back to Test Cases
          </button>
        </div>
      </div>
    </div>
  )
}
