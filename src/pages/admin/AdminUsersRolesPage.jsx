import { Fragment, useState, useEffect, useMemo } from 'react'
import { Search, Plus, Pencil, Trash2, Users as UsersIcon, Check, Minus, Lock, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import EnterpriseTable from '../../components/ui/EnterpriseTable'
import EmptyState from '../../components/ui/EmptyState'
import Modal from '../../components/ui/Modal'
import FormField, { inputClass } from '../../components/ui/FormField'
import PrimaryButton from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { AUDIT_ACTIONS, formatAuditTime } from '../../lib/auditLog'

const TABS = ['USERS', 'GROUPS', 'ROLES']
const BUILT_IN_ORDER = ['admin', 'manager', 'tester', 'viewer']

const ROLE_TONE = {
  admin: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  manager: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  tester: 'bg-green-500/10 text-green-400 border-green-500/30',
  viewer: 'bg-gray-500/10 text-gray-400 border-gray-600/40',
}
const CUSTOM_TONE = 'bg-orange-500/10 text-orange-400 border-orange-500/30'

// Activity log entries shown under "Recent role & permission changes".
const ACCESS_ACTIONS = [
  'user_joined', 'role_assigned', 'role_created', 'role_updated', 'role_deleted',
  'permission_granted', 'permission_revoked', 'group_created', 'group_updated',
  'group_deleted', 'group_member_added', 'group_member_removed',
]

const smallSelect =
  'text-[12px] bg-gray-800 border border-gray-600 rounded px-1.5 py-1 outline-none focus:border-gray-500 disabled:opacity-60'
const ghostButton =
  'flex items-center gap-1 text-[12px] text-gray-400 hover:text-white px-1.5 py-1 rounded hover:bg-gray-650 disabled:opacity-40'
const primaryButton =
  'flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold'

function RolePill({ role }) {
  if (!role) return <span className="text-[11px] text-gray-500">—</span>
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold whitespace-nowrap ${ROLE_TONE[role.key] || CUSTOM_TONE}`}>
      {role.name}
    </span>
  )
}

function Chip({ children }) {
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 whitespace-nowrap">{children}</span>
}

const sortRoles = (list) => [...list].sort((a, b) => {
  const ia = BUILT_IN_ORDER.indexOf(a.key)
  const ib = BUILT_IN_ORDER.indexOf(b.key)
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  return new Date(a.created_at) - new Date(b.created_at)
})

export default function AdminUsersRolesPage() {
  const { user } = useAuth()
  const { can, isAdmin } = usePermissions()
  const toast = useToast()

  const [tab, setTab] = useState('USERS')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [grants, setGrants] = useState({})               // role id -> Set(permission key)
  const [groups, setGroups] = useState([])
  const [groupMembers, setGroupMembers] = useState([])   // { group_id, user_id }
  const [projects, setProjects] = useState([])
  const [memberships, setMemberships] = useState([])     // { project_id, user_id }
  const [historyVersion, setHistoryVersion] = useState(0)

  const [search, setSearch] = useState('')
  const [accessFor, setAccessFor] = useState(null)       // user whose project access is open
  const [groupModal, setGroupModal] = useState(null)     // { group } | { group: null } for new
  const [membersFor, setMembersFor] = useState(null)     // group whose members are open
  const [roleModal, setRoleModal] = useState(null)       // { role } | { role: null } for new

  const fetchAll = async () => {
    const results = await Promise.all([
      supabase.from('profiles').select('id, name, email, created_at, role_id').order('name'),
      supabase.from('roles').select('id, key, name, description, is_system, created_at'),
      supabase.from('permissions').select('key, category, label, description, sort_order').order('sort_order'),
      supabase.from('role_permissions').select('role_id, permission_key'),
      supabase.from('user_groups').select('id, name, description, created_at').order('name'),
      supabase.from('user_group_members').select('group_id, user_id'),
      supabase.from('projects').select('id, name, key').order('name'),
      supabase.from('project_members').select('project_id, user_id'),
    ])
    const failed = results.find((r) => r.error)
    if (failed) toast.error(failed.error.message)
    const [p, r, perm, rp, g, gm, pr, pm] = results.map((res) => res.data || [])
    const map = {}
    for (const row of rp) (map[row.role_id] ||= new Set()).add(row.permission_key)
    setUsers(p)
    setRoles(sortRoles(r))
    setPermissions(perm)
    setGrants(map)
    setGroups(g)
    setGroupMembers(gm)
    setProjects(pr)
    setMemberships(pm)
    setHistoryVersion((v) => v + 1)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles])
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const myRoleId = userById[user?.id]?.role_id
  const usersPerRole = useMemo(() => {
    const counts = {}
    for (const u of users) counts[u.role_id] = (counts[u.role_id] || 0) + 1
    return counts
  }, [users])

  // A non-Admin may only hand out roles whose permissions they have themselves,
  // and never Admin. The database applies the same rule.
  const assignable = (role) =>
    isAdmin || (role.key !== 'admin' && [...(grants[role.id] || [])].every((key) => can(key)))

  const canChangeRoleOf = (target) =>
    can('users.assign_roles') && target.id !== user?.id && (isAdmin || roleById[target.role_id]?.key !== 'admin')

  const changeRole = async (target, roleId) => {
    const from = roleById[target.role_id]
    const to = roleById[roleId]
    if (!to || roleId === target.role_id) return
    if (!confirm(`Change ${target.name}'s role from ${from?.name || 'none'} to ${to.name}?`)) return
    const { data, error } = await supabase.from('profiles').update({ role_id: roleId }).eq('id', target.id).select('id, role_id')
    if (error || !data?.length) {
      toast.error(error?.message || "You don't have permission to change this user's role.")
      return
    }
    setUsers((list) => list.map((u) => (u.id === target.id ? { ...u, role_id: roleId } : u)))
    setHistoryVersion((v) => v + 1)
    toast.success(`${target.name} is now ${to.name}`)
  }

  const filteredUsers = users.filter((u) => {
    const q = search.trim().toLowerCase()
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Users & Roles' }]} />
        <PageHeader title="Users & Roles" subtitle="Give each person a role, organise people into groups, and decide what each role can do" />

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
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="relative w-full max-w-xs">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or email address"
                    className={`${inputClass} pl-7`}
                  />
                </div>
                <p className="text-[11px] text-gray-500 ml-auto">
                  {users.length} user{users.length === 1 ? '' : 's'} · New sign-ups get the Tester role
                </p>
              </div>

              <EnterpriseTable
                loading={loading}
                rows={filteredUsers}
                rowKey={(u) => u.id}
                columns={[
                  {
                    key: 'name',
                    label: 'User',
                    render: (u) => (
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {(u.name || u.email || '?').slice(0, 2).toUpperCase()}
                        </span>
                        <span className="text-white font-medium">{u.name}</span>
                        {u.id === user?.id && <Chip>You</Chip>}
                      </div>
                    ),
                  },
                  { key: 'email', label: 'Email Address' },
                  {
                    key: 'role',
                    label: 'Role',
                    width: '170px',
                    render: (u) => canChangeRoleOf(u) ? (
                      <select value={u.role_id} onChange={(e) => changeRole(u, e.target.value)} className={smallSelect} aria-label={`Role for ${u.name}`}>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id} disabled={r.id !== u.role_id && !assignable(r)}>{r.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1"
                        title={
                          !can('users.assign_roles') ? undefined
                            : u.id === user?.id ? "You can't change your own role"
                              : 'Only an Admin can change an Admin'
                        }
                      >
                        <RolePill role={roleById[u.role_id]} />
                        {can('users.assign_roles') && <Lock size={10} className="text-gray-600" />}
                      </span>
                    ),
                  },
                  {
                    key: 'groups',
                    label: 'Groups',
                    render: (u) => {
                      const mine = groupMembers.filter((m) => m.user_id === u.id)
                        .map((m) => groups.find((g) => g.id === m.group_id)).filter(Boolean)
                      return mine.length ? (
                        <div className="flex flex-wrap gap-1">{mine.map((g) => <Chip key={g.id}>{g.name}</Chip>)}</div>
                      ) : <span className="text-[11px] text-gray-600">—</span>
                    },
                  },
                  {
                    key: 'projects',
                    label: 'Project Access',
                    render: (u) => {
                      const keys = memberships.filter((m) => m.user_id === u.id)
                        .map((m) => projects.find((p) => p.id === m.project_id)?.key).filter(Boolean)
                      return (
                        <div className="flex flex-wrap items-center gap-1">
                          {roleById[u.role_id]?.key === 'admin'
                            ? <Chip>All projects</Chip>
                            : keys.length ? keys.map((k) => <Chip key={k}>{k}</Chip>) : <span className="text-[11px] text-gray-600">No projects</span>}
                          {(can('users.add') || can('users.edit')) && roleById[u.role_id]?.key !== 'admin' && (
                            <button onClick={() => setAccessFor(u)} className="text-[11px] text-blue-500 hover:underline ml-1">Manage</button>
                          )}
                        </div>
                      )
                    },
                  },
                  {
                    key: 'created_at',
                    label: 'Joined',
                    render: (u) => new Date(u.created_at).toLocaleDateString(),
                  },
                ]}
              />
            </>
          )}

          {tab === 'GROUPS' && (
            <GroupsTab
              loading={loading}
              groups={groups}
              groupMembers={groupMembers}
              userById={userById}
              canEdit={can('users.edit')}
              onNew={() => setGroupModal({ group: null })}
              onEdit={(group) => setGroupModal({ group })}
              onMembers={setMembersFor}
              onDeleted={fetchAll}
            />
          )}

          {tab === 'ROLES' && (
            <RolesTab
              roles={roles}
              permissions={permissions}
              grants={grants}
              setGrants={setGrants}
              usersPerRole={usersPerRole}
              myRoleId={myRoleId}
              onNew={() => setRoleModal({ role: null })}
              onEdit={(role) => setRoleModal({ role })}
              onChanged={fetchAll}
              historyVersion={historyVersion}
              bumpHistory={() => setHistoryVersion((v) => v + 1)}
            />
          )}
        </div>
      </div>

      {accessFor && (
        <ProjectAccessModal
          target={accessFor}
          projects={projects}
          memberships={memberships}
          onClose={() => setAccessFor(null)}
          onChanged={fetchAll}
        />
      )}

      <GroupModal state={groupModal} onClose={() => setGroupModal(null)} onSaved={() => { setGroupModal(null); fetchAll() }} />

      {membersFor && (
        <GroupMembersModal
          group={membersFor}
          users={users}
          groupMembers={groupMembers}
          canEdit={can('users.edit')}
          onClose={() => setMembersFor(null)}
          onChanged={fetchAll}
        />
      )}

      <RoleModal
        state={roleModal}
        roles={roles}
        grants={grants}
        onClose={() => setRoleModal(null)}
        onSaved={() => { setRoleModal(null); fetchAll() }}
      />
    </div>
  )
}

// ------------------------------------------------------------------ groups --

function GroupsTab({ loading, groups, groupMembers, userById, canEdit, onNew, onEdit, onMembers, onDeleted }) {
  const toast = useToast()

  const remove = async (group) => {
    if (!confirm(`Delete the group "${group.name}"? Its members keep their accounts and roles.`)) return
    const { error } = await supabase.from('user_groups').delete().eq('id', group.id)
    if (error) { toast.error(error.message); return }
    toast.success('Group deleted')
    onDeleted()
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <p className="text-[12px] text-gray-500">
          Groups organise people, for example by team. They don't change what anyone can do — roles do.
        </p>
        {canEdit && (
          <button onClick={onNew} className={`${primaryButton} ml-auto`}>
            <Plus size={14} /> New Group
          </button>
        )}
      </div>

      <EnterpriseTable
        loading={loading}
        rows={groups}
        rowKey={(g) => g.id}
        emptyState={
          <div className="border border-gray-600 rounded-lg">
            <EmptyState
              icon={UsersIcon}
              title="No groups yet"
              description={canEdit ? 'Create a group to organise people into teams.' : 'An Admin can create groups to organise people into teams.'}
            />
          </div>
        }
        columns={[
          {
            key: 'name',
            label: 'Group',
            render: (g) => (
              <div>
                <span className="text-white font-medium">{g.name}</span>
                {g.description && <p className="text-[11px] text-gray-500">{g.description}</p>}
              </div>
            ),
          },
          {
            key: 'members',
            label: 'Members',
            render: (g) => {
              const names = groupMembers.filter((m) => m.group_id === g.id).map((m) => userById[m.user_id]?.name).filter(Boolean)
              return names.length ? (
                <div className="flex flex-wrap gap-1">
                  {names.slice(0, 5).map((n) => <Chip key={n}>{n}</Chip>)}
                  {names.length > 5 && <Chip>+{names.length - 5}</Chip>}
                </div>
              ) : <span className="text-[11px] text-gray-600">No members</span>
            },
          },
          { key: 'created_at', label: 'Created', render: (g) => new Date(g.created_at).toLocaleDateString() },
          {
            key: 'actions',
            label: '',
            width: '170px',
            render: (g) => (
              <div className="flex items-center justify-end gap-0.5">
                <button onClick={() => onMembers(g)} className={ghostButton}>
                  <UsersIcon size={12} /> Members
                </button>
                {canEdit && (
                  <>
                    <button onClick={() => onEdit(g)} title="Rename" className={ghostButton}><Pencil size={12} /></button>
                    <button onClick={() => remove(g)} title="Delete group" className={`${ghostButton} hover:text-red-400`}><Trash2 size={12} /></button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
    </>
  )
}

function GroupModal({ state, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(state?.group)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (state) {
      setName(state.group?.name || '')
      setDescription(state.group?.description || '')
    }
  }, [state])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const values = { name: name.trim(), description: description.trim() }
    const { error } = editing
      ? await supabase.from('user_groups').update(values).eq('id', state.group.id)
      : await supabase.from('user_groups').insert(values)
    setSaving(false)
    if (error) {
      toast.error(error.code === '23505' ? 'A group with that name already exists.' : error.message)
      return
    }
    toast.success(editing ? 'Group updated' : 'Group created')
    onSaved()
  }

  return (
    <Modal open={Boolean(state)} onClose={onClose} title={editing ? 'Edit Group' : 'New Group'}>
      <form onSubmit={submit} className="space-y-3.5">
        <FormField label="Group name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputClass} placeholder="e.g. Live View team" />
        </FormField>
        <FormField label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </FormField>
        <PrimaryButton type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Group'}
        </PrimaryButton>
      </form>
    </Modal>
  )
}

function GroupMembersModal({ group, users, groupMembers, canEdit, onClose, onChanged }) {
  const toast = useToast()
  const [addId, setAddId] = useState('')
  const memberIds = new Set(groupMembers.filter((m) => m.group_id === group.id).map((m) => m.user_id))
  const members = users.filter((u) => memberIds.has(u.id))
  const others = users.filter((u) => !memberIds.has(u.id))

  const add = async () => {
    if (!addId) return
    const { error } = await supabase.from('user_group_members').insert({ group_id: group.id, user_id: addId })
    if (error) { toast.error(error.message); return }
    setAddId('')
    onChanged()
  }

  const remove = async (userId) => {
    const { error } = await supabase.from('user_group_members').delete().eq('group_id', group.id).eq('user_id', userId)
    if (error) { toast.error(error.message); return }
    onChanged()
  }

  return (
    <Modal open onClose={onClose} title={`Members — ${group.name}`}>
      <div className="space-y-2">
        {members.map((u) => (
          <div key={u.id} className="flex items-center gap-2 bg-gray-700 rounded-md px-2.5 py-1.5">
            <span className="text-[13px] text-gray-300 flex-1 truncate">{u.name}</span>
            <span className="text-[11px] text-gray-500 truncate">{u.email}</span>
            {canEdit && (
              <button onClick={() => remove(u.id)} title="Remove from group" className="text-gray-400 hover:text-red-400 p-1">
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        {members.length === 0 && <p className="text-[12px] text-gray-500">Nobody is in this group yet.</p>}

        {canEdit && others.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-600">
            <select value={addId} onChange={(e) => setAddId(e.target.value)} className={`${smallSelect} flex-1 py-1.5`}>
              <option value="">Add a person…</option>
              {others.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
            </select>
            <button onClick={add} disabled={!addId} className="bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white p-1.5 rounded" title="Add to group">
              <Plus size={13} />
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------- project access --

function ProjectAccessModal({ target, projects, memberships, onClose, onChanged }) {
  const toast = useToast()
  const { can } = usePermissions()
  const [busy, setBusy] = useState(null)
  const memberOf = new Set(memberships.filter((m) => m.user_id === target.id).map((m) => m.project_id))

  const toggle = async (project, grant) => {
    setBusy(project.id)
    const { error } = grant
      ? await supabase.from('project_members').insert({ project_id: project.id, user_id: target.id })
      : await supabase.from('project_members').delete().eq('project_id', project.id).eq('user_id', target.id)
    setBusy(null)
    if (error) { toast.error(error.message); return }
    onChanged()
  }

  return (
    <Modal open onClose={onClose} title={`Project access — ${target.name}`}>
      <div className="space-y-2">
        <p className="text-[12px] text-gray-500">
          Choose which projects {target.name} can open. What they can do inside them is decided by their role.
        </p>
        {projects.map((p) => {
          const member = memberOf.has(p.id)
          const allowed = member ? can('users.edit') : can('users.add')
          return (
            <label key={p.id} className={`flex items-center gap-2 bg-gray-700 rounded-md px-2.5 py-2 ${allowed ? 'cursor-pointer' : 'opacity-60'}`}>
              <input
                type="checkbox"
                checked={member}
                disabled={!allowed || busy === p.id}
                onChange={(e) => toggle(p, e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{p.key}</span>
              <span className="text-[13px] text-gray-300 flex-1 truncate">{p.name}</span>
            </label>
          )
        })}
        {projects.length === 0 && <p className="text-[12px] text-gray-500">There are no projects yet.</p>}
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------- roles --

function RolesTab({ roles, permissions, grants, setGrants, usersPerRole, myRoleId, onNew, onEdit, onChanged, historyVersion, bumpHistory }) {
  const toast = useToast()
  const { can, isAdmin } = usePermissions()
  const canManage = can('roles.manage')

  const categories = useMemo(() => {
    const map = new Map()
    for (const p of permissions) {
      if (!map.has(p.category)) map.set(p.category, [])
      map.get(p.category).push(p)
    }
    return [...map]
  }, [permissions])

  const isAllowed = (role, perm) => role.key === 'admin' || Boolean(grants[role.id]?.has(perm.key))

  // Built-in roles are fixed, and nobody edits their own role's permissions or
  // grants what they don't have themselves (the database refuses those too).
  const cellEditable = (role, perm) =>
    canManage && !role.is_system && role.id !== myRoleId && (isAdmin || isAllowed(role, perm) || can(perm.key))

  const toggle = async (role, perm, allow) => {
    setGrants((current) => {
      const set = new Set(current[role.id] || [])
      if (allow) set.add(perm.key)
      else set.delete(perm.key)
      return { ...current, [role.id]: set }
    })
    const { error } = allow
      ? await supabase.from('role_permissions').insert({ role_id: role.id, permission_key: perm.key })
      : await supabase.from('role_permissions').delete().eq('role_id', role.id).eq('permission_key', perm.key)
    if (error) {
      toast.error(error.message)
      onChanged()
      return
    }
    bumpHistory()
  }

  const removeRole = async (role) => {
    const count = usersPerRole[role.id] || 0
    if (count) {
      toast.error(`${count} user${count === 1 ? ' has' : 's have'} this role. Give ${count === 1 ? 'them' : 'them all'} another role first.`)
      return
    }
    if (!confirm(`Delete the role "${role.name}"?`)) return
    const { error } = await supabase.from('roles').delete().eq('id', role.id)
    if (error) { toast.error(error.message); return }
    toast.success('Role deleted')
    onChanged()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="max-w-2xl">
          <p className="text-[12px] text-gray-400">
            Each person has one role, and the role decides what they can do everywhere in the app. The same rules are
            enforced by the database, so they can't be bypassed. Built-in roles are fixed; create a custom role to choose
            permissions yourself.
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><Check size={12} className="text-green-500" /> Allowed</span>
            <span className="flex items-center gap-1"><Minus size={12} className="text-gray-600" /> Not allowed</span>
            {canManage && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-gray-500 inline-block" /> Click to change (custom roles)</span>}
          </div>
        </div>
        {canManage && (
          <button onClick={onNew} className={`${primaryButton} ml-auto`}>
            <Plus size={14} /> New Role
          </button>
        )}
      </div>

      <div className="border border-gray-600 rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-gray-700">
              <th className="sticky left-0 z-10 bg-gray-700 text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide min-w-[260px] align-bottom">
                Permission
              </th>
              {roles.map((r) => (
                <th key={r.id} className="px-2 py-2 text-center align-bottom min-w-[112px]">
                  <div className="flex flex-col items-center gap-1" title={r.description}>
                    <RolePill role={r} />
                    <span className="text-[10px] text-gray-500 font-normal">
                      {usersPerRole[r.id] || 0} user{(usersPerRole[r.id] || 0) === 1 ? '' : 's'}
                    </span>
                    {r.is_system ? (
                      <span className="text-[10px] text-gray-600 font-normal">Built-in</span>
                    ) : canManage ? (
                      <span className="flex items-center gap-0.5">
                        <button onClick={() => onEdit(r)} title="Rename role" className="p-0.5 text-gray-500 hover:text-white"><Pencil size={11} /></button>
                        <button onClick={() => removeRole(r)} title="Delete role" className="p-0.5 text-gray-500 hover:text-red-400"><Trash2 size={11} /></button>
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-600 font-normal">Custom</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(([category, perms]) => (
              <Fragment key={category}>
                <tr>
                  <td colSpan={roles.length + 1} className="bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-300 uppercase tracking-wide border-t border-gray-600">
                    {category}
                  </td>
                </tr>
                {perms.map((p) => (
                  <tr key={p.key} className="border-t border-gray-750">
                    <td className="sticky left-0 z-10 bg-gray-900 px-3 py-1.5">
                      <p className="text-gray-300 font-medium">{p.label}</p>
                      <p className="text-[10px] text-gray-500 leading-snug">{p.description}</p>
                    </td>
                    {roles.map((r) => {
                      const allowed = isAllowed(r, p)
                      return (
                        <td key={r.id} className="px-2 py-1.5 text-center">
                          {cellEditable(r, p) ? (
                            <button
                              onClick={() => toggle(r, p, !allowed)}
                              title={`${r.name}: ${allowed ? 'allowed — click to remove' : 'not allowed — click to allow'}`}
                              aria-pressed={allowed}
                              className={`w-5 h-5 rounded border inline-flex items-center justify-center ${
                                allowed ? 'bg-green-600 border-green-600 text-white' : 'border-gray-500 hover:border-gray-300'
                              }`}
                            >
                              {allowed && <Check size={12} />}
                            </button>
                          ) : allowed ? (
                            <Check size={14} className="text-green-500 inline" aria-label="Allowed" />
                          ) : (
                            <Minus size={14} className="text-gray-600 inline" aria-label="Not allowed" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {can('admin.audit_logs') && <AccessHistory version={historyVersion} />}
    </div>
  )
}

function RoleModal({ state, roles, grants, onClose, onSaved }) {
  const toast = useToast()
  const { can, isAdmin } = usePermissions()
  const editing = Boolean(state?.role)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [copyFrom, setCopyFrom] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (state) {
      setName(state.role?.name || '')
      setDescription(state.role?.description || '')
      setCopyFrom('')
    }
  }, [state])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const values = { name: name.trim(), description: description.trim() }

    if (editing) {
      const { error } = await supabase.from('roles').update(values).eq('id', state.role.id)
      setSaving(false)
      if (error) { toast.error(error.code === '23505' ? 'A role with that name already exists.' : error.message); return }
      toast.success('Role updated')
      onSaved()
      return
    }

    const { data: created, error } = await supabase.from('roles').insert(values).select('id').single()
    if (error) {
      setSaving(false)
      toast.error(error.code === '23505' ? 'A role with that name already exists.' : error.message)
      return
    }
    // Starting from another role copies the permissions you are allowed to grant.
    const keys = copyFrom ? [...(grants[copyFrom] || [])].filter((key) => isAdmin || can(key)) : []
    if (keys.length) {
      const { error: copyError } = await supabase
        .from('role_permissions')
        .insert(keys.map((key) => ({ role_id: created.id, permission_key: key })))
      if (copyError) toast.error(`Role created, but its permissions couldn't be copied: ${copyError.message}`)
    }
    setSaving(false)
    toast.success('Role created — choose its permissions in the matrix')
    onSaved()
  }

  return (
    <Modal open={Boolean(state)} onClose={onClose} title={editing ? 'Edit Role' : 'New Role'}>
      <form onSubmit={submit} className="space-y-3.5">
        <FormField label="Role name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputClass} placeholder="e.g. QA Lead" />
        </FormField>
        <FormField label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder="What this role is for" />
        </FormField>
        {!editing && (
          <FormField label="Start with the permissions of" hint="You can change every permission afterwards.">
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={inputClass}>
              <option value="">No permissions</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </FormField>
        )}
        <PrimaryButton type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Role'}
        </PrimaryButton>
      </form>
    </Modal>
  )
}

// The activity log's record of user, role, permission and group changes.
function AccessHistory({ version }) {
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    supabase
      .from('audit_log')
      .select('id, occurred_at, actor_name, action, entity_label, field, old_value, new_value')
      .is('project_id', null)
      .in('action', ACCESS_ACTIONS)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(25)
      .then(({ data }) => setEntries(data || []))
  }, [version])

  return (
    <div>
      <p className="text-[13px] font-semibold text-white mb-2">Recent role &amp; permission changes</p>
      <EnterpriseTable
        loading={entries === null}
        rows={entries || []}
        rowKey={(e) => e.id}
        emptyState={<p className="text-[12px] text-gray-500 border border-gray-600 rounded-lg px-4 py-6 text-center">No changes recorded yet.</p>}
        columns={[
          { key: 'occurred_at', label: 'Date & Time', width: '160px', render: (e) => <span className="tabular-nums text-gray-400">{formatAuditTime(e.occurred_at)}</span> },
          { key: 'actor_name', label: 'Changed By', render: (e) => <span className="text-white">{e.actor_name}</span> },
          { key: 'action', label: 'Action', render: (e) => AUDIT_ACTIONS[e.action]?.label || e.action },
          { key: 'entity_label', label: 'User / Role / Group' },
          { key: 'field', label: 'Role / Permission', render: (e) => e.field || '—' },
          { key: 'old_value', label: 'Old Value', render: (e) => e.old_value || '—' },
          { key: 'new_value', label: 'New Value', render: (e) => e.new_value || '—' },
        ]}
      />
    </div>
  )
}
