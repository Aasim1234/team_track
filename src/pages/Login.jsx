import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm"
      >
        <h1 className="text-2xl font-bold text-white mb-1 text-center">Team Tracker</h1>
        <p className="text-gray-400 text-sm text-center mb-6">
          {isSignUp ? 'Create your account' : 'Sign in to continue'}
        </p>

        {isSignUp && (
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full mb-3 px-4 py-2 rounded bg-gray-700 text-white outline-none"
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full mb-3 px-4 py-2 rounded bg-gray-700 text-white outline-none"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full mb-3 px-4 py-2 rounded bg-gray-700 text-white outline-none"
        />

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded font-semibold"
        >
          {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </button>

        <p className="text-gray-400 text-sm mt-4 text-center">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-green-400 hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </form>
    </div>
  )
}