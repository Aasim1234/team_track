import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useLicense() {
  const { user } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    if (!user) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase.rpc('get_my_license_status')
    if (!error && data && data.length > 0) {
      setStatus(data[0].status)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchStatus()
  }, [user])

  const isApproved = status === 'approved'

  return { status, isApproved, loading, refetch: fetchStatus }
}
