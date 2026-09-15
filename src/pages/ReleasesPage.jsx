import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Tag, Download, Play, CheckCircle2, RotateCcw, Gavel, Lock, Radio,
  ChevronRight, ChevronDown, Pencil, Search, XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import EnterpriseTable from '../components/ui/EnterpriseTable'
import EmptyState from '../components/ui/EmptyState'
import StatusBadge from '../components/ui/StatusBadge'
import StatusProgressBar from '../components/ui/StatusProgressBar'
import Modal from '../components/ui/Modal'
import { inputClass } from '../components/ui/FormField'
import { useToast } from '../components/ui/Toast'
import ReleaseDecisionModal from '../components/ReleaseDecisionModal'
import { ManageReleasesModal, sortReleases } from '../components/ReleaseVersions'
import { RELEASE_STATUS, RELEASE_DECISION, VMS_RESULT } from '../lib/statusConfig'
import { formatPercent } from '../lib/testMetrics'
import { formatCaseId } from '../lib/testCaseId'
import { AUDIT_ACTIONS, formatAuditTime } from '../lib/auditLog'
import { downloadReleaseReport, formatReleaseDate, planPassRate, planProgress } from '../lib/releaseReportExport'

// Release History (every release with its headline numbers) and the Release
// Report for one release. Both read from the database: release_history() and
// release_report() return the saved report for a completed release and the live
// one otherwise, so the page and its Excel export always show the same release.

const ghostButton =
  'flex items-center gap-1.5 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-[12px] font-semibold disabled:opacity-40'
const primaryButton =
  'flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold disabled:opacity-40'

const resultCounts = (c) => ({
  pass: c.pass, fail: c.fail, blocked: c.blocked, retest: c.retest, na: c.na, not_tested: c.not_tested,
})

// The date a release is known by: its release date, else when it was decided,
// completed or created.
function releaseDay(r) {
  if (r.release_date) return { day: formatReleaseDate(r.release_date), hint: 'Release date' }
  if (r.decided_at) return { day: formatReleaseDate(r.decided_at), hint: 'Decided' }
  if (r.completed_at) return { day: formatReleaseDate(r.completed_at), hint: 'Completed' }
  return { day: formatReleaseDate(r.created_at), hint: 'Created' }
}

export default function ReleasesPage() {
  const { id: projectId, releaseId } = useParams()
  const [project, setProject] = useState(null)

  useEffect(() => {
    supabase.from('projects').select('id, name').eq('id', projectId).single().then(({ data }) => setProject(data))
  }, [projectId])

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader
          breadcrumb={[
            { label: 'Projects', to: '/dashboard' },
            { label: project?.name, to: `/project/${projectId}/overview` },
            releaseId ? { label: 'Releases', to: `/project/${projectId}/releases` } : { label: 'Releases' },
            ...(releaseId ? [{ label: 'Release Report' }] : []),
          ]}
        />
        {releaseId
          ? <ReleaseReport key={releaseId} projectId={projectId} releaseId={releaseId} />
          : <ReleaseHistory projectId={projectId} />}
      </div>
    </div>
  )
}

// -------------------------------------------------------------- history ---

function ReleaseHistory({ projectId }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { can } = usePermissions()
  const [releases, setReleases] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showManage, setShowManage] = useState(false)

  const load = async () => {
    const { data, error } = await supabase.rpc('release_history', { p_project_id: projectId })
    if (error) toast.error(error.message)
    setReleases(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [projectId])

  const rows = sortReleases(releases).filter((r) =>
    filter === 'all' ? true : ['pass', 'discard'].includes(filter) ? r.decision === filter : r.status === filter)
  const open = (r) => navigate(`/project/${projectId}/releases/${r.id}`)

  return (
    <>
      <PageHeader
        title="Releases"
        subtitle="Every release version with its test results, decision and saved report"
        actions={can('releases.manage') && (
          <button onClick={() => setShowManage(true)} className={ghostButton}>
            <Tag size={13} /> Release Versions
          </button>
        )}
      />

      <div className="p-6 space-y-3">
        {releases.length > 0 && (
          <label className="flex items-center gap-2 text-[12px] text-gray-400">
            Show
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter releases"
              className="bg-gray-800 border border-gray-600 rounded-md px-2 py-1.5 text-[12px] text-gray-300 outline-none focus:border-gray-500"
            >
              <option value="all">All releases ({releases.length})</option>
              <option value="active">Active</option>
              <option value="testing">Testing</option>
              <option value="completed">Completed</option>
              <option value="pass">Decision: Pass</option>
              <option value="discard">Decision: Discard</option>
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
              icon={Tag}
              title={releases.length ? 'No releases match this filter' : 'No release versions yet'}
              description="Create a release version, add test plans to it, and its report builds up here as testing runs."
            />
          }
          columns={[
            { key: 'name', label: 'Release', render: (r) => <span className="text-white font-semibold">{r.name}</span> },
            { key: 'status', label: 'Status', width: '110px', render: (r) => <StatusBadge domain={RELEASE_STATUS} value={r.status} /> },
            { key: 'plans', label: 'Test Plans', width: '90px', render: (r) => r.counts.total_plans },
            { key: 'cases', label: 'Test Cases', width: '90px', render: (r) => r.counts.total_cases },
            { key: 'rate', label: 'Pass Rate', width: '90px', render: (r) => formatPercent(Number(r.counts.pass_rate)) },
            {
              key: 'progress',
              label: 'Progress',
              width: '160px',
              render: (r) => (
                <div title={`${formatPercent(Number(r.counts.progress))} executed`}>
                  <StatusProgressBar domain={VMS_RESULT} counts={resultCounts({
                    pass: r.counts.passed, fail: r.counts.failed, blocked: r.counts.blocked,
                    retest: r.counts.retest, na: r.counts.na, not_tested: r.counts.not_tested,
                  })} />
                </div>
              ),
            },
            {
              key: 'decision',
              label: 'Decision',
              render: (r) => r.decision ? (
                <div className="min-w-0">
                  <StatusBadge domain={RELEASE_DECISION} value={r.decision} />
                  {r.decision === 'discard' && r.discard_reason && (
                    <p className="text-[11px] text-red-500 truncate max-w-[220px] mt-0.5" title={r.discard_reason}>{r.discard_reason}</p>
                  )}
                </div>
              ) : <span className="text-gray-500">—</span>,
            },
            {
              key: 'date',
              label: 'Date',
              width: '120px',
              render: (r) => {
                const { day, hint } = releaseDay(r)
                return <span title={hint}>{day}</span>
              },
            },
            {
              key: 'action',
              label: 'Action',
              width: '80px',
              render: (r) => (
                <button
                  onClick={(e) => { e.stopPropagation(); open(r) }}
                  className="text-[12px] font-semibold text-blue-500 hover:underline"
                >
                  View
                </button>
              ),
            },
          ]}
        />
        {releases.length > 0 && (
          <p className="text-[11px] text-gray-500">
            Completed releases show their saved report. Active and Testing releases update as testing continues.
          </p>
        )}
      </div>

      <ManageReleasesModal
        open={showManage}
        onClose={() => setShowManage(false)}
        projectId={projectId}
        releases={releases}
        planCounts={Object.fromEntries(releases.map((r) => [r.id, r.current_plans]))}
        onChanged={load}
      />
    </>
  )
}

// --------------------------------------------------------------- report ---

function Stat({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2.5">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-[20px] font-semibold leading-tight ${tone}`}>{value}</p>
    </div>
  )
}

function Card({ title, right, children }) {
  return (
    <section className="rounded-lg border border-gray-600 bg-gray-800">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-600">
        <h2 className="text-[13px] font-semibold text-white">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

const Detail = ({ label, children }) => (
  <div className="grid grid-cols-[130px_1fr] gap-2 py-1 text-[12px]">
    <dt className="text-gray-500">{label}</dt>
    <dd className="text-gray-300 min-w-0 break-words">{children || '—'}</dd>
  </div>
)

const by = (name, at) => (name || at ? [name, at && formatAuditTime(at)].filter(Boolean).join(' · ') : null)

function ReleaseReport({ projectId, releaseId }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { can } = usePermissions()
  const [report, setReport] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmStatus, setConfirmStatus] = useState(null)   // 'testing' | 'completed' | 'reopen'
  const [showDecision, setShowDecision] = useState(false)
  const [showDate, setShowDate] = useState(false)
  const [myName, setMyName] = useState('')

  const load = async () => {
    const { data, error } = await supabase.rpc('release_report', { p_release_id: releaseId })
    if (error) { setLoadError(error.message); return null }
    setReport(data)
    setLoadError(null)
    return data
  }

  useEffect(() => { load() }, [releaseId])
  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('name, email').eq('id', user.id).single()
      .then(({ data }) => setMyName(data?.name || data?.email || ''))
  }, [user?.id])

  if (loadError) {
    return (
      <div className="p-6">
        <EmptyState icon={Tag} title="Release report unavailable" description={loadError} />
      </div>
    )
  }
  if (!report) {
    return <div className="p-6 text-[13px] text-gray-500">Loading release report…</div>
  }

  const { release, summary } = report
  const isSaved = report.source === 'saved'

  const changeStatus = async (kind) => {
    const target = kind === 'reopen' ? 'testing' : kind
    setBusy(true)
    const { error } = await supabase.rpc('set_release_status', { p_release_id: release.id, p_status: target })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    setConfirmStatus(null)
    toast.success(
      kind === 'completed' ? `Release ${release.name} completed — its report is saved`
        : kind === 'reopen' ? `Release ${release.name} reopened for testing`
          : `Release ${release.name} is now in testing`)
    load()
  }

  // Re-read the report first so a live export reflects the latest results; a
  // saved report comes back identical.
  const exportReport = async () => {
    setBusy(true)
    try {
      const latest = await load()
      if (!latest) throw new Error("The release report couldn't be loaded for export.")
      const { filename, caseCount } = downloadReleaseReport(latest, {
        generatedOn: formatAuditTime(new Date().toISOString()),
        generatedBy: myName,
      })
      const { error } = await supabase.rpc('log_release_export', {
        p_release_id: latest.release.id, p_filename: filename, p_case_count: caseCount,
      })
      if (error) toast.error(`Exported, but it couldn't be recorded in the activity log: ${error.message}`)
      else toast.success(`Exported the release ${latest.release.name} report`)
    } catch (err) {
      toast.error(err.message || 'Export failed')
    }
    setBusy(false)
  }

  const failedOrBlocked = report.plans.flatMap((p) =>
    p.cases.filter((c) => c.result === 'fail' || c.result === 'blocked').map((c) => ({ ...c, plan: p.name })))
  const runs = report.plans.flatMap((p) => p.runs.map((run) => ({ ...run, plan: p.name })))

  return (
    <>
      <PageHeader
        title={`Release ${release.name}`}
        badge={
          <div className="flex items-center gap-2">
            <StatusBadge domain={RELEASE_STATUS} value={release.status} />
            {release.decision && <StatusBadge domain={RELEASE_DECISION} value={release.decision} />}
          </div>
        }
        subtitle={`Release Report${release.project_name ? ` · ${release.project_name}` : ''}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {can('releases.manage') && release.status === 'active' && (
              <button onClick={() => setConfirmStatus('testing')} disabled={busy} className={ghostButton}>
                <Play size={13} /> Start Testing
              </button>
            )}
            {can('releases.manage') && release.status === 'testing' && (
              <button onClick={() => setConfirmStatus('completed')} disabled={busy} className={primaryButton}>
                <CheckCircle2 size={13} /> Complete Release
              </button>
            )}
            {can('releases.manage') && release.status === 'completed' && !release.decision && (
              <button onClick={() => setConfirmStatus('reopen')} disabled={busy} className={ghostButton}>
                <RotateCcw size={13} /> Reopen
              </button>
            )}
            {can('releases.decide') && release.status === 'completed' && (
              <button onClick={() => setShowDecision(true)} disabled={busy} className={release.decision ? ghostButton : primaryButton}>
                <Gavel size={13} /> {release.decision ? 'Change Decision' : 'Record Decision'}
              </button>
            )}
            {can('reports.export') && (
              <button onClick={exportReport} disabled={busy} className={ghostButton}>
                <Download size={13} /> Export Excel
              </button>
            )}
          </div>
        }
      />

      <div className="p-6 space-y-5">
        <button onClick={() => navigate(`/project/${projectId}/releases`)} className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-white">
          <ArrowLeft size={13} /> Release History
        </button>

        {isSaved ? (
          <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-[12px] text-gray-300">
            <Lock size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
            <span>
              <span className="font-semibold text-white">Saved release report</span> — captured {formatAuditTime(report.saved.captured_at)} by {report.saved.captured_by_name}.
              Changes made to test plans, test cases or results after that don't change this report.
              {report.saved_reports.length > 1 && ` This release was completed ${report.saved_reports.length} times; the latest saved report is shown.`}
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-[12px] text-gray-300">
            <Radio size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <span>
              <span className="font-semibold text-white">Live report</span> — release {release.name} is {RELEASE_STATUS[release.status]?.label}.
              These numbers update as testing continues and are saved permanently when the release is completed.
            </span>
          </div>
        )}

        {release.decision === 'discard' && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-[12px]">
            <XCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <span className="text-gray-300">
              <span className="font-semibold text-red-500">Discarded</span>
              {release.decided_by_name && ` by ${release.decided_by_name}`}{release.decided_at && ` on ${formatAuditTime(release.decided_at)}`}
              <span className="block text-white mt-0.5">Reason: {release.discard_reason}</span>
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          <Stat label="Test Plans" value={summary.total_plans} />
          <Stat label="Test Cases" value={summary.total_cases} />
          <Stat label="Passed" value={summary.pass} tone="text-green-600" />
          <Stat label="Failed" value={summary.fail} tone="text-red-600" />
          <Stat label="Blocked" value={summary.blocked} tone="text-orange-600" />
          <Stat label="Retest" value={summary.retest} tone="text-purple-600" />
          <Stat label="Untested" value={summary.not_tested} tone="text-gray-400" />
          <Stat label="N/A" value={summary.na} tone="text-gray-400" />
        </div>

        <div className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-[11px] text-gray-500">Pass Rate</p>
            <p className="text-[28px] font-bold text-white leading-tight">{formatPercent(Number(summary.pass_rate))}</p>
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1.5">
              <span>Overall Test Execution Progress</span>
              <span>{summary.executed} of {summary.total_cases} executed · {formatPercent(Number(summary.progress))}</span>
            </div>
            <StatusProgressBar domain={VMS_RESULT} counts={resultCounts(summary)} height="h-3" />
            <p className="text-[11px] text-gray-500 mt-1.5">Pass rate = passed ÷ executed (every result except Untested).</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Release Details">
            <dl>
              <Detail label="Release Version">{release.name}</Detail>
              <Detail label="Release Status"><StatusBadge domain={RELEASE_STATUS} value={release.status} size="sm" /></Detail>
              <Detail label="Release Decision">
                {release.decision ? <StatusBadge domain={RELEASE_DECISION} value={release.decision} size="sm" /> : 'Not decided yet'}
              </Detail>
              {release.decision === 'discard' && <Detail label="Discard Reason"><span className="text-red-500">{release.discard_reason}</span></Detail>}
              <Detail label="Release Date">
                <span className="inline-flex items-center gap-1.5">
                  {formatReleaseDate(release.release_date) || 'Not set'}
                  {can('releases.manage') && (
                    <button onClick={() => setShowDate(true)} title="Set release date" aria-label="Set release date" className="text-gray-500 hover:text-white">
                      <Pencil size={11} />
                    </button>
                  )}
                </span>
              </Detail>
              <Detail label="Created By">{by(release.created_by_name, release.created_at)}</Detail>
              <Detail label="Last Updated By">{by(release.updated_by_name, release.updated_at)}</Detail>
              <Detail label="Testing Started">{release.testing_started_at && formatAuditTime(release.testing_started_at)}</Detail>
              <Detail label="Completed By">{by(release.completed_by_name, release.completed_at)}</Detail>
              <Detail label="Decided By">{by(release.decided_by_name, release.decided_at)}</Detail>
            </dl>
          </Card>

          <Card title="Decision History">
            {report.decisions.length ? (
              <ul className="space-y-2">
                {report.decisions.map((d, i) => (
                  <li key={i} className="rounded-md border border-gray-600 px-3 py-2 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge domain={RELEASE_DECISION} value={d.decision} size="sm" />
                      <span className="text-[11px] text-gray-500">{d.decided_by_name} · {formatAuditTime(d.decided_at)}</span>
                    </div>
                    {d.reason && <p className="text-gray-300 mt-1">Reason: {d.reason}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-gray-500">
                {release.status === 'completed'
                  ? 'No decision yet. Mark this release Pass or Discard.'
                  : 'A decision is recorded after the release is completed.'}
              </p>
            )}
          </Card>
        </div>

        <Card title={`Test Plans (${report.plans.length})`}>
          <PlansTable plans={report.plans} />
        </Card>

        <Card title={`Failed & Blocked Test Cases (${failedOrBlocked.length})`}>
          {failedOrBlocked.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[11px] text-gray-500 border-b border-gray-600">
                    <th className="py-1.5 pr-3 font-semibold">Test Case</th>
                    <th className="py-1.5 pr-3 font-semibold">Test Plan</th>
                    <th className="py-1.5 pr-3 font-semibold">Result</th>
                    <th className="py-1.5 pr-3 font-semibold">Fail / Block Reason</th>
                    <th className="py-1.5 font-semibold">By</th>
                  </tr>
                </thead>
                <tbody>
                  {failedOrBlocked.map((c, i) => (
                    <tr key={i} className="border-b border-gray-700 align-top">
                      <td className="py-1.5 pr-3">
                        <span className="font-mono text-[11px] text-blue-500 mr-1.5">{formatCaseId(c.case_number)}</span>
                        <span className="text-white">{c.scenario || c.topic}</span>
                        {c.scenario && c.topic && <span className="block text-[11px] text-gray-500">{c.topic}</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-400">{c.plan}</td>
                      <td className="py-1.5 pr-3"><StatusBadge domain={VMS_RESULT} value={c.result} size="sm" /></td>
                      <td className="py-1.5 pr-3 text-gray-300">{c.reason || <span className="text-gray-500 italic">No reason was recorded</span>}</td>
                      <td className="py-1.5 text-gray-400 whitespace-nowrap">{c.failed_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12px] text-gray-500">No test cases failed or were blocked in this release.</p>
          )}
        </Card>

        {runs.length > 0 && (
          <Card title={`Test Runs (${runs.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[11px] text-gray-500 border-b border-gray-600">
                    {['Test Run', 'Test Plan', 'Status', 'Total', 'Passed', 'Failed', 'Blocked', 'Untested'].map((h) => (
                      <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run, i) => (
                    <tr key={i} className="border-b border-gray-700">
                      <td className="py-1.5 pr-3 text-white">{run.name}</td>
                      <td className="py-1.5 pr-3 text-gray-400">{run.plan}</td>
                      <td className="py-1.5 pr-3 text-gray-300 capitalize">{run.status}</td>
                      <td className="py-1.5 pr-3">{run.total}</td>
                      <td className="py-1.5 pr-3">{run.passed}</td>
                      <td className="py-1.5 pr-3">{run.failed}</td>
                      <td className="py-1.5 pr-3">{run.blocked}</td>
                      <td className="py-1.5 pr-3">{run.untested}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title={`Execution & Activity History (${report.activity.length})`}>
          <ActivityTable entries={report.activity} />
        </Card>
      </div>

      <Modal
        open={Boolean(confirmStatus)}
        onClose={busy ? () => {} : () => setConfirmStatus(null)}
        title={confirmStatus === 'completed' ? 'Complete Release' : confirmStatus === 'reopen' ? 'Reopen Release' : 'Start Testing'}
        footer={
          <>
            <button onClick={() => setConfirmStatus(null)} disabled={busy} className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-300 border border-gray-600 hover:bg-gray-700/50 disabled:opacity-40">
              Cancel
            </button>
            <button onClick={() => changeStatus(confirmStatus)} disabled={busy} className={primaryButton}>
              {busy ? 'Saving…' : confirmStatus === 'completed' ? 'Complete & Save Report' : confirmStatus === 'reopen' ? 'Reopen Release' : 'Start Testing'}
            </button>
          </>
        }
      >
        {confirmStatus === 'completed' && (
          <div className="space-y-2.5 text-[13px] text-gray-300">
            <p>Complete release <span className="font-semibold text-white">{release.name}</span> and save its Release Report?</p>
            <div className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-[12px]">
              {summary.total_plans} test plans · {summary.total_cases} test cases · {summary.pass} passed · {summary.fail} failed · {summary.blocked} blocked · {summary.not_tested} untested · {formatPercent(Number(summary.pass_rate))} pass rate
            </div>
            <p className="text-[12px] text-gray-400">
              The report is saved permanently exactly as it is now. Later changes to test plans, test cases, results or assignments won't change it,
              and no test plan can be added to a completed release. After completing, the release can be marked Pass or Discard.
            </p>
          </div>
        )}
        {confirmStatus === 'reopen' && (
          <p className="text-[13px] text-gray-300">
            Reopen release <span className="font-semibold text-white">{release.name}</span> for testing? Its report becomes live again until it is completed again.
            The report saved earlier is kept in the release's history.
          </p>
        )}
        {confirmStatus === 'testing' && (
          <p className="text-[13px] text-gray-300">
            Move release <span className="font-semibold text-white">{release.name}</span> from Active to Testing? Its report stays live until the release is completed.
          </p>
        )}
      </Modal>

      <ReleaseDecisionModal
        open={showDecision}
        release={release}
        summary={summary}
        onClose={() => setShowDecision(false)}
        onSaved={() => { setShowDecision(false); load() }}
      />

      <ReleaseDateModal
        open={showDate}
        release={release}
        onClose={() => setShowDate(false)}
        onSaved={() => { setShowDate(false); load() }}
      />
    </>
  )
}

function PlansTable({ plans }) {
  const [openId, setOpenId] = useState(null)
  if (!plans.length) {
    return <p className="text-[12px] text-gray-500">No test plans have been part of this release yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[11px] text-gray-500 border-b border-gray-600">
            <th className="py-1.5 pr-3 font-semibold">Test Plan</th>
            <th className="py-1.5 pr-3 font-semibold">In Release</th>
            {['Cases', 'Passed', 'Failed', 'Blocked', 'Retest', 'Untested', 'Pass Rate'].map((h) => (
              <th key={h} className="py-1.5 pr-3 font-semibold text-right">{h}</th>
            ))}
            <th className="py-1.5 font-semibold w-[160px]">Progress</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => {
            const expanded = openId === p.source_plan_id
            return (
              <Fragment key={p.source_plan_id}>
                <tr
                  onClick={() => setOpenId(expanded ? null : p.source_plan_id)}
                  className="border-b border-gray-700 cursor-pointer hover:bg-gray-700/40 align-top"
                >
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-1.5 text-white font-medium">
                      {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {p.name}
                    </span>
                    {p.owner_name && <span className="block text-[11px] text-gray-500 ml-5">Owner: {p.owner_name}</span>}
                  </td>
                  <td className="py-2 pr-3 text-gray-400">
                    <span className="block">{p.joined_at ? `From ${formatAuditTime(p.joined_at)}` : '—'}</span>
                    {p.departed && (
                      <span className="block text-[11px] text-orange-600" title={p.saved_note || undefined}>
                        Left {formatAuditTime(p.left_at)}{p.left_reason ? ` · ${p.left_reason}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">{p.counts.total}</td>
                  <td className="py-2 pr-3 text-right text-green-600">{p.counts.pass}</td>
                  <td className="py-2 pr-3 text-right text-red-600">{p.counts.fail}</td>
                  <td className="py-2 pr-3 text-right text-orange-600">{p.counts.blocked}</td>
                  <td className="py-2 pr-3 text-right text-purple-600">{p.counts.retest}</td>
                  <td className="py-2 pr-3 text-right text-gray-400">{p.counts.not_tested}</td>
                  <td className="py-2 pr-3 text-right">{formatPercent(planPassRate(p.counts))}</td>
                  <td className="py-2" title={`${formatPercent(planProgress(p.counts))} executed`}>
                    <StatusProgressBar domain={VMS_RESULT} counts={resultCounts(p.counts)} />
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-gray-700">
                    <td colSpan={10} className="py-3 px-2 bg-gray-900/40">
                      {p.departed && p.saved_note && <p className="text-[11px] text-gray-500 mb-2">{p.saved_note}</p>}
                      <PlanCases plan={p} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const PAGE = 100

function PlanCases({ plan }) {
  const [result, setResult] = useState('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const cases = useMemo(() => {
    const q = query.trim().toLowerCase()
    return plan.cases.filter((c) =>
      (result === 'all' || c.result === result)
      && (!q || `${formatCaseId(c.case_number)} ${c.topic} ${c.scenario} ${c.reason || ''}`.toLowerCase().includes(q)))
  }, [plan, result, query])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {['all', ...Object.keys(VMS_RESULT)].map((key) => {
          const count = key === 'all' ? plan.cases.length : plan.cases.filter((c) => c.result === key).length
          if (key !== 'all' && !count) return null
          return (
            <button
              key={key}
              onClick={() => { setResult(key); setLimit(PAGE) }}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${
                result === key ? 'border-blue-500/50 bg-blue-500/10 text-blue-500' : 'border-gray-600 text-gray-400 hover:text-white'
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
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[11px] text-gray-500 border-b border-gray-600">
            <th className="py-1 pr-3 font-semibold">ID</th>
            <th className="py-1 pr-3 font-semibold">Topic</th>
            <th className="py-1 pr-3 font-semibold">Scenario</th>
            <th className="py-1 pr-3 font-semibold">Result</th>
            <th className="py-1 pr-3 font-semibold">Fail / Block Reason</th>
            <th className="py-1 font-semibold">Assigned To</th>
          </tr>
        </thead>
        <tbody>
          {cases.slice(0, limit).map((c, i) => (
            <tr key={`${c.case_number}-${i}`} className="border-b border-gray-700/60 align-top">
              <td className="py-1 pr-3 font-mono text-[11px] text-blue-500 whitespace-nowrap">{formatCaseId(c.case_number)}</td>
              <td className="py-1 pr-3 text-gray-400">{c.topic}</td>
              <td className="py-1 pr-3 text-white">{c.scenario}</td>
              <td className="py-1 pr-3"><StatusBadge domain={VMS_RESULT} value={c.result} size="sm" /></td>
              <td className="py-1 pr-3 text-gray-300">{c.reason || ''}</td>
              <td className="py-1 text-gray-400 whitespace-nowrap">{c.assigned_to_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!cases.length && <p className="text-[12px] text-gray-500">No test cases match.</p>}
      {cases.length > limit && (
        <button onClick={() => setLimit((n) => n + PAGE * 5)} className="text-[12px] text-blue-500 hover:underline">
          Show more ({cases.length - limit} more)
        </button>
      )}
    </div>
  )
}

function ActivityTable({ entries }) {
  const [limit, setLimit] = useState(25)
  if (!entries.length) return <p className="text-[12px] text-gray-500">No activity has been recorded for this release yet.</p>
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-gray-500 border-b border-gray-600">
              {['Date & Time', 'User', 'Action', 'Item', 'Change', 'Reason / Comment'].map((h) => (
                <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, limit).map((a, i) => (
              <tr key={`${a.id}-${i}`} className="border-b border-gray-700/60 align-top">
                <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">{formatAuditTime(a.occurred_at)}</td>
                <td className="py-1.5 pr-3 text-white whitespace-nowrap">{a.actor_name}</td>
                <td className="py-1.5 pr-3 text-gray-300">
                  {AUDIT_ACTIONS[a.action]?.label || a.action}
                  {a.field && <span className="block text-[11px] text-gray-500">{a.field}</span>}
                </td>
                <td className="py-1.5 pr-3 text-gray-300">
                  {a.entity_label}
                  {a.plan_name && a.plan_name !== a.entity_label && <span className="block text-[11px] text-gray-500">{a.plan_name}</span>}
                </td>
                <td className="py-1.5 pr-3 text-gray-300">
                  {a.old_value || a.new_value ? <>{a.old_value || '—'} <span className="text-gray-500">→</span> {a.new_value || '—'}</> : '—'}
                </td>
                <td className="py-1.5 pr-3 text-gray-400">{a.comment || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > limit && (
        <button onClick={() => setLimit(entries.length)} className="text-[12px] text-blue-500 hover:underline">
          Show all {entries.length} entries
        </button>
      )}
    </div>
  )
}

function ReleaseDateModal({ open, release, onClose, onSaved }) {
  const toast = useToast()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setValue(release?.release_date || ''); setSaving(false) }
  }, [open, release])

  const save = async (next) => {
    setSaving(true)
    const { data, error } = await supabase
      .from('release_versions')
      .update({ release_date: next || null })
      .eq('id', release.id)
      .select('id')
    setSaving(false)
    if (error || !data?.length) {
      toast.error(error?.message || "You don't have permission to change this release's date.")
      return
    }
    toast.success(next ? `Release date set to ${formatReleaseDate(next)}` : 'Release date cleared')
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Release Date"
      size="sm"
      footer={
        <>
          {release?.release_date && (
            <button onClick={() => save('')} disabled={saving} className="mr-auto text-[12px] text-gray-400 hover:text-white disabled:opacity-40">
              Clear date
            </button>
          )}
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-300 border border-gray-600 hover:bg-gray-700/50 disabled:opacity-40">
            Cancel
          </button>
          <button onClick={() => save(value)} disabled={saving || !value || value === release?.release_date} className={primaryButton}>
            {saving ? 'Saving…' : 'Save Date'}
          </button>
        </>
      }
    >
      {release && (
        <div className="space-y-2">
          <p className="text-[12px] text-gray-400">The date release {release.name} ships (or shipped).</p>
          <input type="date" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} aria-label="Release date" />
        </div>
      )}
    </Modal>
  )
}
