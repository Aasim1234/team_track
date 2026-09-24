// Turns an uploaded sheet into test cases for one test plan: the five columns
// the VMS test plan actually uses, nothing else.
//
//   Topic | Scenario | Test Steps | Expected Result | RESULT
//
// A sixth column, Fail / Block Reason, is optional and only needed for rows
// whose RESULT is Fail — the database refuses a failed test case without a
// reason, so the import refuses it too rather than losing the row on save.

import { downloadXlsx } from './xlsx'
import { VMS_RESULT } from './statusConfig'

export const TEMPLATE_COLUMNS = [
  { key: 'topic', label: 'Topic', width: 24 },
  { key: 'scenario', label: 'Scenario', width: 34 },
  { key: 'test_steps', label: 'Test Steps', width: 52 },
  { key: 'expected_result', label: 'Expected Result', width: 44 },
  { key: 'result', label: 'RESULT', width: 14 },
]

const REASON_COLUMN = { key: 'reason', label: 'Comment / Reason', width: 40 }

// What a header cell may say for each column. Anything else is ignored.
const HEADER_ALIASES = {
  topic: ['topic', 'section', 'module', 'feature'],
  scenario: ['scenario', 'test case', 'test case / scenario', 'title', 'test scenario'],
  test_steps: ['test steps', 'steps', 'step', 'test step'],
  expected_result: ['expected result', 'expected', 'expected results', 'expected outcome'],
  result: ['result', 'status', 'test result'],
  reason: ['comment / reason', 'comment', 'fail / block reason', 'fail reason', 'failure reason', 'block reason', 'failure comment', 'notes', 'note'],
}

const RESULT_ALIASES = {
  '': 'not_tested',
  'not tested': 'not_tested',
  'not-tested': 'not_tested',
  nottested: 'not_tested',
  untested: 'not_tested',
  pending: 'not_tested',
  pass: 'pass',
  passed: 'pass',
  ok: 'pass',
  fail: 'fail',
  failed: 'fail',
  blocked: 'blocked',
  block: 'blocked',
  retest: 'retest',
  're-test': 'retest',
  'n/a': 'na',
  na: 'na',
  'not applicable': 'na',
}

export const RESULT_LABELS = Object.entries(VMS_RESULT).map(([, cfg]) => cfg.label)

const clean = (value) => String(value ?? '').replace(/\r\n?/g, '\n').trim()
const key = (topic, scenario) => `${clean(topic).toLowerCase()}||${clean(scenario).toLowerCase()}`

// A row from the downloaded template that the user forgot to delete.
const SAMPLE_MARK = /^sample\b/i

export function findHeader(grid) {
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const cells = (grid[i] || []).map((c) => clean(c).toLowerCase())
    const mapped = {}
    cells.forEach((cell, index) => {
      for (const [field, names] of Object.entries(HEADER_ALIASES)) {
        if (names.includes(cell) && mapped[field] === undefined) mapped[field] = index
      }
    })
    if (mapped.scenario !== undefined && mapped.test_steps !== undefined) return { rowIndex: i, columns: mapped }
  }
  return null
}

// Reads the grid into test cases, and says exactly what is wrong with which row.
export function buildImport(grid, existingRows = []) {
  const header = findHeader(grid)
  if (!header) {
    return {
      rows: [], errors: [], sampleRows: 0,
      fatal: 'No header row found. The first row must name the columns: Topic, Scenario, Test Steps, Expected Result, RESULT.',
    }
  }

  const missing = ['topic', 'scenario', 'test_steps', 'expected_result', 'result']
    .filter((field) => header.columns[field] === undefined)
    .map((field) => TEMPLATE_COLUMNS.find((c) => c.key === field).label)
  if (missing.length) {
    return {
      rows: [], errors: [], sampleRows: 0,
      fatal: `These columns are missing from the sheet: ${missing.join(', ')}. Download the template to see the expected format.`,
    }
  }

  const existing = new Set(existingRows.map((r) => key(r.topic, r.scenario)))
  const seen = new Map()
  const rows = []
  const errors = []
  let sampleRows = 0

  for (let i = header.rowIndex + 1; i < grid.length; i++) {
    const cells = grid[i] || []
    const at = (field) => clean(cells[header.columns[field]])
    const topic = at('topic')
    const scenario = at('scenario')
    const steps = at('test_steps')
    const expected = at('expected_result')
    const rawResult = at('result')
    const reason = header.columns.reason !== undefined ? at('reason') : ''

    // Excel rows are 1-based and the user sees the header row too.
    const rowNumber = i + 1
    if (!topic && !scenario && !steps && !expected && !rawResult) continue
    if (SAMPLE_MARK.test(topic) || SAMPLE_MARK.test(scenario)) { sampleRows++; continue }

    const result = RESULT_ALIASES[rawResult.toLowerCase()]
    const problems = []
    if (!scenario) problems.push('Scenario is empty')
    if (!steps) problems.push('Test Steps are empty')
    if (!expected) problems.push('Expected Result is empty')
    if (result === undefined) problems.push(`RESULT "${rawResult}" is not one of ${RESULT_LABELS.join(', ')}`)
    if (result === 'fail' && !reason) problems.push('RESULT is Fail but no Fail / Block Reason is given')

    if (problems.length) {
      problems.forEach((p) => errors.push({ rowNumber, message: `Row ${rowNumber}: ${p}` }))
      continue
    }

    const rowKey = key(topic, scenario)
    const duplicateOfPlan = existing.has(rowKey)
    const duplicateInFile = seen.has(rowKey)
    seen.set(rowKey, true)

    rows.push({
      rowNumber,
      topic,
      scenario,
      test_steps: steps,
      expected_result: expected,
      result: result || 'not_tested',
      reason: reason || null,
      duplicate: duplicateOfPlan || duplicateInFile,
      duplicateInFile,
    })
  }

  return { rows, errors, sampleRows, fatal: null, headerRowNumber: header.rowIndex + 1 }
}

export const topicsOf = (rows) => [...new Set(rows.map((r) => r.topic).filter(Boolean))]

// The payload the database function takes.
export const toPayload = (rows) => rows.map((r) => ({
  topic: r.topic,
  scenario: r.scenario,
  test_steps: r.test_steps,
  expected_result: r.expected_result,
  result: r.result,
  reason: r.reason,
}))

export function downloadImportTemplate() {
  const sample = (topic, scenario, steps, expected) => ({
    topic: `SAMPLE — ${topic}`, scenario, test_steps: steps, expected_result: expected, result: 'Not Tested',
  })
  downloadXlsx('Test_Case_Import_Template', [
    {
      name: 'Test Cases',
      columns: TEMPLATE_COLUMNS,
      rows: [
        sample('Web Client', 'Login with valid credentials',
          '1. Open the application\n2. Enter username and password\n3. Click Login',
          'The user is logged in and the home screen is shown'),
        sample('Web Client', 'Verify logout',
          '1. Log in\n2. Click Logout',
          'The user is logged out and returned to the login screen'),
        sample('Playback', 'Seek within a recording',
          '1. Open a recording\n2. Drag the timeline to 00:30',
          'Playback continues from 00:30 without buffering'),
      ],
    },
    {
      name: 'How to use',
      columns: [{ key: 'note', label: 'How to use this template', width: 110 }],
      rows: [
        { note: 'Fill in one test case per row on the "Test Cases" sheet. Keep the five column headings exactly as they are.' },
        { note: 'Delete the three SAMPLE rows before importing (rows whose Topic starts with SAMPLE are ignored anyway).' },
        { note: 'Topic groups test cases into sections. Rows sharing a Topic end up in the same section, so repeat the Topic on each row.' },
        { note: 'Scenario, Test Steps and Expected Result must not be empty.' },
        { note: 'Use line breaks (Alt+Enter in Excel) inside Test Steps and Expected Result — they are kept exactly as typed.' },
        { note: `RESULT accepts: ${RESULT_LABELS.join(', ')} ("Not Tested" works too). Leave it empty for Untested.` },
        { note: 'Add an optional sixth column called "Comment / Reason" for notes. It is required for a Fail result and kept for any other result too.' },
        { note: 'Save the file as .xlsx or CSV, then use Import Test Cases in the test plan.' },
      ],
    },
  ])
}
