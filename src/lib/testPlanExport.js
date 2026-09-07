// Builds the VMS Test Plan workbook.
//
// Presentation only — Topic, Scenario, Test Steps, Expected Result, RESULT and
// Failure Comment are written exactly as stored.
//
// Two things matter for Excel to accept this file, and getting either wrong
// makes Excel "repair" the workbook and silently throw away every bit of
// formatting:
//   1. Element order inside a worksheet is a fixed schema sequence —
//      sheetPr, dimension, sheetViews, sheetFormatPr, cols, sheetData,
//      autoFilter, mergeCells, printOptions, pageMargins, pageSetup,
//      headerFooter, and only then drawing.
//   2. styles.xml must carry the Normal cellStyle, dxfs and tableStyles.
// Formulas also carry a cached <v>, so the numbers are right even before
// Excel recalculates.

import { escapeXml, columnName, zipParts, saveBlob, withExtension } from './xlsx'

const PLAN_SHEET = 'Test Plan'
const SUMMARY_SHEET = 'Summary'

const STATUSES = ['Pass', 'Fail', 'Blocked', 'Retest', 'Not Tested']
const STATUS_HEADING = { Pass: 'PASSED', Fail: 'FAILED', Blocked: 'BLOCKED', Retest: 'RETEST', 'Not Tested': 'NOT TESTED' }
const STATUS_RGB = { Pass: '2E7D4F', Fail: 'C0392B', Blocked: 'B9770E', Retest: '6B4FA8', 'Not Tested': '7F8C8D' }

// ---------------------------------------------------------------- styles ---

const FONTS = [
  { sz: 10 },                                            // 0 body
  { sz: 20, b: 1, color: 'FFFFFF' },                     // 1 title
  { sz: 11, color: 'D6E0F0' },                           // 2 subtitle
  { sz: 10, b: 1, color: '44546A' },                     // 3 info label
  { sz: 11, b: 1, color: 'FFFFFF' },                     // 4 section band
  { sz: 10, b: 1, color: 'FFFFFF' },                     // 5 table header
  { sz: 10, b: 1, color: '2E7D4F' },                     // 6 pass
  { sz: 10, b: 1, color: 'C0392B' },                     // 7 fail
  { sz: 10, b: 1, color: 'B9770E' },                     // 8 blocked
  { sz: 10, b: 1, color: '6B4FA8' },                     // 9 retest
  { sz: 10, b: 1, color: '7F8C8D' },                     // 10 not tested
  { sz: 9, b: 1, color: 'FFFFFF' },                      // 11 metric caption
  { sz: 18, b: 1, color: '1F3864' },                     // 12 metric value
  { sz: 10, b: 1, color: '1F3864' },                     // 13 topic
]

const FILLS = [
  null,                 // 0 none
  'gray125',            // 1 (Excel expects this in slot 1)
  '1F3864',             // 2 deep blue
  '2F5597',             // 3 mid blue
  'F2F5FA',             // 4 banded row
  'E8F5EC',             // 5 pass
  'FBEAE8',             // 6 fail
  'FDF3E2',             // 7 blocked
  'F0EBF8',             // 8 retest
  'F0F1F2',             // 9 not tested
  'DDE4F0',             // 10 metric card
]

// 0 none, 1 thin grid, 2 thin grid with a heavier top edge for topic changes.
const BORDERS = [
  '<border/>',
  '<border><left style="thin"><color rgb="FFC9D2E0"/></left><right style="thin"><color rgb="FFC9D2E0"/></right><top style="thin"><color rgb="FFC9D2E0"/></top><bottom style="thin"><color rgb="FFC9D2E0"/></bottom></border>',
  '<border><left style="thin"><color rgb="FFC9D2E0"/></left><right style="thin"><color rgb="FFC9D2E0"/></right><top style="medium"><color rgb="FF2F5597"/></top><bottom style="thin"><color rgb="FFC9D2E0"/></bottom></border>',
]

// Each entry becomes one xf; the index is the style id used by cells.
const XFS = [
  { font: 0, fill: 0, border: 0 },                                                                    // 0 default
  { font: 1, fill: 2, border: 0, align: { horizontal: 'center', vertical: 'center' } },               // 1 title
  { font: 2, fill: 2, border: 0, align: { horizontal: 'center', vertical: 'center' } },               // 2 subtitle
  { font: 3, fill: 0, border: 0, align: { horizontal: 'right', vertical: 'center' } },                // 3 info label
  { font: 0, fill: 0, border: 0, align: { horizontal: 'left', vertical: 'center' } },                 // 4 info value
  { font: 4, fill: 3, border: 0, align: { horizontal: 'left', vertical: 'center', indent: 1 } },      // 5 section band
  { font: 5, fill: 2, border: 1, align: { horizontal: 'center', vertical: 'center', wrap: 1 } },      // 6 table header
  { font: 11, fill: 3, border: 1, align: { horizontal: 'center', vertical: 'center' } },              // 7 metric caption
  { font: 12, fill: 10, border: 1, align: { horizontal: 'center', vertical: 'center' } },             // 8 metric value
  { font: 12, fill: 10, border: 1, numFmt: 164, align: { horizontal: 'center', vertical: 'center' } },// 9 metric percent
]

const BODY_BASE = XFS.length
// Body styles are generated as a matrix: {plain, banded} x {normal top, topic-change top}.
for (const fill of [0, 4]) {
  for (const border of [1, 2]) {
    XFS.push({ font: 0, fill, border, align: { vertical: 'top', wrap: 1 } })   // body text
    XFS.push({ font: 13, fill, border, align: { vertical: 'top', wrap: 1 } })  // topic cell
  }
}
const RESULT_BASE = XFS.length
for (const status of STATUSES) {
  const font = 6 + STATUSES.indexOf(status)
  const fill = 5 + STATUSES.indexOf(status)
  for (const border of [1, 2]) {
    XFS.push({ font, fill, border, align: { horizontal: 'center', vertical: 'center' } })
  }
}

const bodyStyle = (banded, topicChange, isTopic) =>
  BODY_BASE + (banded ? 4 : 0) + (topicChange ? 2 : 0) + (isTopic ? 1 : 0)
const resultStyle = (status, topicChange) => {
  const index = STATUSES.indexOf(status)
  return RESULT_BASE + (index < 0 ? 8 : index * 2) + (topicChange ? 1 : 0)
}

const S = {
  TITLE: 1, SUBTITLE: 2, LABEL: 3, VALUE: 4, SECTION: 5, TH: 6,
  METRIC_CAPTION: 7, METRIC_VALUE: 8, METRIC_PCT: 9,
}

function stylesXml() {
  const fonts = FONTS.map((f) =>
    `<font>${f.b ? '<b/>' : ''}<sz val="${f.sz}"/>${f.color ? `<color rgb="FF${f.color}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`).join('')

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
      + `${x.numFmt ? ' applyNumberFormat="1"' : ''} applyFont="1" applyFill="1" applyBorder="1"${alignment ? ' applyAlignment="1"' : ''}>`
      + `${alignment}</xf>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><fonts count="${FONTS.length}">${fonts}</fonts><fills count="${FILLS.length}">${fills}</fills><borders count="${BORDERS.length}">${BORDERS.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${XFS.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`
}

// ----------------------------------------------------------------- cells ---

const cellText = (ref, value, style) =>
  value === null || value === undefined || value === ''
    ? `<c r="${ref}" s="${style}"/>`
    : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`

// Cached <v> keeps the number correct in any viewer; Excel recalculates anyway.
const cellFormula = (ref, expression, cached, style) =>
  `<c r="${ref}" s="${style}"><f>${escapeXml(expression)}</f><v>${cached}</v></c>`

function lineCount(value, width) {
  return String(value || '')
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (width * 1.02))), 0)
}

const band = (rowNumber, width, label, style) =>
  Array.from({ length: width }, (_, i) => cellText(`${columnName(i)}${rowNumber}`, i === 0 ? label : '', style)).join('')

// ------------------------------------------------------------ plan sheet ---

const HEADER_ROW = 15

function planSheet(columns, rows, meta, counts) {
  const width = Math.max(columns.length, 6)
  const lastCol = columnName(columns.length - 1)
  const bannerCol = columnName(width - 1)
  const firstData = HEADER_ROW + 1
  const lastData = HEADER_ROW + rows.length
  const resultRange = `$E$${firstData}:$E$${lastData}`

  const body = []
  body.push(`<row r="1" ht="30" customHeight="1">${band(1, width, 'VMS TEST PLAN', S.TITLE)}</row>`)
  body.push(`<row r="2" ht="20" customHeight="1">${band(2, width, 'TEST EXECUTION REPORT', S.SUBTITLE)}</row>`)
  body.push(`<row r="3" ht="7" customHeight="1"/>`)

  ;[['Test Plan Name:', meta.planName], ['Generated On:', meta.generatedOn], ['Generated By:', meta.generatedBy]]
    .forEach(([label, value], i) => {
      const r = 4 + i
      body.push(`<row r="${r}" ht="16" customHeight="1">${cellText(`A${r}`, label, S.LABEL)}${cellText(`B${r}`, value, S.VALUE)}</row>`)
    })

  body.push(`<row r="7" ht="7" customHeight="1"/>`)
  body.push(`<row r="8" ht="20" customHeight="1">${band(8, width, 'TEST EXECUTION SUMMARY', S.SECTION)}</row>`)

  // Six metric cards: caption band over a large number, both boxed.
  const captions = ['TOTAL TESTS', ...STATUSES.map((s) => STATUS_HEADING[s])]
  const values = [rows.length, ...STATUSES.map((s) => counts[s])]
  body.push(`<row r="9" ht="17" customHeight="1">${captions.map((c, i) => cellText(`${columnName(i)}9`, c, S.METRIC_CAPTION)).join('')}</row>`)
  body.push(`<row r="10" ht="30" customHeight="1">${values.map((v, i) =>
    cellFormula(`${columnName(i)}10`,
      i === 0 ? `COUNTA(${resultRange})` : `COUNTIF(${resultRange},"${STATUSES[i - 1]}")`,
      v, S.METRIC_VALUE)).join('')}</row>`)

  const passRate = rows.length ? counts.Pass / rows.length : 0
  body.push(`<row r="11" ht="26" customHeight="1">${cellText('A11', 'PASS RATE', S.METRIC_CAPTION)}${
    cellFormula('B11', `IF(A10=0,0,B10/A10)`, passRate.toFixed(6), S.METRIC_PCT)}${
    Array.from({ length: width - 2 }, (_, i) => cellText(`${columnName(i + 2)}11`, '', S.VALUE)).join('')}</row>`)

  body.push(`<row r="12" ht="7" customHeight="1"/>`)
  body.push(`<row r="13" ht="7" customHeight="1"/>`)
  body.push(`<row r="14" ht="20" customHeight="1">${band(14, width, 'DETAILED TEST PLAN', S.SECTION)}</row>`)
  body.push(`<row r="${HEADER_ROW}" ht="28" customHeight="1">${columns.map((col, i) =>
    cellText(`${columnName(i)}${HEADER_ROW}`, col.label, S.TH)).join('')}</row>`)

  // Banding follows Topic groups, and a group's first row gets a heavier top
  // border. Every row keeps its own Topic value, so filtering still works.
  let banded = false
  rows.forEach((row, r) => {
    const topicChange = r > 0 && row.topic !== rows[r - 1].topic
    if (topicChange) banded = !banded
    const rowNumber = firstData + r
    let lines = 1
    const cells = columns.map((col, i) => {
      const value = row[col.key] ?? ''
      lines = Math.max(lines, lineCount(value, col.width))
      const ref = `${columnName(i)}${rowNumber}`
      if (col.key === 'result') return cellText(ref, value, resultStyle(value, topicChange))
      return cellText(ref, value, bodyStyle(banded, topicChange, col.key === 'topic'))
    })
    const height = Math.min(409, Math.max(17, lines * 12.75))
    body.push(`<row r="${rowNumber}" ht="${height.toFixed(1)}" customHeight="1">${cells.join('')}</row>`)
  })

  const widths = columns.map((col, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`).join('')
  const merges = [`A1:${bannerCol}1`, `A2:${bannerCol}2`, `A8:${bannerCol}8`, `A14:${bannerCol}14`]

  // Schema order below is deliberate — see the note at the top of this file.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastCol}${lastData}"/><sheetViews><sheetView showGridLines="0" tabSelected="1" workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${firstData}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${firstData}" sqref="A${firstData}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="14"/><cols>${widths}</cols><sheetData>${body.join('')}</sheetData><autoFilter ref="A${HEADER_ROW}:${lastCol}${lastData}"/><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.35" right="0.35" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter></worksheet>`
}

// --------------------------------------------------------- summary sheet ---

function summarySheet(rows, meta, counts) {
  const lastData = HEADER_ROW + rows.length
  const range = `'${PLAN_SHEET}'!$E$${HEADER_ROW + 1}:$E$${lastData}`
  const body = []

  body.push(`<row r="1" ht="30" customHeight="1">${band(1, 6, 'VMS TEST PLAN', S.TITLE)}</row>`)
  body.push(`<row r="2" ht="20" customHeight="1">${band(2, 6, 'TEST EXECUTION SUMMARY', S.SUBTITLE)}</row>`)
  body.push(`<row r="3" ht="7" customHeight="1"/>`)

  ;[['Test Plan Name:', meta.planName], ['Generated On:', meta.generatedOn], ['Generated By:', meta.generatedBy]]
    .forEach(([label, value], i) => {
      const r = 4 + i
      body.push(`<row r="${r}" ht="16" customHeight="1">${cellText(`A${r}`, label, S.LABEL)}${cellText(`B${r}`, value, S.VALUE)}</row>`)
    })

  body.push(`<row r="7" ht="7" customHeight="1"/>`)

  // Row 8/9 double as the metric cards and the chart's source range.
  const captions = ['TOTAL TESTS', ...STATUSES.map((s) => STATUS_HEADING[s])]
  const values = [rows.length, ...STATUSES.map((s) => counts[s])]
  body.push(`<row r="8" ht="17" customHeight="1">${captions.map((c, i) => cellText(`${columnName(i)}8`, c, S.METRIC_CAPTION)).join('')}</row>`)
  body.push(`<row r="9" ht="32" customHeight="1">${values.map((v, i) =>
    cellFormula(`${columnName(i)}9`,
      i === 0 ? `COUNTA(${range})` : `COUNTIF(${range},"${STATUSES[i - 1]}")`,
      v, S.METRIC_VALUE)).join('')}</row>`)

  const passRate = rows.length ? counts.Pass / rows.length : 0
  body.push(`<row r="10" ht="28" customHeight="1">${cellText('A10', 'PASS RATE', S.METRIC_CAPTION)}${
    cellFormula('B10', `IF(A9=0,0,B9/A9)`, passRate.toFixed(6), S.METRIC_PCT)}${
    Array.from({ length: 4 }, (_, i) => cellText(`${columnName(i + 2)}10`, '', S.VALUE)).join('')}</row>`)

  const widths = [26, 16, 16, 16, 16, 18]
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:F30"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="14"/><cols>${widths}</cols><sheetData>${body.join('')}</sheetData><mergeCells count="2"><mergeCell ref="A1:F1"/><mergeCell ref="A2:F2"/></mergeCells><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><drawing r:id="rIdDr"/></worksheet>`
}

// ----------------------------------------------------------------- chart ---

const CHART_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:rPr><a:t>Test Result Distribution</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>${SUMMARY_SHEET}!$A$8</c:f></c:strRef></c:tx>${
  STATUSES.map((status, i) => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${STATUS_RGB[status]}"/></a:solidFill></c:spPr></c:dPt>`).join('')
}<c:dLbls><c:spPr><a:noFill/></c:spPr><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls><c:cat><c:strRef><c:f>${SUMMARY_SHEET}!$B$8:$F$8</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${SUMMARY_SHEET}!$B$9:$F$9</c:f></c:numRef></c:val></c:ser><c:gapWidth val="70"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart><c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="222222222"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:crossAx val="111111111"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`

const DRAWING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>11</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>30</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Result Distribution"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdChart"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`

// -------------------------------------------------------------- workbook ---

export function buildTestPlanWorkbook(columns, rows, meta) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.result === s).length]))
  const lastCol = columnName(columns.length - 1)
  const lastData = HEADER_ROW + rows.length

  const parts = [
    {
      path: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`,
    },
    {
      path: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      // fullCalcOnLoad makes Excel refresh the COUNTIFs on open.
      path: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${escapeXml(PLAN_SHEET)}" sheetId="1" r:id="rId1"/><sheet name="${SUMMARY_SHEET}" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'${PLAN_SHEET}'!$${HEADER_ROW}:$${HEADER_ROW}</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">'${PLAN_SHEET}'!$A$1:$${lastCol}$${lastData}</definedName></definedNames><calcPr calcId="171027" fullCalcOnLoad="1"/></workbook>`,
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { path: 'xl/styles.xml', content: stylesXml() },
    { path: 'xl/worksheets/sheet1.xml', content: planSheet(columns, rows, meta, counts) },
    { path: 'xl/worksheets/sheet2.xml', content: summarySheet(rows, meta, counts) },
    {
      path: 'xl/worksheets/_rels/sheet2.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
    },
    { path: 'xl/drawings/drawing1.xml', content: DRAWING_XML },
    {
      path: 'xl/drawings/_rels/drawing1.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`,
    },
    { path: 'xl/charts/chart1.xml', content: CHART_XML },
  ]

  return zipParts(parts)
}

export function downloadTestPlanXlsx(filename, columns, rows, meta) {
  saveBlob(buildTestPlanWorkbook(columns, rows, meta), withExtension(filename, '.xlsx'))
}
