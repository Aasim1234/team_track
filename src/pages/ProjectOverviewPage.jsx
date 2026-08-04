import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ListChecks, FolderTree, Users, ArrowUpRight } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import EnterpriseTable from '../components/ui/EnterpriseTable'
import StatusBadge from '../components/ui/StatusBadge'
import StatusProgressBar from '../components/ui/StatusProgressBar'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'
import { TEST_CASE_PRIORITY, AUTOMATION_STATUS, PROJECT_MEMBER_ROLE } from '../lib/statusConfig'

export default function ProjectOverviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [suiteCount, setSuiteCount] = useState(0)
  const [sectionCount, setSectionCount] = useState(0)
  const [cases, setCases] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const [{ data: proj }, { count: suites }, { count: sections }, { data: caseRows }, { data: memberRows }] =
        await Promise.all([
          supabase.from('projects').select('*').eq('id', id).single(),
          supabase.from('test_suites').select('id', { count: 'exact', head: true }).eq('project_id', id),
          supabase.from('sections').select('id', { count: 'exact', head: true }).eq('project_id', id),
          supabase
            .from('test_cases')
            .select('id, human_id, title, test_type, priority, automation_status, owner_id, created_at')
            .eq('project_id', id)
            .order('created_at', { ascending: false }),
          supabase.from('project_members').select('user_id, role, profiles(name, email)').eq('project_id', id),
        ])
      setProject(proj)
      setSuiteCount(suites || 0)
      setSectionCount(sections || 0)
      setCases(caseRows || [])
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

  const total = cases.length
  const recent = cases.slice(0, 6)
  const priorityCounts = Object.fromEntries(
    Object.keys(TEST_CASE_PRIORITY).map((k) => [k, cases.filter((c) => c.priority === k).length])
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader
          breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: project.name }]}
          onQuickCreate={() => navigate(`/project/${id}/cases`)}
          quickCreateLabel="New Test Case"
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
            <StatCard icon={ListChecks} label="Test cases" value={total} tint="bg-green-50 text-green-600" />
            <StatCard icon={Users} label="Members" value={members.length} tint="bg-gray-100 text-gray-600" />
          </div>

          {total === 0 ? (
            <div className="border border-gray-600 rounded-lg mb-6">
              <EmptyState
                icon={ListChecks}
                title="No test cases yet"
                description="Build your test repository — suites, sections, and cases — to get started."
                action={
                  <button
                    onClick={() => navigate(`/project/${id}/cases`)}
                    className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-md font-semibold text-[13px] text-white"
                  >
                    Go to Test Cases
                  </button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-800 border border-gray-600 rounded-lg p-5 space-y-5">
                <div>
                  <p className="text-[13px] font-semibold text-white mb-3">By priority</p>
                  <StatusProgressBar domain={TEST_CASE_PRIORITY} counts={priorityCounts} showLegend />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white mb-3">By automation status</p>
                  <div className="space-y-1.5">
                    {Object.keys(AUTOMATION_STATUS).map((key) => {
                      const count = cases.filter((c) => c.automation_status === key).length
                      if (!count) return null
                      return (
                        <div key={key} className="flex items-center justify-between text-[12px]">
                          <StatusBadge domain={AUTOMATION_STATUS} value={key} size="sm" />
                          <span className="text-gray-500">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 border border-gray-600 rounded-lg p-5">
                <p className="text-[13px] font-semibold text-white mb-3">Recently added test cases</p>
                <div className="space-y-0.5">
                  {recent.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/project/${id}/cases/${c.id}`)}
                      className="w-full text-left px-2.5 py-2 rounded-md hover:bg-gray-650 flex items-center gap-2 group"
                    >
                      <span className="text-[11px] text-blue-500 font-mono flex-shrink-0">{c.human_id}</span>
                      <span className="text-[13px] flex-1 truncate">{c.title}</span>
                      <ArrowUpRight size={13} className="text-gray-500 group-hover:text-blue-500 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

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
