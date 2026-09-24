import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, FileSpreadsheet, Search } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAllRows'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import EnterpriseTable from './ui/EnterpriseTable'
import EmptyState from './ui/EmptyState'
import StatusBadge from './ui/StatusBadge'
import StatusProgressBar from './ui/StatusProgressBar'
import { inputClass } from './ui/FormField'
import { useToast } from './ui/Toast'
import { sortReleases } from './ReleaseVersions'
import { TEST_PLAN_STATUS, VMS_RESULT } from '../lib/statusConfig'
import { formatPercent } from '../lib/testMetrics'
import { formatCaseId } from '../lib/testCaseId'
import { formatAuditTime } from '../lib/auditLog'
import { downloadReleaseReport } from '../lib/releaseReportExport'

// Reports → Release Reports. A report appears here when a test plan is marked
// Pass or Discard; the database saves the plan's results at that moment.

const countsOf = (r) => ({
  pass: r.passed, fail: r.failed, blocked: r.blocked, retest: r.retest, na: r.na, not_tested: r.not_tested,
})

export default function ReleaseReports({ projectId }) {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [release, setRelease] = useState('all')

  useEffect(() => {
    supabase
      .from('release_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('decided_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        setReports(data || [])
        setLoading(false)
      })
  }, [projectId])

  // Opened from a test plan: ?tab=releases&plan=<plan id>&release=<release version id>
  const selected = reports.find((r) =>
    r.id === searchParams.get('report')
    || (r.plan_id && r.plan_id === searchParams.get('plan') && r.release_version_id === searchParams.get('release')))

  const open = (report) => setSearchParams({ tab: 'releases', report: report.id })
  const back = () => setSearchParams({ tab: 'releases' })

  if (selected) return <ReleaseReportView report={selected} onBack={back} />

  const releaseNames = sortReleases([...new Set(reports.map((r) => r.release_name))].map((name) => ({ name })))
  const rows = reports.filter((r) => release === 'all' || r.release_name === release)

  return (
    <div className="space-y-3">
      {reports.length > 0 && (
        <label className="flex items-center gap-2 text-[12px] text-gray-400">
          Release
          <select
            value={release}
            onChange={(e) => setRelease(e.target.value)}
            aria-label="Select release"
            className="bg-gray-800 border border-gray-600 rounded-md px-2 py-1.5 text-[12px] text-gray-300 outline-none focus:border-gray-500"
          >
            <option value="all">All releases ({reports.length})</option>
            {releaseNames.map(({ name }) => (
              <option key={name} value={name}>{name} ({reports.filter((r) => r.release_name === name).length})</option>
            ))}
          </select>
        </label>
      )}

      <EnterpriseTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={open}
        emptyState={
          <EmptyState
            icon={FileSpreadsheet}
            title="No release reports yet"
            description="When a test plan's status is set to Pass or Discard, its release report appears here."
          />
        }
        columns={[
          { key: 'release', label: 'Release Version', width: '120px', render: (r) => <span className="text-white font-semibold">{r.release_name}</span> },
          { key: 'plan', label: 'Test Plan', render: (r) => <span className="text-white">{r.plan_name}</span> },
          {
            key: 'status',
            label: 'Status',
            render: (r) => (
              <div className="min-w-0">
                <StatusBadge domain={TEST_PLAN_STATUS} value={r.status} />
                {r.status === 'discard' && (
                  <p className="text-[11px] text-red-500 truncate max-w-[220px] mt-0.5" title={r.discard_reason}>{r.discard_reason}</p>
                )}
              </div>
            ),
          },
          { key: 'total', label: 'Test Cases', width: '90px', render: (r) => r.total_cases },
          { key: 'passed', label: 'Passed', width: '70px', render: (r) => <span className="text-green-600">{r.passed}</span> },
          { key: 'failed', label: 'Failed', width: '70px', render: (r) => <span className="text-red-600">{r.failed}</span> },
          { key: 'blocked', label: 'Blocked', width: '70px', render: (r) => <span className="text-orange-600">{r.blocked}</span> },
          { key: 'retest', label: 'Retest', width: '70px', render: (r) => r.retest },
          { key: 'untested', label: 'Untested', width: '80px', render: (r) => r.not_tested },
          { key: 'rate', label: 'Pass Rate', width: '90px', render: (r) => formatPercent(Number(r.pass_rate)) },
          { key: 'marked', label: 'Marked', width: '170px', render: (r) => <span className="text-[12px] text-gray-400">{r.decided_by_name} · {formatAuditTime(r.decided_at)}</span> },
          {
            key: 'view',
            label: '',
            width: '60px',
            render: (r) => (
              <button onClick={(e) => { e.stopPropagation(); open(r) }} className="text-[12px] font-semibold text-blue-500 hover:underline">
                View
              </button>
            ),
          },
        ]}
      />
    </div>
  )
}

const PAGE = 100

function ReleaseReportView({ report, onBack }) {
  const toast = useToast()
  const { user } = useAuth()
  const { can } = usePermissions()
  const [results, setResults] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetchAllRows(() =>
      supabase.from('release_report_results').select('*').eq('report_id', report.id).order('sort_order').order('id'))
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        setResults(data || [])
      })
  }, [report.id])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (results || []).filter((c) =>
      (filter === 'all' || c.result === filter)
      && (!q || `${formatCaseId(c.case_number)} ${c.topic} ${c.scenario} ${c.reason || ''}`.toLowerCase().includes(q)))
  }, [results, filter, query])

  const exportExcel = async () => {
    if (!results) return
    setExporting(true)
    try {
      const { data: me } = await supabase.from('profiles').select('name, email').eq('id', user?.id).single()
      const filename = downloadReleaseReport(report, results, {
        generatedOn: formatAuditTime(new Date().toISOString()),
        generatedBy: me?.name || me?.email || '',
      })
      const { error } = await supabase.rpc('log_release_report_export', { p_report_id: report.id, p_filename: filename })
      if (error) toast.error(`Exported, but it couldn't be recorded in the activity log: ${error.message}`)
      else toast.success(`Exported the release ${report.release_name} report`)
    } catch (err) {
      toast.error(err.message || 'Export failed')
    }
    setExporting(false)
  }

  const tiles = [
    ['Test Cases', report.total_cases, 'text-white'],
    ['Passed', report.passed, 'text-green-600'],
    ['Failed', report.failed, 'text-red-600'],
    ['Blocked', report.blocked, 'text-orange-600'],
    ['Retest', report.retest, 'text-purple-600'],
    ['Untested', report.not_tested, 'text-gray-400'],
    ...(report.na ? [['N/A', report.na, 'text-gray-400']] : []),
    ['Pass Rate', formatPercent(Number(report.pass_rate)), 'text-white'],
  ]

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-white">
        <ArrowLeft size={13} /> All Release Reports
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-semibold text-white">Release {report.release_name} · {report.plan_name}</h2>
            <StatusBadge domain={TEST_PLAN_STATUS} value={report.status} />
          </div>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Marked {TEST_PLAN_STATUS[report.status]?.label} by {report.decided_by_name} on {formatAuditTime(report.decided_at)} ·
            results saved at that moment
          </p>
        </div>
        {can('reports.export') && (
          <button
            onClick={exportExcel}
            disabled={exporting || !results}
            className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold disabled:opacity-40"
          >
            <Download size={13} /> {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        )}
      </div>

      {report.status === 'discard' && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-[12px]">
          <span className="font-semibold text-red-500">Discard Reason: </span>
          <span className="text-white">{report.discard_reason}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        {tiles.map(([label, value, tone]) => (
          <div key={label} className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2.5">
            <p className="text-[11px] text-gray-500">{label}</p>
            <p className={`text-[20px] font-semibold leading-tight ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
      <div>
        <StatusProgressBar domain={VMS_RESULT} counts={countsOf(report)} height="h-2.5" />
        <p className="text-[11px] text-gray-500 mt-1">Pass rate = passed ÷ executed (every result except Untested).</p>
      </div>

      <section className="rounded-lg border border-gray-600 bg-gray-800">
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-gray-600">
          <h3 className="text-[13px] font-semibold text-white mr-2">Test Execution Results</h3>
          {['all', ...Object.keys(VMS_RESULT)].map((key) => {
            const count = key === 'all' ? (results || []).length : (results || []).filter((c) => c.result === key).length
            if (key !== 'all' && !count) return null
            return (
              <button
                key={key}
                onClick={() => { setFilter(key); setLimit(PAGE) }}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  filter === key ? 'border-blue-500/50 bg-blue-500/10 text-blue-500' : 'border-gray-600 text-gray-400 hover:text-white'
                }`}
              >
                {key === 'all' ? 'All' : VMS_RESULT[key].label} {count}
              </button>
            )
          })}
          <div className="relative ml-auto">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLimit(PAGE) }}
              placeholder="Search test cases"
              className={`${inputClass} pl-6 py-1 text-[12px] w-56`}
            />
          </div>
        </div>
        <div className="p-4 overflow-x-auto">
          {results === null ? (
            <p className="text-[12px] text-gray-500">Loading results…</p>
          ) : (
            <>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[11px] text-gray-500 border-b border-gray-600">
                    <th className="py-1.5 pr-3 font-semibold">ID</th>
                    <th className="py-1.5 pr-3 font-semibold">Topic</th>
                    <th className="py-1.5 pr-3 font-semibold">Scenario</th>
                    <th className="py-1.5 pr-3 font-semibold">Result</th>
                    <th className="py-1.5 pr-3 font-semibold">Comment / Reason</th>
                    <th className="py-1.5 font-semibold">By</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, limit).map((c) => (
                    <tr key={c.id} className="border-b border-gray-700/60 align-top">
                      <td className="py-1.5 pr-3 font-mono text-[11px] text-blue-500 whitespace-nowrap">{formatCaseId(c.case_number)}</td>
                      <td className="py-1.5 pr-3 text-gray-400">{c.topic}</td>
                      <td className="py-1.5 pr-3 text-white">{c.scenario}</td>
                      <td className="py-1.5 pr-3"><StatusBadge domain={VMS_RESULT} value={c.result} size="sm" /></td>
                      <td className="py-1.5 pr-3 text-gray-300">
                        {c.reason || (['fail', 'blocked'].includes(c.result) ? <span className="italic text-gray-500">No comment recorded</span> : '')}
                      </td>
                      <td className="py-1.5 text-gray-400 whitespace-nowrap">{c.recorded_by_name || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && <p className="text-[12px] text-gray-500 mt-2">No test cases match.</p>}
              {shown.length > limit && (
                <button onClick={() => setLimit((n) => n + PAGE * 5)} className="mt-2 text-[12px] text-blue-500 hover:underline">
                  Show more ({shown.length - limit} more)
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
