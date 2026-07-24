import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

// True if the current user is an 'admin' in project_members for at least one
// project. Used to gate /admin/* — there is no separate site-wide admin flag,
// so project-admin status is the closest real signal available.
export function useProjectAdminAccess() {
  const { user, loading: authLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(null)

  useEffect(() => {
    if (!user) {
      setIsAdmin(authLoading ? null : false)
      return
    }
    supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .limit(1)
      .then(({ data }) => setIsAdmin((data || []).length > 0))
  }, [user, authLoading])

  return { isAdmin, loading: isAdmin === null }
}
