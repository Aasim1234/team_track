import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { History, Lock, RefreshCw, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import { VMS_RESULT } from '../lib/statusConfig'
import { AUDIT_ACTIONS, formatAuditTime } from '../lib/auditLog'

const PAGE_SIZE = 100

const EMPTY_FILTERS = { user: '', action: '', plan: '', result: '', search: '', from: '', to: '' }

const RESULT_PILL = {
  Pass: 'bg-green-500/10 text-green-400 border-green-500/30',
  Fail: 'bg-red-500/10 text-red-400 border-red-500/30',
  Blocked: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  Retest: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  'N/A': 'bg-gray-500/10 text-gray-400 border-gray-600/40',
  'Not Tested': 'bg-gray-700/40 text-gray-400 border-gray-600/40',
}

// Result values render as the same coloured pills the grid uses; long text
// (test steps, reasons) is clamped with the full text on hover.
function Value({ entry, value }) {
  if (value == null || value === '') return <span className="text-gray-600">—</span>
  if (entry.field === 'Result' && RESULT_PILL[value]) {
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-semibold ${RESULT_PILL[value]}`}>
        {value}
      </span>
    )
  }
  return <span className="block whitespace-pre-wrap break-words line-clamp-3" title={value}>{value}</span>
}

const selectClass =
  'bg-gray-800 border border-gray-600 rounded-md px-2 py-1.5 text-[12px] text-gray-200 outline-none focus:border-gray-500'

// Day boundaries in the viewer's own timezone.
const startOfDay = (ymd) => new Date(`${ymd}T00:00:00`)
const startOfNextDay = (ymd) => { const d = startOfDay(ymd); d.setDate(d.getDate() + 1); return d }

export default function ActivityLogPage() {
  const { id: projectId } = useParams()
  const [project, setProject] = useState(null)
  const [facets, setFacets] = useState({ users: [], plans: [] })
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [searchInput, setSearchInput] = useState('')
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('id, name').eq('id', projectId).single(),
      supabase.from('audit_log_facets').select('kind, value, label').eq('project_id', projectId),
    ]).then(([{ data: proj }, { data: facetRows }]) => {
      setProject(proj)
      const byLabel = (a, b) => (a.label || '').localeCompare(b.label || '')
      setFacets({
        users: (facetRows || []).filter((f) => f.kind === 'user').sort(byLabel),
        plans: (facetRows || []).filter((f) => f.kind === 'plan').sort(byLabel),
      })
    })
  }, [projectId])

  // Search is debounced so the log isn't re-queried on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim() })), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Filtering happens in the database, so the page stays quick as the log grows.
  const query = useCallback((offset) => {
    let q = supabase.from('audit_log').select('*', { count: 'exact' }).eq('project_id', projectId)
    if (filters.user === 'system') q = q.is('actor_id', null)
    else if (filters.user) q = q.eq('actor_id', filters.user)
    if (filters.action) q = q.eq('action', filters.action)
    if (filters.plan) q = q.eq('plan_id', filters.plan)
    if (filters.result) q = q.eq('result', filters.result)
    if (filters.search) q = q.ilike('entity_label', `%${filters.search}%`)
    if (filters.from) q = q.gte('occurred_at', startOfDay(filters.from).toISOString())
    if (filters.to) q = q.lt('occurred_at', startOfNextDay(filters.to).toISOString())
    return q.order('occurred_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
  }, [projectId, filters])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, count, error: err } = await query(0)
    setError(err?.message || null)
    setEntries(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [query])

  useEffect(() => { load() }, [load])

  const loadMore = async () => {
    setLoadingMore(true)
    const { data, error: err } = await query(entries.length)
    if (err) setError(err.message)
    else setEntries((prev) => [...prev, ...(data || [])])
    setLoadingMore(false)
  }

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }))
  const filtered = Object.entries(filters).some(([, v]) => v)
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setSearchInput('') }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader
          breadcrumb={[
            { label: 'Projects', to: '/dashboard' },
            { label: project?.name, to: `/project/${projectId}/overview` },
            { label: 'Activity Log' },
          ]}
        />
        <PageHeader
          title="Activity Log"
          subtitle="Who changed what, and when, across this project"
          actions={
            <button
              onClick={load}
              className="flex items-center gap-1.5 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          }
        />

        <div className="p-6 space-y-3">
          <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Lock size={12} /> Read-only. Entries are recorded by the system and can't be edited or deleted.
          </p>

          {/* One filter row; every filter scopes the table below. */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={filters.user} onChange={(e) => setFilter('user', e.target.value)} className={selectClass} aria-label="User">
              <option value="">All users</option>
              {facets.users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
            <select value={filters.action} onChange={(e) => setFilter('action', e.target.value)} className={selectClass} aria-label="Action type">
              <option value="">All actions</option>
              {Object.entries(AUDIT_ACTIONS).map(([key, a]) => <option key={key} value={key}>{a.label}</option>)}
            </select>
            <select value={filters.plan} onChange={(e) => setFilter('plan', e.target.value)} className={selectClass} aria-label="Test plan">
              <option value="">All test plans</option>
              {facets.plans.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={filters.result} onChange={(e) => setFilter('result', e.target.value)} className={selectClass} aria-label="Result status">
              <option value="">Any result</option>
              {Object.entries(VMS_RESULT).map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
            </select>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Test case or item…"
                className="bg-gray-800 border border-gray-600 rounded-md pl-7 pr-2 py-1.5 text-[12px] text-gray-200 w-52 outline-none focus:border-gray-500"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[12px] text-gray-400">
              From
              <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter('from', e.target.value)} className={selectClass} />
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-gray-400">
              To
              <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} className={selectClass} />
            </label>
            {filtered && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-white px-1.5">
                <X size={12} /> Clear filters
              </button>
            )}
          </div>

          {error ? (
            <EmptyState icon={History} title="Couldn't load the activity log" description={error} />
          ) : (
            <>
              <div className={`border border-gray-800 rounded-lg overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
                <table className="w-full border-collapse table-fixed min-w-[1160px]">
                  <thead>
                    <tr className="bg-gray-800/80 text-left">
                      {[
                        ['Date & Time', 'w-[150px]'], ['User', 'w-[130px]'], ['Action', 'w-[150px]'],
                        ['Test Case / Item', 'w-[220px]'], ['Test Plan', 'w-[150px]'],
                        ['Old Value', ''], ['New Value', ''], ['Comment', 'w-[200px]'],
                      ].map(([label, w]) => (
                        <th key={label} className={`${w} px-2.5 py-2 text-[11px] font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-700`}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="align-top border-b border-gray-800/70 text-[12px]">
                        <td className="px-2.5 py-2 text-gray-400 whitespace-nowrap tabular-nums">{formatAuditTime(e.occurred_at)}</td>
                        <td className="px-2.5 py-2 text-white font-medium truncate" title={e.actor_name}>{e.actor_name}</td>
                        <td className="px-2.5 py-2 text-gray-200">
                          {AUDIT_ACTIONS[e.action]?.label || e.action}
                          {e.field && e.action !== 'result_changed' && <span className="block text-[11px] text-gray-500">{e.field}</span>}
                        </td>
                        <td className="px-2.5 py-2 text-gray-200 break-words" title={e.entity_label || ''}>
                          <span className="line-clamp-2">{e.entity_label || '—'}</span>
                        </td>
                        <td className="px-2.5 py-2 text-gray-400 truncate" title={e.plan_name || ''}>{e.plan_name || '—'}</td>
                        <td className="px-2.5 py-2 text-gray-300"><Value entry={e} value={e.old_value} /></td>
                        <td className="px-2.5 py-2 text-gray-300"><Value entry={e} value={e.new_value} /></td>
                        <td className="px-2.5 py-2 text-gray-400"><Value entry={e} value={e.comment} /></td>
                      </tr>
                    ))}
                    {!loading && entries.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-[12px] text-gray-500">
                          {filtered ? 'No activity matches these filters.' : 'No activity recorded yet. Changes appear here as people work.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>Showing {entries.length.toLocaleString()} of {total.toLocaleString()} entries</span>
                {entries.length < total && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-[12px] font-semibold disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : `Load ${Math.min(PAGE_SIZE, total - entries.length)} more`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
