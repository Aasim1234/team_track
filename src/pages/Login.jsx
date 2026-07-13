import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function friendlyError(message) {
  if (!message) return ''
  const lower = message.toLowerCase()
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (lower.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please try again.'
  }
  if (lower.includes('password should be at least')) {
    return 'Password must be at least 6 characters long.'
  }
  if (lower.includes('unable to validate email') || lower.includes('invalid email')) {
    return 'Please enter a valid email address.'
  }
  return message
}

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const resetMessages = () => {
    setError('')
    setSuccessMessage('')
  }

  const switchMode = (signUp) => {
    setIsSignUp(signUp)
    resetMessages()
    setPassword('')
    setConfirmPassword('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    resetMessages()

    if (isSignUp) {
      if (!name.trim()) {
        setError('Please enter your full name.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setError("Passwords don't match. Please re-enter them.")
        return
      }
    }

    setLoading(true)

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      })

      setLoading(false)

      if (error) {
        setError(friendlyError(error.message))
        return
      }

      // Signup worked — guide the user clearly to the next step instead of
      // leaving them on the same form wondering what happened.
      setSuccessMessage('Account created! You can now sign in below with your email and password.')
      setIsSignUp(false)
      setPassword('')
      setConfirmPassword('')
      setName('')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) setError(friendlyError(error.message))
    }
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

        {/* Mode toggle — makes it unambiguous which mode is active */}
        <div className="flex bg-gray-900 rounded-lg p-1 mb-5">
          <button
            type="button"
            onClick={() => switchMode(false)}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition ${
              !isSignUp ? 'bg-green-500 text-white' : 'text-gray-400'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode(true)}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition ${
              isSignUp ? 'bg-green-500 text-white' : 'text-gray-400'
            }`}
          >
            Sign Up
          </button>
        </div>

        {successMessage && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded p-3 mb-4">
            ✓ {successMessage}
          </div>
        )}

        {isSignUp && (
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
            className="w-full mb-3 px-4 py-2 rounded bg-gray-700 text-white outline-none disabled:opacity-50"
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          className="w-full mb-3 px-4 py-2 rounded bg-gray-700 text-white outline-none disabled:opacity-50"
        />

        <div className="relative mb-1">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            disabled={loading}
            className="w-full px-4 py-2 pr-16 rounded bg-gray-700 text-white outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {isSignUp && (
          <p className="text-xs text-gray-500 mb-3">At least 6 characters</p>
        )}

        {isSignUp && (
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            disabled={loading}
            className="w-full mb-3 px-4 py-2 rounded bg-gray-700 text-white outline-none disabled:opacity-50"
          />
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded p-3 mb-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white py-2 rounded font-semibold flex items-center justify-center gap-2"
        >
          {loading && (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
          )}
          {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : isSignUp ? 'Sign Up' : 'Sign In'}
        </button>

        <p className="text-gray-400 text-sm mt-4 text-center">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => switchMode(!isSignUp)}
            className="text-green-400 hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </form>
    </div>
  )
}
