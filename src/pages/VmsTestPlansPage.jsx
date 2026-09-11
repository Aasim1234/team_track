import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, ClipboardList, Link2, Unlink, Trash2, Pencil, Download } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAllRows'
import { summarizeRunCases, formatPercent } from '../lib/testMetrics'
import { useAuth } from '../hooks/useAuth'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import PageHeader from '../components/PageHeader'
import NewTestPlanModal from '../components/NewTestPlanModal'
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
  const [myRole, setMyRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [showExport, setShowExport] = useState(false)

  const canAuthor = ['admin', 'lead', 'tester'].includes(myRole)
  const canDelete = ['admin', 'lead'].includes(myRole)
  // Admins and Leads may override someone else's test case assignment.
  const canManageAssignments = ['admin', 'lead'].includes(myRole)

  const fetchAll = async () => {
    const [{ data: proj }, { data: planRows }, { data: runRows }, { data: statusData }, { data: memberRows }, { data: roleRow }] =
      await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase
          .from('test_plans')
          .select('*, owner:profiles!owner_id(id, name), creator:profiles!created_by(name)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase.from('test_runs').select('id, name, status, test_plan_id').eq('project_id', projectId),
        fetchAllRows(() =>
          supabase.from('test_run_case_current_status').select('run_id, current_status, run_case_id').eq('project_id', projectId).order('run_case_id')),
        supabase.from('project_members').select('user_id, profiles(id, name)').eq('project_id', projectId),
        user
          ? supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
    setProject(proj)
    setPlans(planRows || [])
    setRuns(runRows || [])
    setStatusRows(statusData || [])
    setMembers((memberRows || []).map((m) => m.profiles).filter(Boolean))
    setMyRole(roleRow?.role || null)
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
        canAuthor={canAuthor}
        canDelete={canDelete}
        canManageAssignments={canManageAssignments}
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
              <button
                onClick={() => setShowExport(true)}
                className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
              >
                <Download size={14} /> Export Excel
              </button>
              {canAuthor && (
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

        <div className="p-6">
          <EnterpriseTable
            rows={plans}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/project/${projectId}/plans/${p.id}`)}
            emptyState={
              <EmptyState
                icon={ClipboardList}
                title="No test plans yet"
                description="Create a plan to bundle test runs for a release and track your VMS test scenarios in one place."
                action={
                  canAuthor && (
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
            columns={[
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
              { key: 'status', label: 'Status', render: (p) => <StatusBadge domain={TEST_PLAN_STATUS} value={p.status} /> },
              { key: 'runs', label: 'Runs', render: (p) => runCountForPlan(p.id) },
              {
                key: 'progress',
                label: 'Progress',
                width: '220px',
                render: (p) => <StatusProgressBar domain={TEST_RUN_RESULT} counts={perPlanCounts[p.id] || countsFor([])} />,
              },
              { key: 'owner', label: 'Owner', render: (p) => p.owner?.name || '—' },
              { key: 'target_date', label: 'Target Date', render: (p) => p.target_date ? new Date(p.target_date).toLocaleDateString() : '—' },
            ]}
          />
        </div>
      </div>

      <NewTestPlanModal
        open={showNewPlan}
        onClose={() => setShowNewPlan(false)}
        projectId={projectId}
        members={members}
        userId={user?.id}
        onSaved={(newPlanId) => {
          fetchAll()
          navigate(`/project/${projectId}/plans/${newPlanId}`)
        }}
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

function TestPlanDetail({ projectId, planId, project, runs, statusRows, members, canAuthor, canDelete, canManageAssignments, userId, onRefreshList }) {
  const navigate = useNavigate()
  const [showExport, setShowExport] = useState(false)
  const [plan, setPlan] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)

  const fetchPlan = async () => {
    const [{ data: planRow }, { data: itemRows }] = await Promise.all([
      supabase.from('test_plans').select('*, owner:profiles!owner_id(id, name), creator:profiles!created_by(name)').eq('id', planId).single(),
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
          badge={<StatusBadge domain={TEST_PLAN_STATUS} value={plan.status} />}
          subtitle={plan.description || `Created by ${plan.creator?.name || 'someone'}`}
          actions={
            <div className="flex items-center gap-2">
              {canAuthor && (
                <select
                  value={plan.status}
                  onChange={(e) => setPlanStatus(e.target.value)}
                  className="text-[12px] bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 outline-none"
                >
                  {Object.entries(TEST_PLAN_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              )}
              {canAuthor && (
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 border border-gray-600 hover:bg-gray-650 text-gray-300 px-3 py-1.5 rounded-md text-[12px] font-semibold"
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button
                onClick={() => setShowExport(true)}
                className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
              >
                <Download size={14} /> Export Excel
              </button>
            </div>
          }
        />

        <div className="p-6 space-y-4">
          <button
            onClick={() => navigate(`/project/${projectId}/plans`)}
            className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-white"
          >
            <ArrowLeft size={14} /> All Test Plans
          </button>

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
              {canAuthor && (
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
                  {canAuthor && (
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
              canAuthor={canAuthor}
              canDelete={canDelete}
              canManageAssignments={canManageAssignments}
              userId={userId}
              members={members}
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

      <ExportTestPlanModal
        open={showExport}
        onClose={() => setShowExport(false)}
        planId={planId}
        planName={plan.name}
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
