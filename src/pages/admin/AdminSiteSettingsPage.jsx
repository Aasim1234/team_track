import { useState, useEffect } from 'react'
import { ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'

const PROJECT_REF = import.meta.env.VITE_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
const DASHBOARD_URL = PROJECT_REF ? `https://supabase.com/dashboard/project/${PROJECT_REF}` : 'https://supabase.com/dashboard'

function Row({ label, value, badge }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-[13px] text-gray-300">{label}</span>
      {badge || <span className="text-[13px] text-white font-mono">{value}</span>}
    </div>
  )
}

function ProviderBadge({ enabled }) {
  return (
    <span className={`flex items-center gap-1 text-[12px] font-medium ${enabled ? 'text-green-600' : 'text-gray-500'}`}>
      {enabled ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      {enabled ? 'Enabled' : 'Not enabled'}
    </span>
  )
}

export default function AdminSiteSettingsPage() {
  const [providers, setProviders] = useState({ email: true, google: false, github: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    })
      .then((r) => r.json())
      .then((s) =>
        setProviders({
          email: s.external?.email !== false,
          google: !!s.external?.google,
          github: !!s.external?.github,
        })
      )
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Site Settings' }]} />
        <PageHeader title="Site Settings" subtitle="Environment, authentication, and security configuration" />

        <div className="p-6 max-w-2xl space-y-6">
          <div>
            <p className="text-[12px] font-semibold text-gray-300 mb-2">General</p>
            <div className="border border-gray-600 rounded-lg">
              <Row label="Site name" value="Team Tracker" />
              <Row label="Date format" value="MM/DD/YYYY" />
              <Row label="Timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} />
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
              These reflect the app's current fixed conventions — a settings table to make them editable isn't built yet.
            </p>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-gray-300 mb-2">Authentication providers</p>
            <div className="border border-gray-600 rounded-lg">
              {loading ? (
                <div className="h-24 bg-gray-700 animate-pulse rounded-lg" />
              ) : (
                <>
                  <Row label="Email & Password" badge={<ProviderBadge enabled={providers.email} />} />
                  <Row label="Google OAuth" badge={<ProviderBadge enabled={providers.google} />} />
                  <Row label="GitHub OAuth" badge={<ProviderBadge enabled={providers.github} />} />
                </>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
              Live status read from Supabase Auth. To enable a provider, configure it in the Supabase Dashboard.
            </p>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-gray-300 mb-2">Security</p>
            <div className="border border-gray-600 rounded-lg p-4">
              <p className="text-[13px] text-gray-300 mb-1">Password policy, session timeout, and login rate limits</p>
              <p className="text-[12px] text-gray-500 mb-3">
                These are enforced by Supabase Auth directly and can't be changed from inside this app — there's no
                client-safe way to modify them without exposing a service-role key to the browser.
              </p>
              <a
                href={`${DASHBOARD_URL}/auth/policies`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:underline"
              >
                Open in Supabase Dashboard <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
