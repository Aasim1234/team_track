import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ListChecks, FolderTree, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import EnterpriseTable from '../components/ui/EnterpriseTable'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'
import { PROJECT_MEMBER_ROLE } from '../lib/statusConfig'

export default function ProjectOverviewPage() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [suiteCount, setSuiteCount] = useState(0)
  const [sectionCount, setSectionCount] = useState(0)
  const [caseCount, setCaseCount] = useState(0)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const [{ data: proj }, { count: suites }, { count: sections }, { count: cases }, { data: memberRows }] =
        await Promise.all([
          supabase.from('projects').select('*').eq('id', id).single(),
          supabase.from('test_suites').select('id', { count: 'exact', head: true }).eq('project_id', id),
          supabase.from('sections').select('id', { count: 'exact', head: true }).eq('project_id', id),
          supabase.from('test_cases').select('id', { count: 'exact', head: true }).eq('project_id', id),
          supabase.from('project_members').select('user_id, role, profiles(name, email)').eq('project_id', id),
        ])
      setProject(proj)
      setSuiteCount(suites || 0)
      setSectionCount(sections || 0)
      setCaseCount(cases || 0)
      setMembers(memberRows || [])
      setLoading(false)
    }
    fetchData()
  }, [id])

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <ProjectSidebar />
        <div className="flex-1 min-w-0 p-6 animate-pulse">
          <div className="h-8 w-64 bg-gray-800 rounded-lg mb-3" />
          <div className="h-4 w-96 bg-gray-800 rounded-lg mb-8" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-800 rounded-lg" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader
          breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: project.name }]}
        />

        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">{project.name}</h2>
              <span className="text-[11px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded-md tracking-wide">
                {project.key}
              </span>
            </div>
            {project.description && <p className="text-sm text-gray-400 mt-1">{project.description}</p>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon={FolderTree} label="Test suites" value={suiteCount} tint="bg-blue-50 text-blue-600" />
            <StatCard icon={FolderTree} label="Sections" value={sectionCount} tint="bg-orange-50 text-orange-600" />
            <StatCard icon={ListChecks} label="Test cases" value={caseCount} tint="bg-green-50 text-green-600" />
            <StatCard icon={Users} label="Members" value={members.length} tint="bg-gray-100 text-gray-600" />
          </div>

          {/* Reserved for the most recently created Test Plans (newest first by
              their creation time, each opening its plan). Deliberately not
              connected to test cases, assignments or To-Do. Empty until then. */}
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-5 mb-6">
            <p className="text-[13px] font-semibold text-white mb-3">Recently added test cases in test plan</p>
            <p className="px-2.5 py-2 text-[13px] text-gray-500">No recently added test cases in test plan.</p>
          </div>

          <div>
            <p className="text-[13px] font-semibold text-white mb-3">Project members</p>
            <EnterpriseTable
              rows={members}
              rowKey={(m) => m.user_id}
              emptyState={<EmptyState icon={Users} title="No members yet" description="Add teammates to this project from Users & Roles." />}
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  render: (m) => (
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {m.profiles?.name?.slice(0, 2).toUpperCase() || '?'}
                      </span>
                      <span className="text-white">{m.profiles?.name}</span>
                    </div>
                  ),
                },
                { key: 'email', label: 'Email', render: (m) => m.profiles?.email || '—' },
                { key: 'role', label: 'Role', render: (m) => <StatusBadge domain={PROJECT_MEMBER_ROLE} value={m.role} size="sm" /> },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
