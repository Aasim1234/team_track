import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Users, ShieldCheck, ArrowUpRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 flex items-center gap-3">
      <span className="w-9 h-9 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
        <Icon size={17} />
      </span>
      <div>
        <p className="text-xl font-semibold text-white leading-tight">{value}</p>
        <p className="text-[12px] text-gray-500">{label}</p>
      </div>
    </div>
  )
}

export default function AdminOverviewPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [userCount, setUserCount] = useState(0)
  const [adminCount, setAdminCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: projectRows }, { count: users }, { count: admins }] = await Promise.all([
        supabase.from('projects').select('id, name, key, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('project_members').select('user_id', { count: 'exact', head: true }).eq('role', 'admin'),
      ])
      setProjects(projectRows || [])
      setUserCount(users || 0)
      setAdminCount(admins || 0)
      setLoading(false)
    }
    fetchData()
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration' }, { label: 'Overview' }]} />
        <PageHeader title="Overview" subtitle="Cross-project administration for your workspace" />

        <div className="p-6 max-w-4xl">
          {loading ? (
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-gray-700 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard icon={FolderKanban} label="Total projects" value={projects.length === 5 ? '5+' : projects.length} />
              <StatCard icon={Users} label="Total users" value={userCount} />
              <StatCard icon={ShieldCheck} label="Project admin roles" value={adminCount} />
            </div>
          )}

          <div className="bg-gray-800 border border-gray-600 rounded-lg">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-600">
              <p className="text-[12px] font-semibold text-gray-300">Recent projects</p>
              <button
                onClick={() => navigate('/admin/projects')}
                className="text-[12px] text-blue-600 hover:underline flex items-center gap-1"
              >
                View all <ArrowUpRight size={12} />
              </button>
            </div>
            {projects.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 px-4 py-2 border-b border-gray-100 last:border-0">
                <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{p.key}</span>
                <span className="text-[13px] text-gray-300 flex-1">{p.name}</span>
                <span className="text-[11px] text-gray-500">{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
            ))}
            {!loading && projects.length === 0 && (
              <p className="text-[12px] text-gray-500 px-4 py-4">No projects yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
