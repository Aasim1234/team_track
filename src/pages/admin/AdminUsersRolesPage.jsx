import { useState, useEffect } from 'react'
import { Search, UserCog, Trash2, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import EnterpriseTable from '../../components/ui/EnterpriseTable'
import Modal from '../../components/ui/Modal'
import StatusBadge from '../../components/ui/StatusBadge'
import { inputClass } from '../../components/ui/FormField'
import { PROJECT_MEMBER_ROLE } from '../../lib/statusConfig'

const TABS = ['USERS', 'GROUPS', 'ROLES']
const ROLE_OPTIONS = Object.keys(PROJECT_MEMBER_ROLE)

function ManageMembershipsModal({ user, projects, onClose, onChanged }) {
  const [memberships, setMemberships] = useState([])
  const [addProjectId, setAddProjectId] = useState('')
  const [addRole, setAddRole] = useState('tester')

  const fetchMemberships = async () => {
    const { data } = await supabase
      .from('project_members')
      .select('project_id, role, projects(name, key)')
      .eq('user_id', user.id)
    setMemberships(data || [])
  }

  useEffect(() => {
    fetchMemberships()
  }, [user.id])

  const changeRole = async (projectId, role) => {
    await supabase.from('project_members').update({ role }).eq('project_id', projectId).eq('user_id', user.id)
    fetchMemberships()
    onChanged()
  }

  const removeMembership = async (projectId) => {
    await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', user.id)
    fetchMemberships()
    onChanged()
  }

  const addMembership = async () => {
    if (!addProjectId) return
    await supabase.from('project_members').insert({ project_id: addProjectId, user_id: user.id, role: addRole })
    setAddProjectId('')
    fetchMemberships()
    onChanged()
  }

  const availableProjects = projects.filter((p) => !memberships.some((m) => m.project_id === p.id))

  return (
    <Modal open onClose={onClose} title={`Project access — ${user.name}`}>
      <div className="space-y-3">
        {memberships.map((m) => (
          <div key={m.project_id} className="flex items-center gap-2 bg-gray-700 rounded-md px-2.5 py-1.5">
            <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded flex-shrink-0">
              {m.projects?.key}
            </span>
            <span className="text-[13px] text-gray-300 flex-1 truncate">{m.projects?.name}</span>
            <select
              value={m.role}
              onChange={(e) => changeRole(m.project_id, e.target.value)}
              className="text-[12px] bg-gray-800 border border-gray-600 rounded px-1.5 py-1 outline-none"
            >
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{PROJECT_MEMBER_ROLE[r].label}</option>)}
            </select>
            <button onClick={() => removeMembership(m.project_id)} className="text-gray-400 hover:text-red-500 p-1">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {memberships.length === 0 && <p className="text-[12px] text-gray-500">Not a member of any project yet.</p>}

        {availableProjects.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-600">
            <select
              value={addProjectId}
              onChange={(e) => setAddProjectId(e.target.value)}
              className="flex-1 text-[12px] bg-gray-700 border border-gray-600 rounded px-2 py-1.5 outline-none"
            >
              <option value="">Add to project…</option>
              {availableProjects.map((p) => <option key={p.id} value={p.id}>{p.key} — {p.name}</option>)}
            </select>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              className="text-[12px] bg-gray-700 border border-gray-600 rounded px-1.5 py-1.5 outline-none"
            >
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{PROJECT_MEMBER_ROLE[r].label}</option>)}
            </select>
            <button
              onClick={addMembership}
              disabled={!addProjectId}
              className="bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white p-1.5 rounded"
            >
              <Plus size={13} />
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function AdminUsersRolesPage() {
  const [tab, setTab] = useState('USERS')
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [managingUser, setManagingUser] = useState(null)

  const fetchUsers = async () => {
    setLoading(true)
    const [{ data: profileRows }, { data: projectRows }] = await Promise.all([
      supabase.from('profiles').select('id, name, email, created_at').order('name'),
      supabase.from('projects').select('id, name, key').order('name'),
    ])
    const { data: memberRows } = await supabase.from('project_members').select('user_id, role, projects(key)')
    const withMemberships = (profileRows || []).map((u) => ({
      ...u,
      memberships: (memberRows || []).filter((m) => m.user_id === u.id),
    }))
    setUsers(withMemberships)
    setProjects(projectRows || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const filteredUsers = users.filter(
    (u) =>
      !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Users & Roles' }]} />
        <PageHeader title="Users & Roles" subtitle="Manage who has access to which projects, and at what level" />

        <div className="px-6 pt-3 flex items-center gap-4 border-b border-gray-600">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[12px] font-semibold pb-2.5 tracking-wide ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'USERS' && (
            <>
              <div className="relative max-w-xs mb-3">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or email address"
                  className={`${inputClass} pl-7`}
                />
              </div>

              <EnterpriseTable
                loading={loading}
                rows={filteredUsers}
                rowKey={(u) => u.id}
                columns={[
                  {
                    key: 'name',
                    label: 'User',
                    render: (u) => <span className="text-white font-medium">{u.name}</span>,
                  },
                  { key: 'email', label: 'Email Address' },
                  {
                    key: 'memberships',
                    label: 'Project Access',
                    render: (u) => (
                      <div className="flex flex-wrap gap-1">
                        {u.memberships.map((m, i) => (
                          <span key={i} className="flex items-center gap-1">
                            <span className="text-[10px] px-1 py-0.5 rounded bg-gray-700 text-gray-400">
                              {m.projects?.key}
                            </span>
                            <StatusBadge domain={PROJECT_MEMBER_ROLE} value={m.role} size="sm" />
                          </span>
                        ))}
                        {u.memberships.length === 0 && <span className="text-[11px] text-gray-500">No projects</span>}
                      </div>
                    ),
                  },
                  {
                    key: 'created_at',
                    label: 'Joined',
                    render: (u) => new Date(u.created_at).toLocaleDateString(),
                  },
                  {
                    key: 'actions',
                    label: '',
                    width: '90px',
                    render: (u) => (
                      <button
                        onClick={() => setManagingUser(u)}
                        className="flex items-center gap-1 text-[12px] text-blue-600 hover:underline"
                      >
                        <UserCog size={13} /> Manage
                      </button>
                    ),
                  },
                ]}
              />
            </>
          )}

          {tab === 'GROUPS' && (
            <p className="text-[13px] text-gray-500 py-8 text-center">
              Groups aren't available yet — access is currently managed per-project from the Users tab.
            </p>
          )}

          {tab === 'ROLES' && (
            <div className="border border-gray-600 rounded-lg divide-y divide-gray-100">
              {Object.entries(PROJECT_MEMBER_ROLE).map(([key, role]) => (
                <div key={key} className="flex items-center gap-3 px-4 py-3">
                  <StatusBadge domain={PROJECT_MEMBER_ROLE} value={key} />
                  <p className="text-[12px] text-gray-500">
                    {key === 'admin' && 'Full access: manage members, test repository, and project settings.'}
                    {key === 'lead' && 'Can create and delete test suites, sections, and test cases.'}
                    {key === 'tester' && 'Can create and edit test suites, sections, and test cases.'}
                    {key === 'viewer' && 'Read-only access to the test repository.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {managingUser && (
        <ManageMembershipsModal
          user={managingUser}
          projects={projects}
          onClose={() => setManagingUser(null)}
          onChanged={fetchUsers}
        />
      )}
    </div>
  )
}
