import { useState, useEffect } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAllRows'
import Modal from './ui/Modal'
import FormField, { inputClass } from './ui/FormField'
import PrimaryButton from './ui/Button'
import { useToast } from './ui/Toast'
import { downloadXlsx, downloadCsv } from '../lib/xlsx'

// Columns are the export contract — the sheet the user gets back out.
const COLUMNS = [
  { key: 'human_id', label: 'Test Case ID', width: 14 },
  { key: 'section', label: 'Section', width: 24 },
  { key: 'subsection', label: 'Subsection', width: 24 },
  { key: 'title', label: 'Test Case Title', width: 38 },
  { key: 'objective', label: 'Description', width: 38 },
  { key: 'preconditions', label: 'Preconditions', width: 30 },
  { key: 'steps', label: 'Test Steps', width: 46 },
  { key: 'expected', label: 'Expected Result', width: 40 },
  { key: 'priority', label: 'Priority', width: 10 },
  { key: 'test_type', label: 'Type', width: 12 },
  { key: 'tags', label: 'Tags', width: 18 },
]

export default function ExportTestPlanModal({ open, onClose, projectId, projectName, suites }) {
  const toast = useToast()
  const [filename, setFilename] = useState('')
  const [format, setFormat] = useState('xlsx')
  const [suiteId, setSuiteId] = useState('all')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Seeded from the project, never from a version — the user owns this field.
    if (open) setFilename(`${(projectName || 'Test').replace(/\s+/g, '_')}_Test_Plan`)
  }, [open, projectName])

  const buildRows = async () => {
    const [{ data: sectionRows }, { data: caseRows }, { data: stepRows }] = await Promise.all([
      fetchAllRows(() => supabase.from('sections').select('id, name, parent_section_id, suite_id, sort_order').eq('project_id', projectId).order('sort_order').order('id')),
      fetchAllRows(() => supabase.from('test_cases').select('id, human_id, title, objective, preconditions, priority, test_type, tags, section_id').eq('project_id', projectId).order('human_id').order('id')),
      fetchAllRows(() => supabase.from('test_case_steps').select('test_case_id, step_number, action, expected_result').order('test_case_id').order('step_number')),
    ])

    const sectionById = new Map((sectionRows || []).map((s) => [s.id, s]))
    const stepsByCase = new Map()
    for (const step of stepRows || []) {
      if (!stepsByCase.has(step.test_case_id)) stepsByCase.set(step.test_case_id, [])
      stepsByCase.get(step.test_case_id).push(step)
    }

    const wanted = (section) => suiteId === 'all' || section?.suite_id === suiteId
    const numbered = (list, field) =>
      list.length === 1 ? list[0][field] || '' : list.map((s, i) => `${i + 1}. ${s[field] || ''}`).join('\n')

    const rows = []
    for (const c of caseRows || []) {
      const section = sectionById.get(c.section_id)
      if (!section || !wanted(section)) continue
      const parent = section.parent_section_id ? sectionById.get(section.parent_section_id) : null
      const steps = (stepsByCase.get(c.id) || []).sort((a, b) => a.step_number - b.step_number)

      rows.push({
        human_id: c.human_id || '',
        // A child section is the subsection; its parent is the section.
        section: (parent ? parent.name : section.name).replace(/\s+/g, ' ').trim(),
        subsection: parent ? section.name.replace(/\s+/g, ' ').trim() : '',
        title: c.title || '',
        objective: c.objective || '',
        preconditions: c.preconditions || '',
        steps: numbered(steps, 'action'),
        expected: numbered(steps.filter((s) => s.expected_result), 'expected_result'),
        priority: c.priority || '',
        test_type: c.test_type || '',
        tags: (c.tags || []).join(', '),
      })
    }
    return rows
  }

  const handleExport = async (e) => {
    e.preventDefault()
    const name = filename.trim()
    if (!name) { toast.error('Enter a file name'); return }
    setBusy(true)
    try {
      const rows = await buildRows()
      if (!rows.length) { toast.error('Nothing to export for that selection'); setBusy(false); return }
      if (format === 'csv') downloadCsv(name, COLUMNS, rows)
      else downloadXlsx(name, [{ name: 'Test Cases', columns: COLUMNS, rows }])
      toast.success(`Exported ${rows.length} test case${rows.length === 1 ? '' : 's'}`)
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
        <FormField label="Test cases to export">
          <select value={suiteId} onChange={(e) => setSuiteId(e.target.value)} className={inputClass}>
            <option value="all">All sections</option>
            {(suites || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FormField>

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
