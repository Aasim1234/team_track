// Builds the Excel workbook for one release report: a test plan marked Pass or
// Discard for a release version, with the results saved at that moment.
//
// Sheets: Release Report (details + summary), Test Results, Failed & Blocked.
// Values are plain numbers, not formulas — a saved report is a record.
//
// Worksheet element order follows the schema (see testPlanExport.js): sheetPr,
// dimension, sheetViews, sheetFormatPr, cols, sheetData, autoFilter, mergeCells,
// pageMargins, pageSetup.

import { escapeXml, columnName, zipParts, saveBlob } from './xlsx'
import { VMS_RESULT, TEST_PLAN_STATUS } from './statusConfig'
import { formatCaseId } from './testCaseId'
import { formatAuditTime } from './auditLog'

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
  { sz: 9, i: 1, color: '6B7785' },          // 13 note
]

const FILLS = [null, 'gray125', '1F3864', '2F5597', 'F2F5FA', 'E8F5EC', 'FBEAE8', 'FDF3E2', 'F0EBF8', 'F0F1F2', 'DDE4F0']

const BORDERS = [
  '<border/>',
  '<border><left style="thin"><color rgb="FFC9D2E0"/></left><right style="thin"><color rgb="FFC9D2E0"/></right><top style="thin"><color rgb="FFC9D2E0"/></top><bottom style="thin"><color rgb="FFC9D2E0"/></bottom></border>',
]

const CENTER = { horizontal: 'center', vertical: 'center' }
const TOP_CENTER = { horizontal: 'center', vertical: 'top' }
const XFS = [
  { font: 0, fill: 0, border: 0 },                                                          // 0 default
  { font: 1, fill: 2, border: 0, align: CENTER },                                           // 1 title
  { font: 2, fill: 2, border: 0, align: CENTER },                                           // 2 subtitle
  { font: 3, fill: 0, border: 0, align: { horizontal: 'right', vertical: 'top' } },         // 3 label
  { font: 0, fill: 0, border: 0, align: { horizontal: 'left', vertical: 'top', wrap: 1 } }, // 4 value
  { font: 12, fill: 3, border: 0, align: { horizontal: 'left', vertical: 'center', indent: 1 } }, // 5 section
  { font: 4, fill: 2, border: 1, align: { ...CENTER, wrap: 1 } },                           // 6 table header
  { font: 5, fill: 3, border: 1, align: CENTER },                                           // 7 metric caption
  { font: 6, fill: 10, border: 1, align: CENTER },                                          // 8 metric value
  { font: 6, fill: 10, border: 1, numFmt: 164, align: CENTER },                             // 9 metric percent
  { font: 0, fill: 0, border: 1, align: { vertical: 'top', wrap: 1 } },                     // 10 body
  { font: 0, fill: 4, border: 1, align: { vertical: 'top', wrap: 1 } },                     // 11 body banded
  { font: 7, fill: 5, border: 1, align: TOP_CENTER },                                       // 12 pass
  { font: 8, fill: 6, border: 1, align: TOP_CENTER },                                       // 13 fail
  { font: 9, fill: 7, border: 1, align: TOP_CENTER },                                       // 14 blocked
  { font: 10, fill: 8, border: 1, align: TOP_CENTER },                                      // 15 retest
  { font: 11, fill: 9, border: 1, align: TOP_CENTER },                                      // 16 untested / n/a
  { font: 8, fill: 0, border: 0, align: { horizontal: 'left', vertical: 'top', wrap: 1 } }, // 17 value, red
  { font: 13, fill: 0, border: 0, align: { horizontal: 'left', vertical: 'top', wrap: 1 } },// 18 note
]

const X = { TITLE: 1, SUBTITLE: 2, LABEL: 3, VALUE: 4, SECTION: 5, TH: 6, CAPTION: 7, METRIC: 8, METRIC_PCT: 9, BODY: 10, BODY_BAND: 11, VALUE_RED: 17, NOTE: 18 }
const RESULT_X = { pass: 12, fail: 13, blocked: 14, retest: 15, not_tested: 16, na: 16 }

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
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? `<c r="${ref}" s="${style}"/>`
    : `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`

const rowXml = (r, cells, height) =>
  `<row r="${r}"${height ? ` ht="${Number(height).toFixed(1)}" customHeight="1"` : ''}>${cells.join('')}</row>`

const bandCells = (r, width, label, style) =>
  Array.from({ length: width }, (_, i) => textCell(`${columnName(i)}${r}`, i === 0 ? label : '', style))

function lineCount(value, width) {
  return String(value ?? '').split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (width * 1.05))), 0)
}

function worksheet({ rows, widths, merges = [], freezeRow, autoFilter, lastRef, selected }) {
  const pane = freezeRow
    ? `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freezeRow + 1}" sqref="A${freezeRow + 1}"/>`
    : ''
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastRef}"/><sheetViews><sheetView showGridLines="0"${selected ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="14"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>${autoFilter ? `<autoFilter ref="${autoFilter}"/>` : ''}${merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}<pageMargins left="0.35" right="0.35" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
}

// ---------------------------------------------------------------- sheets ---

const statusLabel = (status) => TEST_PLAN_STATUS[status]?.label || status

function summarySheet(report, meta) {
  const WIDTH = 8
  const last = columnName(WIDTH - 1)
  const out = []
  const merges = [`A1:${last}1`, `A2:${last}2`]
  let r = 1

  out.push(rowXml(r++, bandCells(1, WIDTH, 'RELEASE REPORT', X.TITLE), 30))
  out.push(rowXml(r++, bandCells(2, WIDTH, `Release ${report.release_name} · ${report.plan_name}`, X.SUBTITLE), 20))
  out.push(rowXml(r++, [], 7))

  const section = (label) => {
    merges.push(`A${r}:${last}${r}`)
    out.push(rowXml(r, bandCells(r, WIDTH, label, X.SECTION), 20))
    r++
  }
  const info = (label, value, style = X.VALUE) => {
    merges.push(`B${r}:${last}${r}`)
    out.push(rowXml(r, [textCell(`A${r}`, label, X.LABEL), textCell(`B${r}`, value, style)], Math.max(16, lineCount(value, 105) * 13)))
    r++
  }

  section('RELEASE DETAILS')
  info('Release Version:', report.release_name)
  info('Test Plan:', report.plan_name)
  info('Status:', statusLabel(report.status), report.status === 'discard' ? X.VALUE_RED : X.VALUE)
  if (report.status === 'discard') info('Discard Reason:', report.discard_reason, X.VALUE_RED)
  info('Marked By:', `${report.decided_by_name} · ${formatAuditTime(report.decided_at)}`)
  info('Generated On:', meta.generatedOn)
  info('Generated By:', meta.generatedBy)
  out.push(rowXml(r++, [], 7))

  section('TEST EXECUTION SUMMARY')
  const metrics = [
    ['TEST CASES', report.total_cases], ['PASSED', report.passed], ['FAILED', report.failed], ['BLOCKED', report.blocked],
    ['RETEST', report.retest], ['UNTESTED', report.not_tested], ['N/A', report.na], ['PASS RATE', Number(report.pass_rate), true],
  ]
  out.push(rowXml(r, metrics.map(([caption], i) => textCell(`${columnName(i)}${r}`, caption, X.CAPTION)), 17))
  r++
  out.push(rowXml(r, metrics.map(([, value, pct], i) =>
    numberCell(`${columnName(i)}${r}`, pct ? value / 100 : value, pct ? X.METRIC_PCT : X.METRIC)), 30))
  r++
  merges.push(`A${r}:${last}${r}`)
  out.push(rowXml(r, [textCell(`A${r}`, 'Pass rate = passed ÷ executed (every result except Untested).', X.NOTE)], 16))
  r++
  merges.push(`A${r}:${last}${r}`)
  out.push(rowXml(r, [textCell(`A${r}`, `Results were saved when the test plan was marked ${statusLabel(report.status)}; later changes to the test plan do not change this report.`, X.NOTE)], 16))

  return worksheet({ rows: out, widths: [20, 14, 14, 14, 14, 14, 14, 14], merges, lastRef: `${last}${r}`, selected: true })
}

function tableSheet({ title, subtitle, columns, rows, emptyText }) {
  const width = columns.length
  const last = columnName(width - 1)
  const HEADER = 4
  const out = [
    rowXml(1, bandCells(1, width, title, X.TITLE), 26),
    rowXml(2, bandCells(2, width, subtitle, X.SUBTITLE), 18),
    rowXml(3, [], 6),
    rowXml(HEADER, columns.map((c, i) => textCell(`${columnName(i)}${HEADER}`, c.label, X.TH)), 26),
  ]
  if (!rows.length) out.push(rowXml(HEADER + 1, [textCell(`A${HEADER + 1}`, emptyText, X.NOTE)], 18))
  rows.forEach((data, index) => {
    const r = HEADER + 1 + index
    let lines = 1
    const cells = columns.map((c, i) => {
      const ref = `${columnName(i)}${r}`
      const value = data[c.key]
      if (c.type === 'result') return textCell(ref, VMS_RESULT[value]?.label || value, RESULT_X[value] ?? X.BODY)
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
  })
}

// -------------------------------------------------------------- workbook ---

export function buildReleaseReportWorkbook(report, results, meta) {
  const subtitle = `Release ${report.release_name} · ${report.plan_name} · ${statusLabel(report.status)}`
  const rows = results.map((c) => ({
    id: formatCaseId(c.case_number),
    topic: c.topic || '',
    scenario: c.scenario || '',
    steps: c.test_steps || '',
    expected: c.expected_result || '',
    result: c.result,
    reason: c.reason || '',
    recorded: c.recorded_by_name ? [c.recorded_by_name, c.recorded_at && formatAuditTime(c.recorded_at)].filter(Boolean).join(' · ') : '',
    assignee: c.assigned_to_name || '',
  }))

  const sheets = [
    { name: 'Release Report', xml: summarySheet(report, meta) },
    {
      name: 'Test Results',
      xml: tableSheet({
        title: 'TEST EXECUTION RESULTS',
        subtitle,
        emptyText: 'This test plan had no test cases.',
        columns: [
          { key: 'id', label: 'Test Case ID', width: 12 },
          { key: 'topic', label: 'Topic', width: 22 },
          { key: 'scenario', label: 'Scenario', width: 34 },
          { key: 'steps', label: 'Test Steps', width: 50 },
          { key: 'expected', label: 'Expected Result', width: 44 },
          { key: 'result', label: 'Result', width: 11, type: 'result' },
          { key: 'reason', label: 'Comment / Reason', width: 40 },
          { key: 'recorded', label: 'Failed / Blocked By', width: 24 },
          { key: 'assignee', label: 'Assigned To', width: 16 },
        ],
        rows,
      }),
    },
    {
      name: 'Failed & Blocked',
      xml: tableSheet({
        title: 'FAILED & BLOCKED TEST CASES',
        subtitle,
        emptyText: 'No test cases failed or were blocked.',
        columns: [
          { key: 'id', label: 'Test Case ID', width: 12 },
          { key: 'topic', label: 'Topic', width: 24 },
          { key: 'scenario', label: 'Scenario', width: 40 },
          { key: 'result', label: 'Result', width: 11, type: 'result' },
          { key: 'reason', label: 'Fail / Block Reason', width: 60 },
          { key: 'recorded', label: 'Failed / Blocked By', width: 26 },
        ],
        rows: rows.filter((c) => c.result === 'fail' || c.result === 'blocked')
          .map((c) => ({ ...c, reason: c.reason || 'No comment was recorded.' })),
      }),
    },
  ]

  const parts = [
    {
      path: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${
  sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
}</Types>`,
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
  return zipParts(parts)
}

export const releaseReportFilename = (report) =>
  `Release_${report.release_name}_${report.plan_name}_Report`.replace(/[^\w.-]+/g, '_') + '.xlsx'

export function downloadReleaseReport(report, results, meta) {
  const filename = releaseReportFilename(report)
  saveBlob(buildReleaseReportWorkbook(report, results, meta), filename)
  return filename
}
