import { useEffect, useRef, useState } from 'react'
import { Upload, FileSpreadsheet, AlertTriangle, Download, Copy } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Modal from './ui/Modal'
import StatusBadge from './ui/StatusBadge'
import { useToast } from '../components/ui/Toast'
import { readSpreadsheet } from '../lib/spreadsheetReader'
import { buildImport, downloadImportTemplate, topicsOf, toPayload } from '../lib/testCaseImport'
import { VMS_RESULT } from '../lib/statusConfig'

// Upload → check → preview → import. Nothing is written until the last step,
// and the database applies the same rules again when it is.
const PREVIEW_ROWS = 50
const MAX_ERRORS = 15

export default function ImportTestCasesModal({ open, onClose, planId, planName, existingRows = [], onImported }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [duplicateChoice, setDuplicateChoice] = useState('skip')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (open) {
      setFile(null); setParsed(null); setReading(false); setImporting(false)
      setDuplicateChoice('skip'); setDragging(false)
    }
  }, [open])

  const take = async (chosen) => {
    if (!chosen) return
    setFile(chosen)
    setParsed(null)
    setReading(true)
    try {
      const grid = await readSpreadsheet(chosen)
      setParsed(buildImport(grid, existingRows))
    } catch (err) {
      setParsed({ rows: [], errors: [], sampleRows: 0, fatal: err.message || "That file couldn't be read." })
    }
    setReading(false)
  }

  const duplicates = parsed?.rows.filter((r) => r.duplicate) || []
  const toImport = (parsed?.rows || []).filter((r) => duplicateChoice === 'all' || !r.duplicate)
  const blocked = Boolean(parsed?.fatal) || (parsed?.errors.length || 0) > 0

  const runImport = async () => {
    if (!toImport.length || importing) return
    setImporting(true)
    const { data, error } = await supabase.rpc('import_test_cases', {
      p_plan_id: planId,
      p_rows: toPayload(toImport),
      p_skip_duplicates: duplicateChoice === 'skip',
    })
    setImporting(false)
    if (error) { toast.error(error.message); return }
    const n = data?.imported || 0
    const skipped = data?.skipped || 0
    toast.success(`${n} test case${n === 1 ? '' : 's'} imported successfully into ${planName}${skipped ? ` · ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped` : ''}`)
    onImported()
  }

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={importing}
        className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-300 border border-gray-600 hover:bg-gray-700/50 disabled:opacity-40"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={runImport}
        disabled={importing || blocked || !toImport.length}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-blue-500 hover:bg-blue-400 disabled:opacity-40"
      >
        <Upload size={13} />
        {importing ? 'Importing…' : `Import ${toImport.length} Test Case${toImport.length === 1 ? '' : 's'}`}
      </button>
    </>
  )

  return (
    <Modal open={open} onClose={importing ? () => {} : onClose} title="Import Test Cases" size="xl" footer={parsed && !parsed.fatal ? footer : undefined}>
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-gray-400">
            Into test plan <span className="text-white font-semibold">{planName}</span>
          </p>
          <button
            type="button"
            onClick={downloadImportTemplate}
            className="flex items-center gap-1.5 text-[12px] text-blue-500 hover:underline"
          >
            <Download size={13} /> Download template
          </button>
        </div>

        {/* file picker */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files?.[0]) }}
          className={`flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 cursor-pointer ${
            dragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'
          }`}
        >
          <FileSpreadsheet size={18} className="text-blue-500 flex-shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-white font-medium truncate">{file ? file.name : 'Choose an Excel (.xlsx) or CSV file'}</span>
            <span className="block text-[11px] text-gray-500">
              Columns: Topic · Scenario · Test Steps · Expected Result · RESULT — drag a file here or click to browse
            </span>
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => take(e.target.files?.[0])}
            className="hidden"
          />
        </label>

        {reading && <p className="text-[12px] text-gray-500">Reading {file?.name}…</p>}

        {parsed?.fatal && (
          <p className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-500">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {parsed.fatal}
          </p>
        )}

        {parsed && !parsed.fatal && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              <span className="text-white font-semibold">{parsed.rows.length} test case{parsed.rows.length === 1 ? '' : 's'} detected</span>
              <span className="text-gray-500">{topicsOf(parsed.rows).length} topic{topicsOf(parsed.rows).length === 1 ? '' : 's'}</span>
              {parsed.sampleRows > 0 && <span className="text-gray-500">{parsed.sampleRows} sample row{parsed.sampleRows === 1 ? '' : 's'} from the template ignored</span>}
              {parsed.errors.length > 0 && <span className="text-red-500 font-semibold">{parsed.errors.length} problem{parsed.errors.length === 1 ? '' : 's'}</span>}
            </div>

            {parsed.errors.length > 0 && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-red-500">
                  <AlertTriangle size={13} /> Fix these rows in the file, then upload it again
                </p>
                <ul className="mt-1.5 space-y-0.5 text-[12px] text-gray-300 max-h-40 overflow-y-auto">
                  {parsed.errors.slice(0, MAX_ERRORS).map((e, i) => <li key={i}>{e.message}</li>)}
                  {parsed.errors.length > MAX_ERRORS && (
                    <li className="text-gray-500">…and {parsed.errors.length - MAX_ERRORS} more</li>
                  )}
                </ul>
                <p className="text-[11px] text-gray-500 mt-1.5">Nothing has been imported. Cancel, correct the file and try again.</p>
              </div>
            )}

            {duplicates.length > 0 && parsed.errors.length === 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-500">
                  <Copy size={13} /> {duplicates.length} duplicate test case{duplicates.length === 1 ? '' : 's'} detected
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Same Topic and Scenario as a test case already in {planName}
                  {duplicates.some((d) => d.duplicateInFile) ? ', or repeated inside the file' : ''}.
                </p>
                <div className="flex flex-wrap gap-3 mt-2">
                  {[['skip', `Skip duplicates — import ${parsed.rows.length - duplicates.length}`], ['all', `Import all ${parsed.rows.length}`]].map(([value, label]) => (
                    <label key={value} className="flex items-center gap-1.5 text-[12px] text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="duplicates"
                        checked={duplicateChoice === value}
                        onChange={() => setDuplicateChoice(value)}
                        className="accent-blue-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {parsed.rows.length > 0 && (
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[45vh]">
                  <table className="w-full border-collapse text-[12px] min-w-[860px]">
                    <thead className="sticky top-0">
                      <tr className="bg-gray-800 text-left">
                        {['Row', 'Topic', 'Scenario', 'Test Steps', 'Expected Result', 'RESULT'].map((h) => (
                          <th key={h} className="px-2.5 py-2 text-[11px] font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-700">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, PREVIEW_ROWS).map((r) => (
                        <tr key={r.rowNumber} className={`align-top border-b border-gray-800/70 ${r.duplicate ? 'bg-amber-500/5' : ''}`}>
                          <td className="px-2.5 py-1.5 text-gray-500 tabular-nums">{r.rowNumber}</td>
                          <td className="px-2.5 py-1.5 text-gray-400">{r.topic || '—'}</td>
                          <td className="px-2.5 py-1.5 text-white">
                            {r.scenario}
                            {r.duplicate && <span className="ml-1.5 text-[10px] text-amber-500">duplicate</span>}
                          </td>
                          <td className="px-2.5 py-1.5 text-gray-400 whitespace-pre-line max-w-[260px] truncate">{r.test_steps}</td>
                          <td className="px-2.5 py-1.5 text-gray-400 whitespace-pre-line max-w-[220px] truncate">{r.expected_result}</td>
                          <td className="px-2.5 py-1.5"><StatusBadge domain={VMS_RESULT} value={r.result} size="sm" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.rows.length > PREVIEW_ROWS && (
                  <p className="px-2.5 py-1.5 text-[11px] text-gray-500 border-t border-gray-800">
                    Showing the first {PREVIEW_ROWS} of {parsed.rows.length} test cases — all of them are imported.
                  </p>
                )}
              </div>
            )}

            {parsed.rows.length === 0 && parsed.errors.length === 0 && (
              <p className="text-[12px] text-gray-500">No test cases found in that file. Check that the first row names the columns.</p>
            )}

            <p className="text-[11px] text-gray-500">
              Line breaks in Test Steps and Expected Result are kept as they are. Imported test cases behave like any other:
              editable, assignable, executable, and counted in reports and exports.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
