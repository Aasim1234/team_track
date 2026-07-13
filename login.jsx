const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { name } },
})

if (error) {
  setError(error.message)
  setLoading(false)
  return
}

// Supabase returns a "successful" response with no error even when the
// email is already registered but unconfirmed (anti-enumeration). Detect
// it via the empty identities array so we don't treat it as a real signup.
if (data.user && data.user.identities && data.user.identities.length === 0) {
  setError('This email is already registered. Please check your inbox for a confirmation link, or sign in instead.')
  setLoading(false)
  return
}

if (data.user) {
  try {
    await supabase.functions.invoke('send-license-email', {
      body: { name, email, userId: data.user.id },
    })
  } catch (fnError) {
    console.warn('Could not send license email:', fnError)
  }
}