import { useState, useEffect } from 'react'
import { Link as LinkIcon, GitBranch, Webhook, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import EnterpriseTable from '../../components/ui/EnterpriseTable'
import EmptyState, { InfoPanelEmptyState } from '../../components/ui/EmptyState'

export default function AdminIntegrationPage() {
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchRepos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('project_repos')
      .select('*, projects(name, key)')
      .order('created_at', { ascending: false })
    setRepos(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchRepos()
  }, [])

  const handleDelete = async (r) => {
    if (!confirm(`Unlink "${r.name}"?`)) return
    await supabase.from('project_repos').delete().eq('id', r.id)
    fetchRepos()
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Integration' }]} />
        <PageHeader title="Integration" subtitle="Linked repositories and connected services" />

        <div className="p-6 space-y-6">
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <LinkIcon size={14} className="text-gray-400" />
              <p className="text-[13px] font-semibold text-gray-300">Linked repositories</p>
              <span className="text-[11px] text-gray-500">— across every project</span>
            </div>
            <EnterpriseTable
              loading={loading}
              rows={repos}
              rowKey={(r) => r.id}
              emptyState={
                <EmptyState
                  icon={GitBranch}
                  title="No repositories linked yet"
                  description="Project members can link a repository from the Classic > Code tab on any project. Linked repos across the whole workspace will show up here."
                />
              }
              columns={[
                {
                  key: 'project',
                  label: 'Project',
                  render: (r) => (
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                      {r.projects?.key}
                    </span>
                  ),
                },
                { key: 'name', label: 'Repository', render: (r) => <span className="text-white font-medium">{r.name}</span> },
                {
                  key: 'url',
                  label: 'URL',
                  render: (r) => (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block max-w-xs">
                      {r.url}
                    </a>
                  ),
                },
                { key: 'created_at', label: 'Linked', render: (r) => new Date(r.created_at).toLocaleDateString() },
                {
                  key: 'actions',
                  label: '',
                  width: '70px',
                  render: (r) => (
                    <button onClick={() => handleDelete(r)} className="text-gray-400 hover:text-red-500 p-1">
                      <Trash2 size={13} />
                    </button>
                  ),
                },
              ]}
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <Webhook size={14} className="text-gray-400" />
              <p className="text-[13px] font-semibold text-gray-300">Jira, GitHub Actions, GitLab CI, Jenkins</p>
            </div>
            <InfoPanelEmptyState
              title="Not connected"
              description="Two-way integrations (issue sync, automated test result submission via webhook/API) aren't built yet. This needs OAuth app registration and a Supabase Edge Function to hold provider secrets server-side."
              infoTitle="What real automated results submission needs"
              infoBody="A CI job authenticates against a REST API, creates or targets a test run, and posts pass/fail results — this exists as a documented workflow in the original spec but has no backing endpoint yet. It's the right next step once Test Runs (Phase 2) land."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
