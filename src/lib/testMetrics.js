// One definition of every test statistic in the app. Pages call these instead
// of counting on their own, so "test cases" or "pass rate" means the same
// number wherever it appears.
//
//   Test cases      unique cases in the repository (test_cases).
//   Test case runs  a case's slot in one test run (test_run_cases). A case in
//                   three runs counts three times, so this number is larger.
//   Results         individual recorded outcomes (test_results): one each time
//                   someone marks a slot Passed, Failed, and so on.
//
// Headline coverage and pass rate are measured on TEST CASES, each case taking
// its most recent result across every run, so they always add up to the test
// case count. The run-slot view (summarizeRunCases) is only for screens that
// are explicitly about one run or compare runs, and should be labelled so.

export const RESULT_STATUSES = ['passed', 'failed', 'blocked', 'retest', 'skipped', 'untested']
export const NOT_IN_RUN = 'not_in_run'

export const TERMS = {
  testCases: 'Test cases',
  caseRuns: 'Test case runs',
  results: 'Recorded results',
}

const emptyCounts = (keys) => Object.fromEntries(keys.map((k) => [k, 0]))

const timeOf = (value) => {
  if (!value) return -Infinity
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? -Infinity : t
}

// test_case_id -> status of its most recently executed run slot. A case whose
// slots have never been executed resolves to 'untested'.
export function latestStatusByCase(statusRows) {
  const best = new Map()
  for (const row of statusRows) {
    if (!RESULT_STATUSES.includes(row.current_status)) continue
    const at = timeOf(row.last_executed_at)
    const current = best.get(row.test_case_id)
    if (!current || at > current.at) best.set(row.test_case_id, { status: row.current_status, at })
  }
  return new Map([...best].map(([id, v]) => [id, v.status]))
}

// Test-case view: every case counted once at its latest result; cases never
// placed in any run are NOT_IN_RUN. counts always sums to cases.length.
export function summarizeCases(cases, statusRows) {
  const latest = latestStatusByCase(statusRows)
  const counts = emptyCounts([...RESULT_STATUSES, NOT_IN_RUN])
  for (const c of cases) counts[latest.get(c.id) ?? NOT_IN_RUN]++

  const total = cases.length
  const inRuns = total - counts[NOT_IN_RUN]
  const executed = inRuns - counts.untested
  return {
    total,
    counts,
    inRuns,
    executed,
    passRate: executed ? (counts.passed / executed) * 100 : 0,
    executedShare: total ? (executed / total) * 100 : 0,
    statusOf: (id) => latest.get(id) ?? NOT_IN_RUN,
  }
}

// Run-slot view: one entry per test case per run. Only for screens about runs.
export function summarizeRunCases(statusRows) {
  const counts = emptyCounts(RESULT_STATUSES)
  for (const r of statusRows) if (r.current_status in counts) counts[r.current_status]++
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const executed = total - counts.untested
  return { total, counts, executed, passRate: executed ? (counts.passed / executed) * 100 : 0 }
}

// The one percentage format: one decimal everywhere, so the same figure never
// reads 93% on one page and 92.5% on another.
export function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%'
  if (value > 0 && value < 0.1) return '<0.1%'
  return `${value.toFixed(1)}%`
}

export const formatShare = (part, whole) => formatPercent(whole ? (part / whole) * 100 : 0)
