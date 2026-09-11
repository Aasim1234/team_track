import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ListChecks, PlayCircle, XCircle, CircleDashed, PieChart } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAllRows'
import ProjectSidebar from '../components/ProjectSidebar'
import AppHeader from '../components/AppHeader'
import StatCard from '../components/ui/StatCard'
import BentoCard from '../components/ui/BentoCard'
import EmptyState from '../components/ui/EmptyState'
import { staggerContainer } from '../lib/motion'
import {
  ChartCard, StackedBars, Donut, Legend, DataTable, Swatch,
  CASE_SERIES, fmt, pctLabel,
} from '../components/charts/CoverageCharts'
import { summarizeCases, formatPercent, NOT_IN_RUN } from '../lib/testMetrics'

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low']

const countsFor = (series) => Object.fromEntries(series.map((s) => [s.key, 0]))

// "82.6% of 87": the share of a group's test cases that have a recorded result
// (neither untested nor outside every run).
const executedLabel = (row) => {
  const executed = row.total - (row.counts.untested || 0) - (row.counts[NOT_IN_RUN] || 0)
  return (
    <>
      <span className="text-white font-medium">{pctLabel(executed, row.total)}</span>
      <span className="text-gray-500"> of {fmt(row.total)}</span>
    </>
  )
}

export default function TestCoveragePage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [projectId, setProjectId] = useState('all')
  const [activeStatus, setActiveStatus] = useState(null)

  useEffect(() => {
    const load = async () => {
      const results = await Promise.all([
        supabase.from('projects').select('id, name').order('name'),
        fetchAllRows(() =>
          supabase
            .from('test_run_case_current_status')
            .select('run_case_id, test_case_id, project_id, current_status, last_executed_at')
            .order('run_case_id')),
        fetchAllRows(() =>
          supabase.from('test_cases').select('id, project_id, priority, section_id').order('id')),
        fetchAllRows(() => supabase.from('sections').select('id, suite_id').order('id')),
        supabase.from('test_suites').select('id, name'),
      ])
      const failed = results.find((r) => r.error)
      if (failed) { setError(failed.error.message); return }
      const [projects, statusRows, cases, sections, suites] = results.map((r) => r.data || [])
      setData({ projects, statusRows, cases, sections, suites })
    }
    load()
  }, [])

  const view = useMemo(() => {
    if (!data) return null
    const inScope = (p) => projectId === 'all' || p === projectId
    const cases = data.cases.filter((c) => inScope(c.project_id))
    const statusRows = data.statusRows.filter((r) => inScope(r.project_id))

    // Test-case view — the same calculation the Dashboard and Reports use.
    const summary = summarizeCases(cases, statusRows)

    const suiteBySection = new Map(data.sections.map((s) => [s.id, s.suite_id]))
    const suiteName = new Map(data.suites.map((s) => [s.id, s.name]))

    const group = (items, series, keyOf, labelOf, statusOf) => {
      const groups = new Map()
      for (const item of items) {
        const key = keyOf(item)
        if (key == null) continue
        const status = statusOf(item)
        if (!(status in countsFor(series))) continue
        if (!groups.has(key)) groups.set(key, { id: key, label: labelOf(key), counts: countsFor(series), total: 0 })
        const g = groups.get(key)
        g.counts[status]++
        g.total++
      }
      return [...groups.values()]
    }

    const bySuite = group(
      cases, CASE_SERIES,
      (c) => suiteBySection.get(c.section_id),
      (id) => suiteName.get(id) || 'Unknown suite',
      (c) => summary.statusOf(c.id),
    ).sort((a, b) => b.total - a.total)

    const rank = (k) => { const i = PRIORITY_ORDER.indexOf(k); return i === -1 ? 99 : i }
    const byPriority = group(
      cases, CASE_SERIES,
      (c) => c.priority || 'none',
      (k) => (k === 'none' ? 'No priority' : k[0].toUpperCase() + k.slice(1)),
      (c) => summary.statusOf(c.id),
    ).sort((a, b) => rank(a.id) - rank(b.id))

    return { summary, bySuite, byPriority }
  }, [data, projectId])

  const header = (
    <AppHeader breadcrumb={[{ label: 'My Workspace' }, { label: 'Dashboard', to: '/dashboard' }, { label: 'Test Coverage' }]} />
  )

  if (!view) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <ProjectSidebar />
        <div className="flex-1 min-w-0">
          {header}
          <div className="p-6 md:p-8 max-w-7xl mx-auto">
            {error ? (
              <EmptyState icon={PieChart} title="Couldn't load coverage" description={error} />
            ) : (
              <div className="animate-pulse space-y-4">
                <div className="h-8 w-56 bg-gray-800 rounded-lg" />
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 lg:col-span-4 h-52 bg-gray-800 rounded-2xl" />
                  <div className="col-span-12 lg:col-span-8 h-52 bg-gray-800 rounded-2xl" />
                </div>
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 lg:col-span-5 h-72 bg-gray-800 rounded-2xl" />
                  <div className="col-span-12 lg:col-span-7 h-72 bg-gray-800 rounded-2xl" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const { summary, bySuite, byPriority } = view
  const { counts } = summary

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <ProjectSidebar />
      <div className="flex-1 min-w-0">
        {header}

        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-3xl">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-white mb-2"
              >
                <ArrowLeft size={13} /> Dashboard
              </button>
              <h2 className="text-2xl font-bold tracking-tight">Test Coverage</h2>
              <p className="text-sm text-gray-400 mt-1">
                Each of your {fmt(summary.total)} test cases is counted once, at its most recent result
                across all runs: the same figures as the Dashboard.
              </p>
            </div>
            {/* The one filter row: it scopes every figure on the page. */}
            {data.projects.length > 1 && (
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded-md px-2.5 py-1.5 text-[12px] text-gray-200 outline-none"
              >
                <option value="all">All projects</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>

          {summary.total === 0 ? (
            <EmptyState icon={PieChart} title="No test cases yet" description="Add test cases and run them to see coverage here." />
          ) : (
            <>
              {/* Headline: pass rate is the one hero figure; tiles carry the rest. */}
              <div className="grid grid-cols-12 gap-4">
                <BentoCard noHover className="col-span-12 lg:col-span-4 p-5 flex flex-col">
                  <p className="text-[13px] font-semibold text-gray-400">Pass rate</p>
                  <p className="text-[52px] font-bold text-white leading-none mt-3">{formatPercent(summary.passRate)}</p>
                  <p className="text-[12px] text-gray-500 mt-2">
                    {fmt(counts.passed)} of {fmt(summary.executed)} executed test cases pass at their latest result
                  </p>
                  <div className="mt-auto pt-5">
                    <div className="flex justify-between text-[12px] mb-1.5">
                      <span className="text-gray-400">Executed</span>
                      <span className="text-white font-semibold">{formatPercent(summary.executedShare)}</span>
                    </div>
                    {/* Meter: the track is a lighter step of the fill's own ramp. */}
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--viz-meter-track)' }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'var(--viz-meter-fill)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${summary.executedShare}%` }}
                        transition={{ duration: 0.7, ease: 'easeOut' }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      {fmt(summary.executed)} of {fmt(summary.total)} test cases have a recorded result
                    </p>
                  </div>
                </BentoCard>

                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="col-span-12 lg:col-span-8 grid grid-cols-2 gap-4"
                >
                  <StatCard icon={ListChecks} label="Test cases" value={summary.total} tint="bg-blue-50 text-blue-600" />
                  <StatCard icon={PlayCircle} label="Executed (have a result)" value={summary.executed} tint="bg-green-50 text-green-600" />
                  <StatCard icon={XCircle} label="Failing at latest result" value={counts.failed} tint="bg-red-50 text-red-600" />
                  <StatCard icon={CircleDashed} label="Not in any run" value={counts[NOT_IN_RUN]} tint="bg-gray-100 text-gray-600" />
                </motion.div>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <ChartCard
                  className="col-span-12 lg:col-span-5"
                  title="Test case status"
                  subtitle={`${fmt(summary.total)} test cases, latest result each`}
                  table={<DataTable rows={[{ id: 'all', label: 'All test cases', counts, total: summary.total }]} series={CASE_SERIES} firstColumn="Scope" />}
                >
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <Donut
                      series={CASE_SERIES}
                      counts={counts}
                      active={activeStatus}
                      onActive={setActiveStatus}
                      centerValue={fmt(summary.total)}
                      centerLabel="test cases"
                    />
                    <ul className="flex-1 w-full space-y-0.5">
                      {CASE_SERIES.filter((s) => counts[s.key] > 0).map((s) => (
                        <li key={s.key}>
                          <button
                            onMouseEnter={() => setActiveStatus(s.key)}
                            onMouseLeave={() => setActiveStatus(null)}
                            onFocus={() => setActiveStatus(s.key)}
                            onBlur={() => setActiveStatus(null)}
                            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] outline-none ${
                              activeStatus === s.key ? 'bg-gray-650' : ''
                            }`}
                          >
                            <Swatch series={s} round />
                            <span className="flex-1 text-left text-gray-300">{s.label}</span>
                            <span className="text-white font-semibold tabular-nums">{fmt(counts[s.key])}</span>
                            <span className="w-12 text-right text-gray-500 tabular-nums">{pctLabel(counts[s.key], summary.total)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </ChartCard>

                <ChartCard
                  className="col-span-12 lg:col-span-7"
                  title="Coverage by suite"
                  subtitle="Test cases in each suite, latest result each"
                  table={<DataTable rows={bySuite} series={CASE_SERIES} firstColumn="Suite" />}
                >
                  <Legend series={CASE_SERIES} totals={counts} />
                  <div className="mt-4">
                    <StackedBars rows={bySuite} series={CASE_SERIES} valueLabel={executedLabel} headers={['Suite', 'Executed']} />
                  </div>
                </ChartCard>
              </div>

              <ChartCard
                title="Coverage by priority"
                subtitle="Test cases at each priority, latest result each"
                table={<DataTable rows={byPriority} series={CASE_SERIES} firstColumn="Priority" />}
              >
                <Legend series={CASE_SERIES} totals={counts} />
                <div className="mt-4">
                  <StackedBars rows={byPriority} series={CASE_SERIES} valueLabel={executedLabel} headers={['Priority', 'Executed']} />
                </div>
              </ChartCard>

            </>
          )}
        </div>
      </div>
    </div>
  )
}
