import { useState } from 'react'
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
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
  if (lower.includes('provider is not enabled')) {
    return 'This sign-in provider is not enabled yet for this workspace.'
  }
  return message
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.19 7.19 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.97 11.97 0 0 0 0 10.76l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function FloatingInput({ id, type, label, icon: Icon, value, onChange, disabled, minLength, autoComplete, trailing }) {
  return (
    <div className="relative">
      <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden="true" />
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required
        disabled={disabled}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder=" "
        aria-label={label}
        className={`peer w-full pl-10 ${trailing ? 'pr-11' : 'pr-4'} pt-5 pb-1.5 rounded-xl bg-gray-700/70 border border-gray-600/50 text-white text-sm outline-none
          focus:border-blue-500/70 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-50`}
      />
      <label
        htmlFor={id}
        className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none transition-all duration-200
          peer-focus:top-[13px] peer-focus:text-[10px] peer-focus:text-blue-400 peer-focus:font-semibold peer-focus:tracking-wide
          peer-[:not(:placeholder-shown)]:top-[13px] peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:tracking-wide"
      >
        {label}
      </label>
      {trailing}
    </div>
  )
}

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
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
      const { error } = await supabase.auth.signUp({
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

  const handleOAuth = async (provider) => {
    resetMessages()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin, skipBrowserRedirect: true },
    })
    if (error) {
      setError(friendlyError(error.message))
      return
    }
    // Probe the authorize URL first — a disabled provider would otherwise
    // dump the user on a raw JSON error page instead of this form.
    try {
      const res = await fetch(data.url, { redirect: 'manual' })
      if (res.status === 400) {
        const label = provider === 'google' ? 'Google' : 'GitHub'
        setError(
          `${label} sign-in isn't enabled for this workspace yet. An admin must enable the ${label} provider in Supabase → Authentication → Providers.`
        )
        return
      }
    } catch {
      // If the probe itself fails (network/CORS), proceed with the normal flow
    }
    window.location.assign(data.url)
  }

  const handleForgotPassword = async () => {
    resetMessages()
    if (!email) {
      setError('Enter your email first, then click "Forgot password?".')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) setError(friendlyError(error.message))
    else setSuccessMessage('Password reset email sent — check your inbox.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 relative overflow-hidden px-4 py-10">
      {/* Background: grid pattern + glowing orbs + floating shapes */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(45 55 72 / 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgb(45 55 72 / 0.35) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
          maskImage: 'radial-gradient(ellipse 75% 65% at 50% 40%, black 25%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 40%, black 25%, transparent 75%)',
        }}
      />
      <div aria-hidden="true" className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-blue-500/15 blur-3xl animate-float-slow" />
      <div aria-hidden="true" className="absolute -bottom-40 -right-24 w-[460px] h-[460px] rounded-full bg-green-500/10 blur-3xl animate-float" />
      <div aria-hidden="true" className="absolute top-1/4 right-[12%] w-16 h-16 rounded-2xl border border-gray-600/30 bg-gray-800/40 rotate-12 animate-float hidden md:block" />
      <div aria-hidden="true" className="absolute bottom-1/4 left-[10%] w-10 h-10 rounded-full border border-gray-600/30 bg-gray-800/40 animate-float-slow hidden md:block" />

      {/* Auth card */}
      <div className="relative w-full max-w-[420px] animate-slide-up">
        <div className="glass rounded-2xl shadow-2xl shadow-black/40 p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center text-sm font-extrabold text-white shadow-lg shadow-blue-500/25 mb-4">
              TT
            </span>
            <h1 className="text-[26px] font-bold text-white tracking-tight">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {isSignUp ? 'Start tracking work with your team' : 'Sign in to your workspace'}
            </p>
          </div>

          {/* Segmented switch */}
          <div className="flex bg-gray-900/70 border border-gray-600/40 rounded-xl p-1 mb-6" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignUp}
              onClick={() => switchMode(false)}
              className={`flex-1 text-[13px] py-2 rounded-lg font-semibold ${
                !isSignUp ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignUp}
              onClick={() => switchMode(true)}
              className={`flex-1 text-[13px] py-2 rounded-lg font-semibold ${
                isSignUp ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          {successMessage && (
            <div role="status" className="flex items-start gap-2 bg-green-500/10 border border-green-500/30 text-green-400 text-[13px] rounded-xl p-3 mb-4 animate-fade-in">
              <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isSignUp && (
              <FloatingInput
                id="auth-name"
                type="text"
                label="Full name"
                icon={User}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                autoComplete="name"
              />
            )}

            <FloatingInput
              id="auth-email"
              type="email"
              label="Email"
              icon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
            />

            <FloatingInput
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              label="Password"
              icon={Lock}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1 rounded-md"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />
            {isSignUp && <p className="text-[11px] text-gray-500 -mt-1.5 pl-1">At least 6 characters</p>}

            {isSignUp && (
              <FloatingInput
                id="auth-confirm"
                type={showPassword ? 'text' : 'password'}
                label="Confirm password"
                icon={Lock}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                minLength={6}
                autoComplete="new-password"
              />
            )}

            {!isSignUp && (
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center gap-2 text-[13px] text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-blue-500"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-[13px] text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-[13px] rounded-xl p-3 animate-fade-in">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-400 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 text-white py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
            >
              {loading && (
                <span aria-hidden="true" className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5" aria-hidden="true">
            <span className="flex-1 h-px bg-gray-600/40" />
            <span className="text-[11px] text-gray-500 font-semibold tracking-wider">OR</span>
            <span className="flex-1 h-px bg-gray-600/40" />
          </div>

          {/* Social auth */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 bg-gray-700/60 hover:bg-gray-700 border border-gray-600/50 hover:border-gray-500/70 text-white text-[13px] font-medium py-2.5 rounded-xl disabled:opacity-50"
            >
              <GoogleIcon /> Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('github')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 bg-gray-700/60 hover:bg-gray-700 border border-gray-600/50 hover:border-gray-500/70 text-white text-[13px] font-medium py-2.5 rounded-xl disabled:opacity-50"
            >
              <GithubIcon /> Continue with GitHub
            </button>
          </div>

          <p className="text-gray-400 text-[13px] mt-6 text-center">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => switchMode(!isSignUp)}
              className="text-blue-400 font-semibold hover:text-blue-300 hover:underline"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>

        <p className="text-center text-[11px] text-gray-500 mt-5">
          Secured by Supabase Auth · Team Tracker
        </p>
      </div>
    </div>
  )
}
