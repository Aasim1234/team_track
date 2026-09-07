// Builds the VMS Test Plan workbook: a presentation layer over the plan rows.
//
// Nothing here touches the test data — Topic, Scenario, Test Steps, Expected
// Result, RESULT and Failure Comment go in exactly as stored. Everything else
// is formatting, and every number in the summary is an Excel formula counting
// the real RESULT column, so the totals stay right if rows are filtered or
// edited in the file afterwards.

import { escapeXml, columnName, zipParts, saveBlob, withExtension } from './xlsx'

const SHEET_NAME = 'VMS Test Plan'

// Style ids, matching the cellXfs order in STYLES below.
const S = {
  DEFAULT: 0,
  TITLE: 1,
  SUBTITLE: 2,
  LABEL: 3,
  VALUE: 4,
  SECTION: 5,
  TH: 6,
  BODY: 7,
  BODY_ALT: 8,
  PASS: 9,
  FAIL: 10,
  BLOCKED: 11,
  RETEST: 12,
  UNTESTED: 13,
  SUM_TH: 14,
  SUM_VAL: 15,
  PERCENT: 16,
  TOPIC: 17,
  TOPIC_ALT: 18,
  META: 19,
}

const RESULT_STYLE = {
  Pass: S.PASS,
  Fail: S.FAIL,
  Blocked: S.BLOCKED,
  Retest: S.RETEST,
  'Not Tested': S.UNTESTED,
  'N/A': S.UNTESTED,
}

const SUMMARY_STATUSES = ['Pass', 'Fail', 'Blocked', 'Retest', 'Not Tested']
const STATUS_LABEL = { Pass: 'Passed', Fail: 'Failed', Blocked: 'Blocked', Retest: 'Retest', 'Not Tested': 'Not Tested' }
// Muted, print-safe status colours — used for the chart bars too.
const STATUS_COLOR = { Pass: '2E7D4F', Fail: 'C0392B', Blocked: 'C87F0A', Retest: '6B4FA8', 'Not Tested': '7F8C8D' }

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>
<fonts count="12">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="20"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FFD6E0F0"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF44546A"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF2E7D4F"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFC0392B"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFC87F0A"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF6B4FA8"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF7F8C8D"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><color rgb="FF1F3864"/><name val="Calibri"/></font>
</fonts>
<fills count="11">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2F5597"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F5FA"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8F5EC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFBEAE8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDF3E2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF0EBF8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF0F1F2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDDE4F0"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border/>
<border><left style="thin"><color rgb="FFC9D2E0"/></left><right style="thin"><color rgb="FFC9D2E0"/></right><top style="thin"><color rgb="FFC9D2E0"/></top><bottom style="thin"><color rgb="FFC9D2E0"/></bottom></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="20">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="7" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="8" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="9" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="10" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="11" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="11" fillId="10" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="11" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs></styleSheet>`

const text = (ref, value, style) =>
  value === null || value === undefined || value === ''
    ? `<c r="${ref}" s="${style}"/>`
    : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`

const formula = (ref, expression, style) => `<c r="${ref}" s="${style}"><f>${escapeXml(expression)}</f></c>`

// Rough but effective: how many wrapped lines a cell needs at its column width.
function lineCount(value, width) {
  return String(value || '')
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (width * 1.02))), 0)
}

function planSheet(columns, rows, meta) {
  const lastCol = columnName(columns.length - 1)
  const HEADER_ROW = 15
  const firstData = HEADER_ROW + 1
  const lastData = HEADER_ROW + rows.length
  // RESULT is always the fifth column, so the summary formulas have a fixed target.
  const resultRange = `$E$${firstData}:$E$${lastData}`

  // The summary strip needs six cells, so the banners span at least that far
  // even when Failure Comment is switched off and the table is five wide.
  const bannerWidth = Math.max(columns.length, 6)
  const bannerCol = columnName(bannerWidth - 1)
  const banner = (rowNumber, label, style) =>
    Array.from({ length: bannerWidth }, (_, i) => text(`${columnName(i)}${rowNumber}`, i === 0 ? label : '', style)).join('')

  const merges = [`A1:${bannerCol}1`, `A2:${bannerCol}2`, `A9:${bannerCol}9`, `A14:${bannerCol}14`]

  const body = []
  body.push(`<row r="1" ht="34" customHeight="1">${banner(1, 'VMS TEST PLAN', S.TITLE)}</row>`)
  body.push(`<row r="2" ht="18" customHeight="1">${banner(2, 'TEST EXECUTION REPORT', S.SUBTITLE)}</row>`)
  body.push(`<row r="3" ht="6" customHeight="1"/>`)

  const info = [
    ['Test Plan Name:', meta.planName],
    ['Generated On:', meta.generatedOn],
    ['Generated By:', meta.generatedBy],
  ]
  info.forEach(([label, value], i) => {
    body.push(`<row r="${4 + i}" ht="16" customHeight="1">${text(`A${4 + i}`, label, S.LABEL)}${text(`B${4 + i}`, value, S.VALUE)}</row>`)
  })
  body.push(`<row r="7" ht="16" customHeight="1">${text('A7', 'Total Test Cases:', S.LABEL)}${formula(`B7`, `COUNTA(${resultRange})`, S.VALUE)}</row>`)
  body.push(`<row r="8" ht="6" customHeight="1"/>`)

  body.push(`<row r="9" ht="20" customHeight="1">${banner(9, 'TEST EXECUTION SUMMARY', S.SECTION)}</row>`)

  const summaryHeads = ['Total', ...SUMMARY_STATUSES.map((s) => STATUS_LABEL[s])]
  body.push(`<row r="10" ht="18" customHeight="1">${summaryHeads.map((h, i) => text(`${columnName(i)}10`, h, S.SUM_TH)).join('')}</row>`)

  // Every figure is a COUNTIF over the real RESULT column, never a baked-in number.
  const summaryCells = [
    formula('A11', `COUNTA(${resultRange})`, S.SUM_VAL),
    ...SUMMARY_STATUSES.map((status, i) =>
      formula(`${columnName(i + 1)}11`, `COUNTIF(${resultRange},"${status}")`, S.SUM_VAL)),
  ]
  body.push(`<row r="11" ht="20" customHeight="1">${summaryCells.join('')}</row>`)
  body.push(`<row r="12" ht="18" customHeight="1">${text('A12', 'Pass Rate', S.SUM_TH)}${formula('B12', `IF(A11=0,0,B11/A11)`, S.PERCENT)}</row>`)
  body.push(`<row r="13" ht="6" customHeight="1"/>`)

  body.push(`<row r="14" ht="20" customHeight="1">${banner(14, 'DETAILED TEST PLAN', S.SECTION)}</row>`)
  body.push(`<row r="${HEADER_ROW}" ht="26" customHeight="1">${columns.map((col, i) => text(`${columnName(i)}${HEADER_ROW}`, col.label, S.TH)).join('')}</row>`)

  // Banding follows the Topic groups rather than single rows, so a topic reads
  // as one block — without merging anything, which would break filtering.
  let band = 0
  rows.forEach((row, r) => {
    if (r > 0 && row.topic !== rows[r - 1].topic) band = 1 - band
    const rowNumber = firstData + r
    let lines = 1
    const cells = columns.map((col, i) => {
      const value = row[col.key] ?? ''
      lines = Math.max(lines, lineCount(value, col.width))
      const ref = `${columnName(i)}${rowNumber}`
      if (col.key === 'result') return text(ref, value, RESULT_STYLE[value] ?? S.UNTESTED)
      if (col.key === 'topic') return text(ref, value, band ? S.TOPIC_ALT : S.TOPIC)
      return text(ref, value, band ? S.BODY_ALT : S.BODY)
    })
    const height = Math.min(409, Math.max(16, lines * 12.6))
    body.push(`<row r="${rowNumber}" ht="${height.toFixed(1)}" customHeight="1">${cells.join('')}</row>`)
  })

  const widths = columns
    .map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`)
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${firstData}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="14"/><cols>${widths}</cols><sheetData>${body.join('')}</sheetData><autoFilter ref="A${HEADER_ROW}:${lastCol}${lastData}"/><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;LVMS Test Plan&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter></worksheet>`
}

function summarySheet(rows, meta, lastDataRow, headerRow) {
  const resultRange = `'${SHEET_NAME}'!$E$${headerRow + 1}:$E$${lastDataRow}`
  const body = []

  body.push(`<row r="1" ht="34" customHeight="1">${[0, 1, 2, 3].map((i) => text(`${columnName(i)}1`, i === 0 ? 'VMS TEST PLAN' : '', S.TITLE)).join('')}</row>`)
  body.push(`<row r="2" ht="18" customHeight="1">${[0, 1, 2, 3].map((i) => text(`${columnName(i)}2`, i === 0 ? 'SUMMARY' : '', S.SUBTITLE)).join('')}</row>`)
  body.push(`<row r="3" ht="6" customHeight="1"/>`)

  const info = [
    ['Test Plan Name:', meta.planName],
    ['Generated On:', meta.generatedOn],
    ['Generated By:', meta.generatedBy],
  ]
  info.forEach(([label, value], i) =>
    body.push(`<row r="${4 + i}">${text(`A${4 + i}`, label, S.LABEL)}${text(`B${4 + i}`, value, S.VALUE)}</row>`))

  body.push(`<row r="7" ht="6" customHeight="1"/>`)
  body.push(`<row r="8" ht="18" customHeight="1">${text('A8', 'Status', S.SUM_TH)}${text('B8', 'Test Cases', S.SUM_TH)}</row>`)

  SUMMARY_STATUSES.forEach((status, i) => {
    const row = 9 + i
    body.push(
      `<row r="${row}" ht="17" customHeight="1">${text(`A${row}`, STATUS_LABEL[status], RESULT_STYLE[status])}${formula(`B${row}`, `COUNTIF(${resultRange},"${status}")`, S.SUM_VAL)}</row>`)
  })

  body.push(`<row r="14" ht="18" customHeight="1">${text('A14', 'Total Test Cases', S.SUM_TH)}${formula('B14', `COUNTA(${resultRange})`, S.SUM_VAL)}</row>`)
  body.push(`<row r="15" ht="18" customHeight="1">${text('A15', 'Pass Percentage', S.SUM_TH)}${formula('B15', `IF(B14=0,0,B9/B14)`, S.PERCENT)}</row>`)

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="14"/><cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="3" customWidth="1"/></cols><sheetData>${body.join('')}</sheetData><mergeCells count="2"><mergeCell ref="A1:D1"/><mergeCell ref="A2:D2"/></mergeCells><drawing r:id="rIdDr"/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`
}

// A clustered column chart over the Summary sheet's own counts, so the bars
// move with the data rather than being a picture of it.
const CHART_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1200" b="1"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:rPr><a:t>Test Result Distribution</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Summary!$B$8</c:f></c:strRef></c:tx>${SUMMARY_STATUSES.map((status, i) => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${STATUS_COLOR[status]}"/></a:solidFill></c:spPr></c:dPt>`).join('')}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls><c:cat><c:strRef><c:f>Summary!$A$9:$A$13</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>Summary!$B$9:$B$13</c:f></c:numRef></c:val></c:ser><c:gapWidth val="60"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart><c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="222222222"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:crossAx val="111111111"/></c:valAx></c:plotArea><c:legend><c:legendPos val="r"/><c:overlay val="0"/><c:delete val="1"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`

const DRAWING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>7</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>11</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>24</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Result Distribution"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdChart"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`

export function buildTestPlanWorkbook(columns, rows, meta) {
  const headerRow = 15
  const lastDataRow = headerRow + rows.length

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
      // Print_Titles repeats the table header on every printed page.
      path: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(SHEET_NAME)}" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'${SHEET_NAME}'!$${headerRow}:$${headerRow}</definedName></definedNames></workbook>`,
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { path: 'xl/styles.xml', content: STYLES },
    { path: 'xl/worksheets/sheet1.xml', content: planSheet(columns, rows, meta) },
    { path: 'xl/worksheets/sheet2.xml', content: summarySheet(rows, meta, lastDataRow, headerRow) },
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
