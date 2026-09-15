// Builds the Release Report workbook for one release.
//
// The input is exactly what release_report() returned for the release the user
// is viewing — a saved report for a completed release, the live report
// otherwise — so an export always matches that release and nothing else.
//
// Sheets: Release Summary, Test Plans, Test Cases, Failed & Blocked, Test Runs,
// Activity. Values are written as plain numbers (no formulas): a saved report is
// a record, and should read the same in any viewer years from now.
//
// Worksheet element order follows the schema (see testPlanExport.js): sheetPr,
// dimension, sheetViews, sheetFormatPr, cols, sheetData, autoFilter, mergeCells,
// pageMargins, pageSetup.

import { escapeXml, columnName, zipParts, saveBlob, withExtension } from './xlsx'
import { VMS_RESULT, RELEASE_STATUS, RELEASE_DECISION, TODO_TASK_STATUS } from './statusConfig'
import { formatCaseId } from './testCaseId'
import { AUDIT_ACTIONS, formatAuditTime } from './auditLog'

// ---------------------------------------------------------------- styles ---

const FONTS = [
  { sz: 10 },                                // 0 body
  { sz: 18, b: 1, color: 'FFFFFF' },         // 1 title
  { sz: 11, color: 'D6E0F0' },               // 2 subtitle
  { sz: 10, b: 1, color: '44546A' },         // 3 label
  { sz: 10, b: 1, color: 'FFFFFF' },         // 4 table header
  { sz: 9, b: 1, color: 'FFFFFF' },          // 5 metric caption
  { sz: 16, b: 1, color: '1F3864' },         // 6 metric value
  { sz: 10, b: 1, color: '2E7D4F' },         // 7 pass
  { sz: 10, b: 1, color: 'C0392B' },         // 8 fail
  { sz: 10, b: 1, color: 'B9770E' },         // 9 blocked
  { sz: 10, b: 1, color: '6B4FA8' },         // 10 retest
  { sz: 10, b: 1, color: '7F8C8D' },         // 11 untested / n/a
  { sz: 11, b: 1, color: 'FFFFFF' },         // 12 section band
  { sz: 10, b: 1, color: 'C0392B' },         // 13 emphasis red
  { sz: 9, i: 1, color: '6B7785' },          // 14 note
]

const FILLS = [
  null, 'gray125',
  '1F3864',   // 2 deep blue
  '2F5597',   // 3 mid blue
  'F2F5FA',   // 4 banded row
  'E8F5EC',   // 5 pass
  'FBEAE8',   // 6 fail
  'FDF3E2',   // 7 blocked
  'F0EBF8',   // 8 retest
  'F0F1F2',   // 9 untested
  'DDE4F0',   // 10 metric card
]

const BORDERS = [
  '<border/>',
  '<border><left style="thin"><color rgb="FFC9D2E0"/></left><right style="thin"><color rgb="FFC9D2E0"/></right><top style="thin"><color rgb="FFC9D2E0"/></top><bottom style="thin"><color rgb="FFC9D2E0"/></bottom></border>',
]

const CENTER = { horizontal: 'center', vertical: 'center' }
const XFS = [
  { font: 0, fill: 0, border: 0 },                                                          // 0 default
  { font: 1, fill: 2, border: 0, align: CENTER },                                           // 1 title
  { font: 2, fill: 2, border: 0, align: CENTER },                                           // 2 subtitle
  { font: 3, fill: 0, border: 0, align: { horizontal: 'right', vertical: 'top' } },         // 3 label
  { font: 0, fill: 0, border: 0, align: { horizontal: 'left', vertical: 'top', wrap: 1 } }, // 4 value
  { font: 12, fill: 3, border: 0, align: { horizontal: 'left', vertical: 'center', indent: 1 } }, // 5 section band
  { font: 4, fill: 2, border: 1, align: { ...CENTER, wrap: 1 } },                           // 6 table header
  { font: 5, fill: 3, border: 1, align: CENTER },                                           // 7 metric caption
  { font: 6, fill: 10, border: 1, align: CENTER },                                          // 8 metric value
  { font: 6, fill: 10, border: 1, numFmt: 164, align: CENTER },                             // 9 metric percent
  { font: 0, fill: 0, border: 1, align: { vertical: 'top', wrap: 1 } },                     // 10 body
  { font: 0, fill: 4, border: 1, align: { vertical: 'top', wrap: 1 } },                     // 11 body banded
  { font: 0, fill: 0, border: 1, align: { horizontal: 'center', vertical: 'top' } },        // 12 number
  { font: 0, fill: 0, border: 1, numFmt: 164, align: { horizontal: 'center', vertical: 'top' } }, // 13 percent
  { font: 7, fill: 5, border: 1, align: { horizontal: 'center', vertical: 'top' } },        // 14 pass
  { font: 8, fill: 6, border: 1, align: { horizontal: 'center', vertical: 'top' } },        // 15 fail
  { font: 9, fill: 7, border: 1, align: { horizontal: 'center', vertical: 'top' } },        // 16 blocked
  { font: 10, fill: 8, border: 1, align: { horizontal: 'center', vertical: 'top' } },       // 17 retest
  { font: 11, fill: 9, border: 1, align: { horizontal: 'center', vertical: 'top' } },       // 18 untested / n/a
  { font: 13, fill: 0, border: 0, align: { horizontal: 'left', vertical: 'top', wrap: 1 } },// 19 value, red
  { font: 14, fill: 0, border: 0, align: { horizontal: 'left', vertical: 'top', wrap: 1 } },// 20 note
]

const X = {
  TITLE: 1, SUBTITLE: 2, LABEL: 3, VALUE: 4, SECTION: 5, TH: 6, CAPTION: 7, METRIC: 8, METRIC_PCT: 9,
  BODY: 10, BODY_BAND: 11, NUM: 12, PCT: 13, VALUE_RED: 19, NOTE: 20,
}
const RESULT_X = { pass: 14, fail: 15, blocked: 16, retest: 17, not_tested: 18, na: 18 }

function stylesXml() {
  const fonts = FONTS.map((f) =>
    `<font>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}<sz val="${f.sz}"/>${f.color ? `<color rgb="FF${f.color}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`).join('')
  const fills = FILLS.map((f) =>
    f === null ? '<fill><patternFill patternType="none"/></fill>'
      : f === 'gray125' ? '<fill><patternFill patternType="gray125"/></fill>'
        : `<fill><patternFill patternType="solid"><fgColor rgb="FF${f}"/><bgColor indexed="64"/></patternFill></fill>`).join('')
  const xfs = XFS.map((x) => {
    const a = x.align
    const alignment = a
      ? `<alignment${a.horizontal ? ` horizontal="${a.horizontal}"` : ''}${a.vertical ? ` vertical="${a.vertical}"` : ''}${a.wrap ? ' wrapText="1"' : ''}${a.indent ? ` indent="${a.indent}"` : ''}/>`
      : ''
    return `<xf numFmtId="${x.numFmt || 0}" fontId="${x.font}" fillId="${x.fill}" borderId="${x.border}" xfId="0"`
      + `${x.numFmt ? ' applyNumberFormat="1"' : ''} applyFont="1" applyFill="1" applyBorder="1"${alignment ? ' applyAlignment="1"' : ''}>${alignment}</xf>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><fonts count="${FONTS.length}">${fonts}</fonts><fills count="${FILLS.length}">${fills}</fills><borders count="${BORDERS.length}">${BORDERS.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${XFS.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`
}

// ----------------------------------------------------------------- cells ---

const textCell = (ref, value, style) =>
  value === null || value === undefined || value === ''
    ? `<c r="${ref}" s="${style}"/>`
    : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`

const numberCell = (ref, value, style) =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? `<c r="${ref}" s="${style}"/>`
    : `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`

const rowXml = (r, cells, height) =>
  `<row r="${r}"${height ? ` ht="${Number(height).toFixed(1)}" customHeight="1"` : ''}>${cells.join('')}</row>`

const bandCells = (r, width, label, style) =>
  Array.from({ length: width }, (_, i) => textCell(`${columnName(i)}${r}`, i === 0 ? label : '', style))

const colsXml = (widths) =>
  widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')

function lineCount(value, width) {
  return String(value ?? '')
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (width * 1.05))), 0)
}

function worksheet({ rows, widths, merges = [], freezeRow, autoFilter, lastRef, selected }) {
  const pane = freezeRow
    ? `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freezeRow + 1}" sqref="A${freezeRow + 1}"/>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastRef}"/><sheetViews><sheetView showGridLines="0"${selected ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="14"/><cols>${colsXml(widths)}</cols><sheetData>${rows.join('')}</sheetData>${autoFilter ? `<autoFilter ref="${autoFilter}"/>` : ''}${merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}<pageMargins left="0.35" right="0.35" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
}

// ------------------------------------------------------------ formatting ---

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatReleaseDate(value) {
  if (!value) return ''
  // Plain dates (release_date) are calendar days, not instants.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const byLine = (name, at) => [name, at ? formatAuditTime(at) : ''].filter(Boolean).join(' · ')
const resultLabel = (value) => VMS_RESULT[value]?.label || value || ''
const executedOf = (counts) => (counts?.total || 0) - (counts?.not_tested || 0)
const passRateOf = (counts) => (executedOf(counts) ? (counts.pass / executedOf(counts)) * 100 : 0)
const progressOf = (counts) => (counts?.total ? (executedOf(counts) / counts.total) * 100 : 0)

export const planPassRate = passRateOf
export const planProgress = progressOf

const planState = (plan) =>
  plan.departed ? `Left the release${plan.left_reason ? ` — ${plan.left_reason}` : ''}` : 'In the release'

// ---------------------------------------------------------------- sheets ---

function tableSheet({ title, subtitle, columns, rows, emptyText, selected }) {
  const width = columns.length
  const last = columnName(width - 1)
  const HEADER = 4
  const out = [
    rowXml(1, bandCells(1, width, title, X.TITLE), 26),
    rowXml(2, bandCells(2, width, subtitle, X.SUBTITLE), 18),
    rowXml(3, [], 6),
    rowXml(HEADER, columns.map((c, i) => textCell(`${columnName(i)}${HEADER}`, c.label, X.TH)), 28),
  ]

  if (!rows.length) {
    out.push(rowXml(HEADER + 1, [textCell(`A${HEADER + 1}`, emptyText, X.NOTE)], 18))
  }
  rows.forEach((data, index) => {
    const r = HEADER + 1 + index
    let lines = 1
    const cells = columns.map((c, i) => {
      const ref = `${columnName(i)}${r}`
      const value = data[c.key]
      if (c.type === 'number') return numberCell(ref, value, X.NUM)
      if (c.type === 'percent') return numberCell(ref, value === null || value === undefined ? null : value / 100, X.PCT)
      if (c.type === 'result') return textCell(ref, resultLabel(value), RESULT_X[value] ?? X.NUM)
      lines = Math.max(lines, lineCount(value, c.width))
      return textCell(ref, value, index % 2 ? X.BODY_BAND : X.BODY)
    })
    out.push(rowXml(r, cells, Math.min(409, Math.max(16, lines * 12.75))))
  })

  const lastRow = HEADER + Math.max(rows.length, 1)
  return worksheet({
    rows: out,
    widths: columns.map((c) => c.width),
    merges: [`A1:${last}1`, `A2:${last}2`],
    freezeRow: HEADER,
    autoFilter: rows.length ? `A${HEADER}:${last}${lastRow}` : null,
    lastRef: `${last}${lastRow}`,
    selected,
  })
}

function summarySheet(report, meta) {
  const { release, summary } = report
  const WIDTH = 8
  const last = columnName(WIDTH - 1)
  const VALUE_CHARS = 7 * 15   // columns B..H
  const out = []
  const merges = [`A1:${last}1`, `A2:${last}2`]
  let r = 1

  out.push(rowXml(r++, bandCells(1, WIDTH, 'RELEASE REPORT', X.TITLE), 30))
  out.push(rowXml(r++, bandCells(2, WIDTH, `Release ${release.name}${release.project_name ? ` · ${release.project_name}` : ''}`, X.SUBTITLE), 20))
  out.push(rowXml(r++, [], 7))

  const section = (label) => {
    merges.push(`A${r}:${last}${r}`)
    out.push(rowXml(r, bandCells(r, WIDTH, label, X.SECTION), 20))
    r++
  }
  const info = (label, value, style = X.VALUE) => {
    merges.push(`B${r}:${last}${r}`)
    const height = Math.max(16, lineCount(value, VALUE_CHARS) * 13)
    out.push(rowXml(r, [textCell(`A${r}`, label, X.LABEL), textCell(`B${r}`, value, style)], height))
    r++
  }

  section('RELEASE DETAILS')
  info('Release Version:', release.name)
  info('Release Status:', RELEASE_STATUS[release.status]?.label || release.status)
  info('Release Decision:', RELEASE_DECISION[release.decision]?.label || 'Not decided yet',
    release.decision === 'discard' ? X.VALUE_RED : X.VALUE)
  if (release.decision === 'discard') info('Discard Reason:', release.discard_reason, X.VALUE_RED)
  info('Release Date:', formatReleaseDate(release.release_date) || 'Not set')
  info('Created By:', byLine(release.created_by_name, release.created_at))
  info('Last Updated By:', byLine(release.updated_by_name, release.updated_at) || '—')
  info('Testing Started:', release.testing_started_at ? formatAuditTime(release.testing_started_at) : '—')
  info('Completed By:', byLine(release.completed_by_name, release.completed_at) || '—')
  info('Decided By:', byLine(release.decided_by_name, release.decided_at) || '—')
  info('Report:', report.source === 'saved'
    ? `Saved release report — captured ${formatAuditTime(report.saved.captured_at)} by ${report.saved.captured_by_name}. Later changes to test plans, test cases or results do not change it.`
    : `Live report — the release is ${RELEASE_STATUS[release.status]?.label || release.status}, so these are the results at the time of export.`)
  info('Generated On:', meta.generatedOn)
  info('Generated By:', meta.generatedBy)
  out.push(rowXml(r++, [], 7))

  section('TEST EXECUTION SUMMARY')
  const metricRow = (pairs) => {
    out.push(rowXml(r, pairs.map(([caption], i) => textCell(`${columnName(i)}${r}`, caption, X.CAPTION)), 17))
    r++
    out.push(rowXml(r, pairs.map(([, value, pct], i) =>
      numberCell(`${columnName(i)}${r}`, pct ? value / 100 : value, pct ? X.METRIC_PCT : X.METRIC)), 30))
    r++
  }
  metricRow([
    ['TEST PLANS', summary.total_plans], ['TEST CASES', summary.total_cases], ['PASSED', summary.pass],
    ['FAILED', summary.fail], ['BLOCKED', summary.blocked], ['RETEST', summary.retest],
    ['UNTESTED', summary.not_tested], ['N/A', summary.na],
  ])
  metricRow([['PASS RATE', summary.pass_rate, true], ['PROGRESS', summary.progress, true], ['EXECUTED', summary.executed]])
  merges.push(`A${r}:${last}${r}`)
  out.push(rowXml(r, [textCell(`A${r}`, 'Pass rate = passed ÷ executed (every result except Untested). Progress = executed ÷ total test cases.', X.NOTE)], 16))
  r++
  out.push(rowXml(r++, [], 7))

  section('DECISION HISTORY')
  out.push(rowXml(r, [
    textCell(`A${r}`, 'Decision', X.TH), textCell(`B${r}`, 'Reason', X.TH), textCell(`C${r}`, '', X.TH),
    textCell(`D${r}`, '', X.TH), textCell(`E${r}`, '', X.TH), textCell(`F${r}`, 'Decided By', X.TH),
    textCell(`G${r}`, '', X.TH), textCell(`H${r}`, 'Date & Time', X.TH),
  ], 20))
  merges.push(`B${r}:E${r}`, `F${r}:G${r}`)
  r++
  if (!report.decisions.length) {
    merges.push(`A${r}:${last}${r}`)
    out.push(rowXml(r, [textCell(`A${r}`, 'No decision has been recorded for this release yet.', X.NOTE)], 16))
    r++
  }
  report.decisions.forEach((d) => {
    const height = Math.max(16, lineCount(d.reason, 60) * 13)
    out.push(rowXml(r, [
      textCell(`A${r}`, RELEASE_DECISION[d.decision]?.label || d.decision, RESULT_X[d.decision === 'pass' ? 'pass' : 'fail']),
      textCell(`B${r}`, d.reason || '—', X.BODY), textCell(`C${r}`, '', X.BODY), textCell(`D${r}`, '', X.BODY), textCell(`E${r}`, '', X.BODY),
      textCell(`F${r}`, d.decided_by_name, X.BODY), textCell(`G${r}`, '', X.BODY),
      textCell(`H${r}`, formatAuditTime(d.decided_at), X.BODY),
    ], height))
    merges.push(`B${r}:E${r}`, `F${r}:G${r}`)
    r++
  })

  return worksheet({ rows: out, widths: [24, 15, 15, 15, 15, 15, 15, 20], merges, lastRef: `${last}${r - 1}`, selected: true })
}

// -------------------------------------------------------------- workbook ---

export function buildReleaseReportWorkbook(report, meta) {
  const name = report.release.name
  const subtitle = `Release ${name} · ${report.source === 'saved' ? 'saved report' : 'live report'}`
  const plans = report.plans

  const caseRows = plans.flatMap((plan) => plan.cases.map((c) => ({
    plan: plan.name,
    id: formatCaseId(c.case_number),
    topic: c.topic || '',
    scenario: c.scenario || '',
    steps: c.test_steps || '',
    expected: c.expected_result || '',
    result: c.result,
    reason: c.reason || '',
    recorded: c.failed_by_name ? byLine(c.failed_by_name, c.failed_at) : '',
    assignee: c.assigned_to_name || '',
    task: c.assigned_to_name ? (TODO_TASK_STATUS[c.task_status]?.label || c.task_status || '') : '',
  })))

  const sheets = [
    { name: 'Release Summary', xml: summarySheet(report, meta) },
    {
      name: 'Test Plans',
      xml: tableSheet({
        title: 'TEST PLANS',
        subtitle,
        emptyText: 'No test plans were part of this release.',
        columns: [
          { key: 'name', label: 'Test Plan', width: 30 },
          { key: 'state', label: 'In Release', width: 30 },
          { key: 'joined', label: 'Joined Release', width: 20 },
          { key: 'left', label: 'Left Release', width: 20 },
          { key: 'owner', label: 'Owner', width: 16 },
          { key: 'total', label: 'Test Cases', width: 11, type: 'number' },
          { key: 'pass', label: 'Passed', width: 10, type: 'number' },
          { key: 'fail', label: 'Failed', width: 10, type: 'number' },
          { key: 'blocked', label: 'Blocked', width: 10, type: 'number' },
          { key: 'retest', label: 'Retest', width: 10, type: 'number' },
          { key: 'not_tested', label: 'Untested', width: 10, type: 'number' },
          { key: 'na', label: 'N/A', width: 8, type: 'number' },
          { key: 'passRate', label: 'Pass Rate', width: 11, type: 'percent' },
          { key: 'progress', label: 'Progress', width: 11, type: 'percent' },
        ],
        rows: plans.map((p) => ({
          name: p.name,
          state: planState(p),
          joined: p.joined_at ? formatAuditTime(p.joined_at) : '',
          left: p.left_at ? formatAuditTime(p.left_at) : '',
          owner: p.owner_name || '',
          ...p.counts,
          passRate: passRateOf(p.counts),
          progress: progressOf(p.counts),
        })),
      }),
    },
    {
      name: 'Test Cases',
      xml: tableSheet({
        title: 'TEST CASE RESULTS',
        subtitle,
        emptyText: 'No test cases were recorded for this release.',
        columns: [
          { key: 'plan', label: 'Test Plan', width: 20 },
          { key: 'id', label: 'Test Case ID', width: 12 },
          { key: 'topic', label: 'Topic', width: 22 },
          { key: 'scenario', label: 'Scenario', width: 34 },
          { key: 'steps', label: 'Test Steps', width: 50 },
          { key: 'expected', label: 'Expected Result', width: 44 },
          { key: 'result', label: 'Result', width: 11, type: 'result' },
          { key: 'reason', label: 'Fail / Block Reason', width: 36 },
          { key: 'recorded', label: 'Failed / Blocked By', width: 22 },
          { key: 'assignee', label: 'Assigned To', width: 16 },
          { key: 'task', label: 'Task Status', width: 12 },
        ],
        rows: caseRows,
      }),
    },
    {
      name: 'Failed & Blocked',
      xml: tableSheet({
        title: 'FAILED & BLOCKED TEST CASES',
        subtitle,
        emptyText: 'No test cases failed or were blocked in this release.',
        columns: [
          { key: 'plan', label: 'Test Plan', width: 20 },
          { key: 'id', label: 'Test Case ID', width: 12 },
          { key: 'topic', label: 'Topic', width: 24 },
          { key: 'scenario', label: 'Scenario', width: 40 },
          { key: 'result', label: 'Result', width: 11, type: 'result' },
          { key: 'reason', label: 'Fail / Block Reason', width: 60 },
          { key: 'recorded', label: 'Failed / Blocked By', width: 26 },
        ],
        rows: caseRows.filter((c) => c.result === 'fail' || c.result === 'blocked')
          .map((c) => ({ ...c, reason: c.reason || 'No reason was recorded.' })),
      }),
    },
    {
      name: 'Test Runs',
      xml: tableSheet({
        title: 'TEST RUNS',
        subtitle,
        emptyText: 'No test runs were linked to this release\'s test plans.',
        columns: [
          { key: 'plan', label: 'Test Plan', width: 22 },
          { key: 'name', label: 'Test Run', width: 30 },
          { key: 'status', label: 'Status', width: 12 },
          { key: 'total', label: 'Total', width: 9, type: 'number' },
          { key: 'passed', label: 'Passed', width: 9, type: 'number' },
          { key: 'failed', label: 'Failed', width: 9, type: 'number' },
          { key: 'blocked', label: 'Blocked', width: 9, type: 'number' },
          { key: 'retest', label: 'Retest', width: 9, type: 'number' },
          { key: 'skipped', label: 'Skipped', width: 9, type: 'number' },
          { key: 'untested', label: 'Untested', width: 9, type: 'number' },
          { key: 'created', label: 'Created', width: 20 },
          { key: 'closed', label: 'Closed', width: 20 },
        ],
        rows: plans.flatMap((p) => p.runs.map((run) => ({
          plan: p.name,
          ...run,
          created: run.created_at ? formatAuditTime(run.created_at) : '',
          closed: run.closed_at ? formatAuditTime(run.closed_at) : '',
        }))),
      }),
    },
    {
      name: 'Activity',
      xml: tableSheet({
        title: 'EXECUTION & ACTIVITY HISTORY',
        subtitle,
        emptyText: 'No activity was recorded for this release.',
        columns: [
          { key: 'at', label: 'Date & Time', width: 20 },
          { key: 'user', label: 'User', width: 16 },
          { key: 'action', label: 'Action', width: 22 },
          { key: 'item', label: 'Test Case / Item', width: 30 },
          { key: 'plan', label: 'Test Plan', width: 20 },
          { key: 'field', label: 'Field', width: 14 },
          { key: 'old', label: 'Old Value', width: 22 },
          { key: 'new', label: 'New Value', width: 22 },
          { key: 'comment', label: 'Reason / Comment', width: 40 },
        ],
        rows: report.activity.map((a) => ({
          at: formatAuditTime(a.occurred_at),
          user: a.actor_name,
          action: AUDIT_ACTIONS[a.action]?.label || a.action,
          item: a.entity_label || '',
          plan: a.plan_name || '',
          field: a.field || '',
          old: a.old_value || '',
          new: a.new_value || '',
          comment: a.comment || '',
        })),
      }),
    },
  ]

  const overrides = sheets.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')

  const parts = [
    {
      path: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`,
    },
    {
      path: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      path: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${
  sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
}</sheets></workbook>`,
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
  sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { path: 'xl/styles.xml', content: stylesXml() },
    ...sheets.map((s, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, content: s.xml })),
  ]

  return { blob: zipParts(parts), caseCount: caseRows.length }
}

export const releaseReportFilename = (releaseName) =>
  `Release_${String(releaseName || 'Release').replace(/[^\w.-]+/g, '_')}_Report.xlsx`

export function downloadReleaseReport(report, meta) {
  const { blob, caseCount } = buildReleaseReportWorkbook(report, meta)
  const filename = withExtension(releaseReportFilename(report.release.name), '.xlsx')
  saveBlob(blob, filename)
  return { filename, caseCount }
}
