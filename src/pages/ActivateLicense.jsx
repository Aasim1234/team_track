import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useLicense } from '../hooks/useLicense'

export default function ActivateLicense() {
  const { isApproved, loading, refetch } = useLicense()
  const [inputCode, setInputCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && isApproved) {
      navigate('/dashboard', { replace: true })
    }
  }, [loading, isApproved])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { data, error: rpcError } = await supabase.rpc('activate_license', {
      input_code: inputCode.trim(),
    })

    setSubmitting(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    if (data === true) {
      await refetch()
      navigate('/dashboard', { replace: true })
    } else {
      setError('Incorrect license code. Please check with the admin and try again.')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm text-white">
        <h1 className="text-2xl font-bold mb-1 text-center">Activate Your Account</h1>
        <p className="text-gray-400 text-sm text-center mb-6">
          A license code has been sent to the admin. Enter it below once you've received it.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="e.g. AB3D9F2K"
            maxLength={8}
            required
            className="w-full mb-3 px-4 py-2 rounded bg-gray-700 text-white outline-none text-center tracking-widest font-mono uppercase"
          />

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded font-semibold disabled:opacity-50"
          >
            {submitting ? 'Verifying...' : 'Activate'}
          </button>
        </form>

        <button
          onClick={handleLogout}
          className="w-full text-gray-400 hover:text-white text-sm mt-4"
        >
          Log out
        </button>
      </div>
    </div>
  )
}
