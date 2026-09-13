import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

// What the signed-in user may do comes from the database (my_permissions),
// which enforces the same rules on every request. The app uses this only to
// hide or disable actions the database would refuse anyway.
const PermissionsContext = createContext(null)

// Having any of these opens the Administration area.
export const ADMIN_AREA_PERMISSIONS = [
  'users.view', 'users.add', 'users.edit', 'users.assign_roles', 'roles.manage',
  'projects.create', 'projects.edit', 'projects.delete',
  'admin.settings', 'admin.integrations', 'admin.data',
]

// Which permissions open each Administration page (any one is enough).
export const ADMIN_PAGE_PERMISSIONS = {
  '/admin': ADMIN_AREA_PERMISSIONS,
  '/admin/projects': ['projects.create', 'projects.edit', 'projects.delete'],
  '/admin/users': ['users.view'],
  '/admin/team-performance': ['users.view'],
  '/admin/ai-hub': ['admin.settings'],
  '/admin/customizations': ['admin.settings'],
  '/admin/integration': ['admin.integrations'],
  '/admin/data-management': ['admin.data'],
  '/admin/site-settings': ['admin.settings'],
}

export function PermissionsProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [state, setState] = useState({ userId: null, role: null, isAdmin: false, permissions: new Set() })

  const load = useCallback(async () => {
    if (!user) {
      setState({ userId: null, role: null, isAdmin: false, permissions: new Set() })
      return
    }
    const { data, error } = await supabase.rpc('my_permissions')
    setState({
      userId: user.id,
      role: error ? null : data?.role || null,
      isAdmin: !error && Boolean(data?.is_admin),
      permissions: new Set(error ? [] : data?.permissions || []),
    })
  }, [user?.id])

  useEffect(() => { load() }, [load])

  // An Admin may change someone's role while they are signed in; pick that up
  // when they come back to the tab.
  useEffect(() => {
    const onFocus = () => { if (user) load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load, user])

  const value = useMemo(() => ({
    loading: authLoading || Boolean(user && state.userId !== user.id),
    role: state.role,
    isAdmin: state.isAdmin,
    can: (key) => state.permissions.has(key),
    canAny: (...keys) => keys.flat().some((k) => state.permissions.has(k)),
    reload: load,
  }), [state, load, authLoading, user])

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used inside PermissionsProvider')
  return ctx
}
