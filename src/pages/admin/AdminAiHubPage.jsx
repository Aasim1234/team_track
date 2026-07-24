import { Sparkles, KeyRound, Server, Wand2 } from 'lucide-react'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'

const STEPS = [
  {
    icon: KeyRound,
    title: '1. An LLM provider API key',
    body: 'An Anthropic or OpenAI API key, supplied by you. This app never asks for or stores provider keys itself.',
  },
  {
    icon: Server,
    title: '2. A Supabase Edge Function',
    body: 'The key must live server-side — a browser app can’t call an AI provider directly without exposing the key to every visitor. A small Edge Function would hold the key and proxy generation requests.',
  },
  {
    icon: Wand2,
    title: '3. Generate → Preview → Approve',
    body: 'Once wired up, generated test cases would appear as drafts you review and edit before saving — never written straight into the repository.',
  },
]

export default function AdminAiHubPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'AI Hub' }]} />
        <PageHeader title="AI Hub" subtitle="AI-assisted test generation and suggestions" />

        <div className="p-6 max-w-2xl">
          <div className="border border-gray-600 rounded-lg p-5 mb-5">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles size={16} className="text-blue-500" />
              <p className="text-[14px] font-semibold text-white">Not connected yet</p>
            </div>
            <p className="text-[13px] text-gray-400">
              Generating test cases from requirements, suggesting edge cases, and detecting duplicates all need a
              real AI provider behind them — this page intentionally does nothing yet rather than fake a response.
              Here's exactly what's missing:
            </p>
          </div>

          <div className="space-y-3">
            {STEPS.map((s) => (
              <div key={s.title} className="flex gap-3 border border-gray-600 rounded-lg p-4">
                <span className="w-9 h-9 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <s.icon size={16} />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-white">{s.title}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">{s.body}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-gray-500 mt-5">
            Tell me you'd like this built and I'll scaffold the Edge Function and generation UI — I just can't
            supply the provider API key myself.
          </p>
        </div>
      </div>
    </div>
  )
}
