import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ListChecks, FolderTree, Users, ArrowUpRight } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'

const TYPE_LABELS = {
  functional: 'Functional', regression: 'Regression', smoke: 'Smoke', sanity: 'Sanity',
  integration: 'Integration', system: 'System', ui: 'UI', api: 'API',
  performance: 'Performance', security: 'Security', compatibility: 'Compatibility',
  uat: 'UAT', exploratory: 'Exploratory',
}

const PRIORITY_META = [
  { id: 'critical', label: 'Critical', color: 'bg-red-500' },
  { id: 'high', label: 'High', color: 'bg-orange-500' },
  { id: 'medium', label: 'Medium', color: 'bg-blue-500' },
  { id: 'low', label: 'Low', color: 'bg-gray-500' },
]

const AUTOMATION_META = [
  { id: 'automated', label: 'Automated', color: 'text-green-400' },
  { id: 'in_progress', label: 'In progress', color: 'text-blue-400' },
  { id: 'planned', label: 'Planned', color: 'text-orange-400' },
  { id: 'not_automated', label: 'Not automated', color: 'text-gray-400' },
  { id: 'not_applicable', label: 'N/A', color: 'text-gray-500' },
]

const ROLE_BADGE = {
  admin: 'bg-red-500/15 text-red-400',
  lead: 'bg-orange-500/15 text-orange-400',
  tester: 'bg-blue-500/15 text-blue-400',
  viewer: 'bg-gray-500/15 text-gray-400',
}

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="bg-gray-800/80 border border-gray-600/30 rounded-xl p-4 flex items-center gap-3.5 card-lift">
      <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${tint.bg}`}>
        <Icon size={18} className={tint.text} />
      </span>
      <div>
        <p className="text-2xl font-bold text-white leading-tight">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  )
}

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
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-800 rounded-xl" />)}
          </div>
        </div>
      </div>
    )
  }

  const total = cases.length
  const recent = cases.slice(0, 6)

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
          <div className="mb-7 animate-slide-up">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">{project.name}</h2>
              <span className="text-[11px] font-bold bg-blue-500/15 text-blue-400 px-2 py-1 rounded-md tracking-wide">
                {project.key}
              </span>
            </div>
            {project.description && <p className="text-sm text-gray-400 mt-1">{project.description}</p>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon={FolderTree} label="Test suites" value={suiteCount}
              tint={{ bg: 'bg-blue-500/15', text: 'text-blue-400' }} />
            <StatCard icon={FolderTree} label="Sections" value={sectionCount}
              tint={{ bg: 'bg-orange-500/15', text: 'text-orange-400' }} />
            <StatCard icon={ListChecks} label="Test cases" value={total}
              tint={{ bg: 'bg-green-500/15', text: 'text-green-400' }} />
            <StatCard icon={Users} label="Members" value={members.length}
              tint={{ bg: 'bg-gray-500/15', text: 'text-gray-300' }} />
          </div>

          {total === 0 ? (
            <div className="text-center py-16 bg-gray-800/50 rounded-xl border border-gray-600/20 animate-fade-in">
              <span className="inline-flex w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 items-center justify-center mb-4">
                <ListChecks size={26} />
              </span>
              <h3 className="text-lg font-semibold">No test cases yet</h3>
              <p className="text-sm text-gray-400 mt-1 mb-5">
                Build your test repository — suites, sections, and cases — to get started.
              </p>
              <button
                onClick={() => navigate(`/project/${id}/cases`)}
                className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-lg font-semibold text-sm shadow-lg shadow-blue-500/25"
              >
                Go to Test Cases
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-800 rounded-xl p-5 space-y-5">
                <div>
                  <p className="text-sm font-semibold mb-3">By priority</p>
                  {PRIORITY_META.map((p) => {
                    const count = cases.filter((c) => c.priority === p.id).length
                    return (
                      <div key={p.id} className="flex items-center gap-3 mb-2">
                        <span className="text-xs text-gray-300 w-20 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${p.color}`} />
                          {p.label}
                        </span>
                        <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                          <div
                            className={`${p.color} h-1.5 rounded-full`}
                            style={{ width: total ? `${(count / total) * 100}%` : 0 }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-6 text-right">{count}</span>
                      </div>
                    )
                  })}
                </div>
                <div>
                  <p className="text-sm font-semibold mb-3">By automation status</p>
                  {AUTOMATION_META.map((a) => {
                    const count = cases.filter((c) => c.automation_status === a.id).length
                    if (!count) return null
                    return (
                      <div key={a.id} className="flex items-center justify-between text-xs mb-1.5">
                        <span className={a.color}>{a.label}</span>
                        <span className="text-gray-400">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-5">
                <p className="text-sm font-semibold mb-3">Recently added test cases</p>
                <div className="space-y-1">
                  {recent.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/project/${id}/cases/${c.id}`)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 flex items-center gap-2 group"
                    >
                      <span className="text-[11px] text-blue-400 font-mono flex-shrink-0">{c.human_id}</span>
                      <span className="text-sm flex-1 truncate">{c.title}</span>
                      <ArrowUpRight size={13} className="text-gray-600 group-hover:text-blue-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-sm font-semibold mb-3">Project members</p>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <span
                  key={m.user_id}
                  className="flex items-center gap-2 bg-gray-700/60 rounded-lg pl-1 pr-2.5 py-1"
                >
                  <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-[10px] font-bold">
                    {m.profiles?.name?.slice(0, 2).toUpperCase() || '?'}
                  </span>
                  <span className="text-xs text-gray-200">{m.profiles?.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold capitalize ${ROLE_BADGE[m.role]}`}>
                    {m.role}
                  </span>
                </span>
              ))}
              {members.length === 0 && (
                <p className="text-xs text-gray-500">No members yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
