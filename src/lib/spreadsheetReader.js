// Reads an uploaded .xlsx or .csv file into a grid of plain strings.
//
// The app already writes .xlsx by hand (see xlsx.js); this is the other
// direction, and it stays dependency-free the same way: an .xlsx is a ZIP of
// XML parts, so this walks the ZIP directory, inflates the parts it needs with
// the browser's own DecompressionStream, and reads the cells with DOMParser.
//
// Line breaks inside a cell are kept exactly as they are — test steps depend on
// them.

const XLSX_MIME = /(sheet|excel)/i

export const isCsvFile = (file) => /\.(csv|tsv|txt)$/i.test(file?.name || '')

// ------------------------------------------------------------------ zip ---

function openZip(buffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // End of central directory: scan back from the end (comment is rarely there).
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error("That doesn't look like an Excel file. Save it as .xlsx, or upload a CSV.")

  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const entries = new Map()
  const decoder = new TextDecoder()

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const path = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    entries.set(path, { method, compressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return { view, bytes, entries }
}

async function readPart(zip, path) {
  const entry = zip.entries.get(path)
  if (!entry) return null
  const nameLength = zip.view.getUint16(entry.localOffset + 26, true)
  const extraLength = zip.view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLength + extraLength
  const data = zip.bytes.subarray(start, start + entry.compressedSize)

  if (entry.method === 0) return new TextDecoder().decode(data)
  if (entry.method !== 8) {
    throw new Error('This workbook is compressed in a way the browser can read — re-save it from Excel as .xlsx, or upload a CSV.')
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error("This browser can't open .xlsx files. Save the sheet as CSV and upload that instead.")
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

// ----------------------------------------------------------------- xlsx ---

const parseXml = (xml) => new DOMParser().parseFromString(xml, 'application/xml')

// "BC12" -> 54 (zero-based column index)
function columnIndex(ref) {
  let n = 0
  for (const ch of ref) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) break
    n = n * 26 + (code - 64)
  }
  return n - 1
}

const cellText = (node, shared) => {
  const type = node.getAttribute('t')
  if (type === 'inlineStr') {
    return [...node.getElementsByTagName('t')].map((t) => t.textContent).join('')
  }
  const v = node.getElementsByTagName('v')[0]
  if (!v) return ''
  if (type === 's') return shared[Number(v.textContent)] ?? ''
  return v.textContent ?? ''
}

async function readXlsx(buffer) {
  const zip = openZip(buffer)

  const sharedXml = await readPart(zip, 'xl/sharedStrings.xml')
  const shared = sharedXml
    ? [...parseXml(sharedXml).getElementsByTagName('si')].map((si) =>
        [...si.getElementsByTagName('t')].map((t) => t.textContent).join(''))
    : []

  // The workbook names its sheets in order; take the first one.
  let sheetPath = null
  const workbookXml = await readPart(zip, 'xl/workbook.xml')
  const relsXml = await readPart(zip, 'xl/_rels/workbook.xml.rels')
  if (workbookXml && relsXml) {
    const firstSheet = parseXml(workbookXml).getElementsByTagName('sheet')[0]
    const relId = firstSheet?.getAttribute('r:id') || firstSheet?.getAttributeNS?.('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    const rel = [...parseXml(relsXml).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === relId)
    const target = rel?.getAttribute('Target')
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  }
  if (!sheetPath || !zip.entries.has(sheetPath)) {
    sheetPath = [...zip.entries.keys()].filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort()[0]
  }
  if (!sheetPath) throw new Error('That workbook has no sheets in it.')

  const sheetXml = await readPart(zip, sheetPath)
  const grid = []
  for (const row of parseXml(sheetXml).getElementsByTagName('row')) {
    const cells = []
    for (const c of row.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') || ''
      const index = ref ? columnIndex(ref) : cells.length
      cells[index >= 0 ? index : cells.length] = cellText(c, shared)
    }
    grid.push(Array.from(cells, (value) => value ?? ''))
  }
  return grid
}

// ------------------------------------------------------------------ csv ---

export function parseDelimited(text, delimiter) {
  const clean = text.replace(/^﻿/, '')
  const sep = delimiter || (clean.split('\n')[0].includes('\t') ? '\t' : ',')
  const grid = []
  let row = []
  let value = ''
  let quoted = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { value += '"'; i++ }
        else quoted = false
      } else value += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === sep) { row.push(value); value = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(value); grid.push(row); row = []; value = ''; continue }
    value += ch
  }
  if (value !== '' || row.length) { row.push(value); grid.push(row) }
  return grid
}

// ---------------------------------------------------------------- entry ---

export async function readSpreadsheet(file) {
  if (!file) throw new Error('Choose a file to import.')
  if (file.size > 12 * 1024 * 1024) throw new Error('That file is larger than 12 MB. Split it into smaller sheets.')
  if (isCsvFile(file)) return parseDelimited(await file.text())
  if (!XLSX_MIME.test(file.type || '') && !/\.xlsx$/i.test(file.name)) {
    throw new Error('Upload an Excel (.xlsx) or CSV file.')
  }
  return readXlsx(await file.arrayBuffer())
}
