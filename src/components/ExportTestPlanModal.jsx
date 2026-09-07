import { useState, useEffect } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAllRows'
import Modal from './ui/Modal'
import FormField, { inputClass } from './ui/FormField'
import PrimaryButton from './ui/Button'
import { useToast } from './ui/Toast'
import { downloadCsv } from '../lib/xlsx'
import { downloadTestPlanXlsx } from '../lib/testPlanExport'
import { VMS_RESULT } from '../lib/statusConfig'

// The export contract: the same five columns as the source sheet, in the same
// order, and nothing else. Failure Comment is opt-in only.
const COLUMNS = [
  { key: 'topic', label: 'Topic', width: 22 },
  { key: 'scenario', label: 'Scenario', width: 32 },
  { key: 'test_steps', label: 'Test Steps', width: 58 },
  { key: 'expected_result', label: 'Expected Result', width: 46 },
  { key: 'result', label: 'RESULT', width: 12 },
]

const FAILURE_COLUMN = { key: 'failure_comment', label: 'Failure Comment', width: 42 }

export default function ExportTestPlanModal({ open, onClose, planId, planName, plans, generatedBy }) {
  const toast = useToast()
  const [filename, setFilename] = useState('')
  const [format, setFormat] = useState('xlsx')
  const [scope, setScope] = useState('current')
  const [includeFailureComments, setIncludeFailureComments] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Seeded from the plan name, never from a version — the user owns this field.
    if (open) setFilename(`${(planName || 'VMS').replace(/[^\w]+/g, '_')}_Test_Plan`)
  }, [open, planName])

  const targetPlanId = scope === 'current' ? planId : scope

  const buildRows = async () => {
    const { data } = await fetchAllRows(() =>
      supabase
        .from('vms_test_plan_rows')
        .select('topic, scenario, test_steps, expected_result, result, failure_comment, sort_order')
        .eq('plan_id', targetPlanId)
        .order('sort_order'))

    return (data || []).map((r) => ({
      topic: r.topic || '',
      scenario: r.scenario || '',
      test_steps: r.test_steps || '',
      expected_result: r.expected_result || '',
      result: VMS_RESULT[r.result]?.label || 'Not Tested',
      failure_comment: r.result === 'fail' ? (r.failure_comment || '') : '',
    }))
  }

  const handleExport = async (e) => {
    e.preventDefault()
    const name = filename.trim()
    if (!name) { toast.error('Enter a file name'); return }
    setBusy(true)
    try {
      const rows = await buildRows()
      if (!rows.length) { toast.error('Nothing to export for that selection'); setBusy(false); return }
      const columns = includeFailureComments ? [...COLUMNS, FAILURE_COLUMN] : COLUMNS
      if (format === 'csv') downloadCsv(name, columns, rows)
      else downloadTestPlanXlsx(name, columns, rows, {
        planName: plans?.find((p) => p.id === targetPlanId)?.name || planName || '',
        generatedOn: new Date().toLocaleString(),
        generatedBy: generatedBy || '',
      })
      toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Export failed')
    }
    setBusy(false)
  }

  const extension = format === 'csv' ? '.csv' : '.xlsx'

  return (
    <Modal open={open} onClose={onClose} title="Export Test Plan" size="lg">
      <form onSubmit={handleExport} className="space-y-3.5">
        {plans?.length > 1 && (
          <FormField label="Test plan">
            <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputClass}>
              <option value="current">{planName}</option>
              {plans.filter((p) => p.id !== planId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>
        )}

        <FormField label="Format">
          <div className="flex gap-2">
            {[
              { value: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
              { value: 'csv', label: 'CSV', icon: FileText },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormat(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border ${
                  format === value
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                    : 'border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </FormField>

        <label className="flex items-start gap-2 px-3 py-2.5 rounded-md border border-gray-700 cursor-pointer hover:border-gray-600">
          <input
            type="checkbox"
            checked={includeFailureComments}
            onChange={(e) => setIncludeFailureComments(e.target.checked)}
            className="mt-0.5 accent-blue-500"
          />
          <span>
            <span className="block text-[12px] text-gray-200 font-medium">Include Failure Comments</span>
            <span className="block text-[11px] text-gray-500">
              Adds a sixth column with the reason for each failed row. Off by default, so the standard export keeps its five columns.
            </span>
          </span>
        </label>

        <FormField label="File name" hint={`Saved as ${(filename.trim() || 'filename').replace(/\.(xlsx|csv)$/i, '')}${extension}`}>
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            required
            autoFocus
            placeholder="VMS_Test_Plan_Final"
            className={inputClass}
          />
        </FormField>

        <PrimaryButton type="submit" disabled={busy}>
          <Download size={14} /> {busy ? 'Exporting…' : `Export ${format === 'csv' ? 'CSV' : 'Excel'}`}
        </PrimaryButton>
      </form>
    </Modal>
  )
}
