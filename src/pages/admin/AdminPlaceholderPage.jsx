import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/ui/EmptyState'

export default function AdminPlaceholderPage({ title, description, icon }) {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: title }]} />
        <PageHeader title={title} />
        <div className="p-6">
          <EmptyState
            icon={icon}
            title={`${title} isn't set up yet`}
            description={`${description} This isn't built yet — nothing here is functional, so there's nothing to click.`}
          />
        </div>
      </div>
    </div>
  )
}
