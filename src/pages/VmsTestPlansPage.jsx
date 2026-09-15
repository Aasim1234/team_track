import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, ArrowLeft, ClipboardList, Link2, Unlink, Trash2, Pencil, Download, Tag } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAllRows'
import { summarizeRunCases, formatPercent } from '../lib/testMetrics'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import NewTestPlanModal from '../components/NewTestPlanModal'
import { ReleaseBadge, ChangeReleaseModal, ManageReleasesModal, sortReleases } from '../components/ReleaseVersions'
import ExportTestPlanModal from '../components/ExportTestPlanModal'
import VmsPlanGrid from '../components/VmsPlanGrid'
import EnterpriseTable from '../components/ui/EnterpriseTable'
import StatusBadge from '../components/ui/StatusBadge'
import StatusProgressBar from '../components/ui/StatusProgressBar'
import EmptyState from '../components/ui/EmptyState'
import BentoCard from '../components/ui/BentoCard'
import Modal from '../components/ui/Modal'
import FormField, { inputClass } from '../components/ui/FormField'
import PrimaryButton from '../components/ui/Button'
import Dropdown, { DropdownItem } from '../components/ui/Dropdown'
import { useToast } from '../components/ui/Toast'
import { RUN_STATUS, TEST_RUN_RESULT, TEST_PLAN_STATUS, TEST_PLAN_ITEM_STATUS } from '../lib/statusConfig'

function countsFor(rows) {
  const counts = { untested: 0, passed: 0, failed: 0, blocked: 0, retest: 0, skipped: 0 }
  rows.forEach((r) => { counts[r.current_status] = (counts[r.current_status] || 0) + 1 })
  return counts
}

function mergeCounts(list) {
  const total = { untested: 0, passed: 0, failed: 0, blocked: 0, retest: 0, skipped: 0 }
  list.forEach((c) => { Object.keys(total).forEach((k) => { total[k] += c[k] || 0 }) })
  return total
}

export default function VmsTestPlansPage() {
  const { id: projectId, planId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [project, setProject] = useState(null)
  const [plans, setPlans] = useState([])
  const [runs, setRuns] = useState([])
  const [statusRows, setStatusRows] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [releases, setReleases] = useState([])
  const [releaseFilter, setReleaseFilter] = useState('all')   // 'all' | release id | 'none'
  const [showReleases, setShowReleases] = useState(false)

  const { can } = usePermissions()

  const fetchAll = async () => {
    const [{ data: proj }, { data: planRows }, { data: runRows }, { data: statusData }, { data: memberRows }, { data: releaseRows }] =
      await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase
          .from('test_plans')
          .select('*, owner:profiles!owner_id(id, name), creator:profiles!created_by(name), release:release_versions(id, name, status)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase.from('test_runs').select('id, name, status, test_plan_id').eq('project_id', projectId),
        fetchAllRows(() =>
          supabase.from('test_run_case_current_status').select('run_id, current_status, run_case_id').eq('project_id', projectId).order('run_case_id')),
        supabase.from('project_members').select('user_id, profiles(id, name)').eq('project_id', projectId),
        supabase.from('release_versions').select('id, name, created_at, status').eq('project_id', projectId),
      ])
    setProject(proj)
    setPlans(planRows || [])
    setRuns(runRows || [])
    setStatusRows(statusData || [])
    setMembers((memberRows || []).map((m) => m.profiles).filter(Boolean))
    setReleases(releaseRows || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [projectId, user])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <ProjectSidebar />
        <div className="flex-1 min-w-0 p-6 animate-pulse">
          <div className="h-8 w-64 bg-gray-800 rounded-lg" />
        </div>
      </div>
    )
  }

  if (planId) {
    return (
      <TestPlanDetail
        projectId={projectId}
        planId={planId}
        project={project}
        runs={runs}
        statusRows={statusRows}
        members={members}
        releases={releases}
        userId={user?.id}
        onRefreshList={fetchAll}
      />
    )
  }

  const perRunCounts = {}
  statusRows.forEach((row) => {
    perRunCounts[row.run_id] = perRunCounts[row.run_id] || { untested: 0, passed: 0, failed: 0, blocked: 0, retest: 0, skipped: 0 }
    perRunCounts[row.run_id][row.current_status] = (perRunCounts[row.run_id][row.current_status] || 0) + 1
  })

  const perPlanCounts = {}
  runs.forEach((r) => {
    if (!r.test_plan_id) return
    perPlanCounts[r.test_plan_id] = mergeCounts([perPlanCounts[r.test_plan_id] || countsFor([]), perRunCounts[r.id] || countsFor([])])
  })

  const runCountForPlan = (planId) => runs.filter((r) => r.test_plan_id === planId).length

  // Test plans grouped under their release version, newest release first; plans
  // not yet linked to a release come last.
  const unversioned = plans.filter((p) => !p.release_version_id)
  const planGroups = [
    ...sortReleases(releases).map((r) => ({ key: r.id, name: r.name, plans: plans.filter((p) => p.release_version_id === r.id) })),
    { key: 'none', name: null, plans: unversioned },
  ].filter((g) => g.plans.length > 0 && (releaseFilter === 'all' || releaseFilter === g.key))

  const planColumns = [
    {
      key: 'name',
      label: 'Plan',
      render: (p) => (
        <div>
          <span className="text-white font-medium">{p.name}</span>
          {p.description && <p className="text-[11px] text-gray-500 truncate max-w-xs">{p.description}</p>}
        </div>
      ),
    },
    { key: 'status', label: 'Status', width: '120px', render: (p) => <StatusBadge domain={TEST_PLAN_STATUS} value={p.status} /> },
    { key: 'runs', label: 'Runs', width: '80px', render: (p) => runCountForPlan(p.id) },
    {
      key: 'progress',
      label: 'Progress',
      width: '220px',
      render: (p) => <StatusProgressBar domain={TEST_RUN_RESULT} counts={perPlanCounts[p.id] || countsFor([])} />,
    },
    { key: 'owner', label: 'Owner', width: '160px', render: (p) => p.owner?.name || '—' },
    { key: 'target_date', label: 'Target Date', width: '130px', render: (p) => p.target_date ? new Date(p.target_date).toLocaleDateString() : '—' },
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: project?.name, to: `/project/${projectId}/overview` }, { label: 'VMS Test Plans' }]} />
        <PageHeader
          title="VMS Test Plans"
          subtitle="Review, maintain and export your VMS test plan"
          actions={
            <div className="flex items-center gap-2">
              {can('reports.export') && (
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
                >
                  <Download size={14} /> Export Excel
                </button>
              )}
              {can('releases.manage') && (
                <button
                  onClick={() => setShowReleases(true)}
                  className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
                >
                  <Tag size={13} /> Release Versions
                </button>
              )}
              {can('test_plans.create') && (
                <button
                  onClick={() => setShowNewPlan(true)}
                  className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
                >
                  <Plus size={14} /> New Test Plan
                </button>
              )}
            </div>
          }
        />

        <div className="p-6 space-y-5">
          {plans.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[12px] text-gray-400">
                Release Version
                <select
                  value={releaseFilter}
                  onChange={(e) => setReleaseFilter(e.target.value)}
                  aria-label="Filter test plans by release version"
                  className="bg-gray-800 border border-gray-600 rounded-md px-2 py-1.5 text-[12px] text-gray-300 outline-none focus:border-gray-500"
                >
                  <option value="all">All release versions ({plans.length})</option>
                  {sortReleases(releases).map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({plans.filter((p) => p.release_version_id === r.id).length})</option>
                  ))}
                  {unversioned.length > 0 && <option value="none">No release version ({unversioned.length})</option>}
                </select>
              </label>
              {releaseFilter !== 'all' && (
                <button onClick={() => setReleaseFilter('all')} className="text-[12px] text-gray-400 hover:text-white">
                  Show all
                </button>
              )}
            </div>
          )}

          {plans.length === 0 ? (
            <EnterpriseTable
              rows={[]}
              rowKey={(p) => p.id}
              columns={planColumns}
              emptyState={
                <EmptyState
                  icon={ClipboardList}
                  title="No test plans yet"
                  description="Create a plan to bundle test runs for a release and track your VMS test scenarios in one place."
                  action={
                    can('test_plans.create') && (
                      <button
                        onClick={() => setShowNewPlan(true)}
                        className="bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-md text-[13px] font-semibold"
                      >
                        New Test Plan
                      </button>
                    )
                  }
                />
              }
            />
          ) : planGroups.length === 0 ? (
            <p className="text-[12px] text-gray-500 border border-gray-600 rounded-lg px-4 py-6 text-center">
              No test plans for this release version.
            </p>
          ) : (
            planGroups.map((group) => (
              <section key={group.key}>
                <div className="flex items-center gap-2 mb-2">
                  <ReleaseBadge name={group.name} status={releases.find((r) => r.id === group.key)?.status} />
                  <span className="text-[11px] text-gray-500">
                    {group.plans.length} test plan{group.plans.length === 1 ? '' : 's'}
                  </span>
                  {group.name && (
                    <button
                      onClick={() => navigate(`/project/${projectId}/releases/${group.key}`)}
                      className="ml-auto text-[12px] text-blue-500 hover:underline"
                    >
                      Release report →
                    </button>
                  )}
                </div>
                <EnterpriseTable
                  rows={group.plans}
                  rowKey={(p) => p.id}
                  onRowClick={(p) => navigate(`/project/${projectId}/plans/${p.id}`)}
                  columns={planColumns}
                />
              </section>
            ))
          )}
        </div>
      </div>

      <NewTestPlanModal
        open={showNewPlan}
        onClose={() => setShowNewPlan(false)}
        projectId={projectId}
        members={members}
        releases={releases}
        userId={user?.id}
        onSaved={(newPlanId) => {
          fetchAll()
          navigate(`/project/${projectId}/plans/${newPlanId}`)
        }}
      />

      <ManageReleasesModal
        open={showReleases}
        onClose={() => setShowReleases(false)}
        projectId={projectId}
        releases={releases}
        plans={plans}
        onChanged={fetchAll}
      />

      <ExportTestPlanModal
        open={showExport}
        onClose={() => setShowExport(false)}
        planId={plans[0]?.id}
        planName={plans[0]?.name}
        plans={plans}
        generatedBy={members.find((m) => m.id === user?.id)?.name || user?.email || ''}
      />
    </div>
  )
}

function TestPlanDetail({ projectId, planId, project, runs, statusRows, members, releases, userId, onRefreshList }) {
  const navigate = useNavigate()
  const { can } = usePermissions()
  // ?case=<test case id> opens the plan at that test case.
  const [searchParams] = useSearchParams()
  const [showExport, setShowExport] = useState(false)
  const [plan, setPlan] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showRelease, setShowRelease] = useState(false)

  const fetchPlan = async () => {
    const [{ data: planRow }, { data: itemRows }] = await Promise.all([
      supabase.from('test_plans').select('*, owner:profiles!owner_id(id, name), creator:profiles!created_by(name), release:release_versions(id, name, status)').eq('id', planId).single(),
      supabase.from('test_plan_items').select('*').eq('plan_id', planId).order('sort_order').order('created_at'),
    ])
    setPlan(planRow)
    setItems(itemRows || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchPlan()
  }, [planId])

  const linkedRuns = runs.filter((r) => r.test_plan_id === planId)
  const unlinkedRuns = runs.filter((r) => !r.test_plan_id)

  const perRunCounts = {}
  statusRows.forEach((row) => {
    perRunCounts[row.run_id] = perRunCounts[row.run_id] || countsFor([])
    perRunCounts[row.run_id][row.current_status] = (perRunCounts[row.run_id][row.current_status] || 0) + 1
  })
  // Scoped to this plan's linked runs, so it uses the run-slot view of the shared metrics.
  const linkedRunIds = new Set(linkedRuns.map((r) => r.id))
  const {
    counts: overallCounts, total: overallTotal, executed: overallExecuted, passRate,
  } = summarizeRunCases(statusRows.filter((r) => linkedRunIds.has(r.run_id)))

  const attachRun = async (runId) => {
    await supabase.from('test_runs').update({ test_plan_id: planId }).eq('id', runId)
    onRefreshList()
  }

  const detachRun = async (runId) => {
    await supabase.from('test_runs').update({ test_plan_id: null }).eq('id', runId)
    onRefreshList()
  }

  const setPlanStatus = async (status) => {
    await supabase.from('test_plans').update({ status }).eq('id', planId)
    fetchPlan()
    onRefreshList()
  }

  const updateItemStatus = async (itemId, status) => {
    await supabase.from('test_plan_items').update({ status }).eq('id', itemId)
    fetchPlan()
  }

  const deleteItem = async (itemId) => {
    await supabase.from('test_plan_items').delete().eq('id', itemId)
    fetchPlan()
  }

  if (loading || !plan) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <ProjectSidebar />
        <div className="flex-1 p-6 animate-pulse">
          <div className="h-8 w-96 bg-gray-800 rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader
          breadcrumb={[
            { label: 'Projects', to: '/dashboard' },
            { label: project?.name, to: `/project/${projectId}/overview` },
            { label: 'VMS Test Plans', to: `/project/${projectId}/plans` },
            { label: plan.name },
          ]}
        />
        <PageHeader
          title={plan.name}
          badge={
            <div className="flex items-center gap-2">
              <StatusBadge domain={TEST_PLAN_STATUS} value={plan.status} />
              <ReleaseBadge name={plan.release?.name} status={plan.release?.status} onEdit={can('releases.manage') ? () => setShowRelease(true) : undefined} />
            </div>
          }
          subtitle={plan.description || `Created by ${plan.creator?.name || 'someone'}`}
          actions={
            <div className="flex items-center gap-2">
              {(can('test_plans.edit') || can('test_plans.close')) && (
                <select
                  value={plan.status}
                  onChange={(e) => setPlanStatus(e.target.value)}
                  disabled={plan.status === 'completed' && !can('test_plans.close')}
                  className="text-[12px] bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 outline-none disabled:opacity-60"
                >
                  {/* Completing or reopening needs Complete/Close Test Plan; other changes need Edit Test Plan. */}
                  {Object.entries(TEST_PLAN_STATUS).map(([k, v]) => (
                    <option
                      key={k}
                      value={k}
                      disabled={k !== plan.status && ((k === 'completed' || plan.status === 'completed') ? !can('test_plans.close') : !can('test_plans.edit'))}
                    >
                      {v.label}
                    </option>
                  ))}
                </select>
              )}
              {can('test_plans.edit') && (
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 border border-gray-600 hover:bg-gray-650 text-gray-300 px-3 py-1.5 rounded-md text-[12px] font-semibold"
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
              {can('reports.export') && (
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
                >
                  <Download size={14} /> Export Excel
                </button>
              )}
            </div>
          }
        />

        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() => navigate(`/project/${projectId}/plans`)}
              className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-white"
            >
              <ArrowLeft size={14} /> All Test Plans
            </button>
            {plan.release && (
              <button
                onClick={() => navigate(`/project/${projectId}/releases/${plan.release.id}`)}
                className="text-[12px] text-blue-500 hover:underline"
              >
                Release {plan.release.name} report →
              </button>
            )}
          </div>

          {plan.release?.status === 'completed' && (
            <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-[12px] text-gray-300">
              Release {plan.release.name} is completed and its report is saved. Changes made here don't change that report.
              To test the next version, change this plan's release version to an open release.
            </p>
          )}

          <BentoCard className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[13px] font-semibold text-white">Overall Progress</p>
              <span className="text-[11px] text-gray-500">{overallExecuted}/{overallTotal} test cases executed across this plan's runs · {formatPercent(passRate)} pass rate</span>
            </div>
            <StatusProgressBar domain={TEST_RUN_RESULT} counts={overallCounts} showLegend height="h-2.5" />
          </BentoCard>

          <BentoCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-white">Linked Test Runs</p>
              {can('test_runs.edit') && (
                <Dropdown
                  align="right"
                  trigger={
                    <span className="flex items-center gap-1.5 text-[12px] text-blue-500 hover:text-blue-400 font-medium cursor-pointer">
                      <Link2 size={13} /> Attach run
                    </span>
                  }
                >
                  {({ close }) => (
                    unlinkedRuns.length === 0 ? (
                      <p className="px-3 py-2 text-[12px] text-gray-500">No unlinked runs in this project.</p>
                    ) : (
                      unlinkedRuns.map((r) => (
                        <DropdownItem key={r.id} onClick={() => { attachRun(r.id); close() }}>
                          {r.name}
                        </DropdownItem>
                      ))
                    )
                  )}
                </Dropdown>
              )}
            </div>
            <div className="space-y-2">
              {linkedRuns.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 border border-gray-600 rounded-md">
                  <span className="text-[13px] text-white font-medium flex-shrink-0 truncate max-w-[200px]">{r.name}</span>
                  <StatusBadge domain={RUN_STATUS} value={r.status} size="sm" />
                  <div className="flex-1 min-w-[140px]">
                    <StatusProgressBar domain={TEST_RUN_RESULT} counts={perRunCounts[r.id] || countsFor([])} />
                  </div>
                  {can('test_runs.edit') && (
                    <button onClick={() => detachRun(r.id)} title="Detach from plan" className="text-gray-500 hover:text-red-500 flex-shrink-0">
                      <Unlink size={14} />
                    </button>
                  )}
                </div>
              ))}
              {linkedRuns.length === 0 && <p className="text-[12px] text-gray-500">No test runs linked yet — attach an existing run above.</p>}
            </div>
          </BentoCard>

          <BentoCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-white">Test Plan</p>
              <span className="text-[11px] text-gray-500">Topic · Scenario · Test Steps · Expected Result · RESULT</span>
            </div>
            <VmsPlanGrid
              planId={planId}
              projectId={projectId}
              userId={userId}
              members={members}
              focusRowId={searchParams.get('case')}
            />
          </BentoCard>
        </div>
      </div>

      <NewTestPlanModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        projectId={projectId}
        members={members}
        userId={userId}
        plan={plan}
        onSaved={() => { setShowEdit(false); fetchPlan(); onRefreshList() }}
      />

      <ChangeReleaseModal
        open={showRelease}
        onClose={() => setShowRelease(false)}
        plan={plan}
        projectId={projectId}
        releases={releases}
        onSaved={() => { setShowRelease(false); fetchPlan(); onRefreshList() }}
      />

      <ExportTestPlanModal
        open={showExport}
        onClose={() => setShowExport(false)}
        planId={planId}
        planName={plan.name}
        releaseVersion={plan.release?.name}
        generatedBy={members.find((m) => m.id === userId)?.name || ''}
      />

      <AddScenarioModal
        open={showAddItem}
        onClose={() => setShowAddItem(false)}
        planId={planId}
        projectId={projectId}
        userId={userId}
        onCreated={() => { setShowAddItem(false); fetchPlan() }}
      />
    </div>
  )
}

function AddScenarioModal({ open, onClose, planId, projectId, userId, onCreated }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle('')
      setCategory('')
      setNotes('')
    }
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('test_plan_items').insert({
      plan_id: planId,
      project_id: projectId,
      title,
      category: category || null,
      notes: notes || null,
      created_by: userId,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    onCreated()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Test Scenario">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <FormField label="Scenario" required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus placeholder="e.g. Live view under 40% packet loss" className={inputClass} />
        </FormField>
        <FormField label="Category" hint="e.g. Live View, PTZ Control, Alerts — whatever grouping fits">
          <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-y`} />
        </FormField>
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add Scenario'}
        </PrimaryButton>
      </form>
    </Modal>
  )
}
