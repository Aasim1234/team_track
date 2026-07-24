import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

export default function TestCaseStepsEditor({ testCaseId, canEdit }) {
  const [steps, setSteps] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchSteps = async () => {
    const { data } = await supabase
      .from('test_case_steps')
      .select('*')
      .eq('test_case_id', testCaseId)
      .order('step_number')
    setSteps(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchSteps()
  }, [testCaseId])

  const addStep = async () => {
    const nextNumber = steps.length ? Math.max(...steps.map((s) => s.step_number)) + 1 : 1
    const { data, error } = await supabase
      .from('test_case_steps')
      .insert({ test_case_id: testCaseId, step_number: nextNumber, action: '', test_data: '', expected_result: '' })
      .select()
      .single()
    if (!error) setSteps((prev) => [...prev, data])
  }

  const updateStep = (id, field, value) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  const saveStep = async (step) => {
    await supabase
      .from('test_case_steps')
      .update({ action: step.action, test_data: step.test_data, expected_result: step.expected_result })
      .eq('id', step.id)
  }

  const deleteStep = async (id) => {
    setSteps((prev) => prev.filter((s) => s.id !== id))
    await supabase.from('test_case_steps').delete().eq('id', id)
  }

  const move = async (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= steps.length) return
    const reordered = [...steps]
    ;[reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]]
    const renumbered = reordered.map((s, i) => ({ ...s, step_number: i + 1 }))
    setSteps(renumbered)
    await Promise.all(
      renumbered.map((s) =>
        supabase.from('test_case_steps').update({ step_number: s.step_number }).eq('id', s.id)
      )
    )
  }

  if (loading) return <p className="text-sm text-gray-500">Loading steps...</p>

  return (
    <div>
      <div className="grid grid-cols-[24px_1fr_1fr_1fr_28px] gap-2 text-[11px] text-gray-500 uppercase font-semibold px-1 mb-1.5">
        <span></span>
        <span>Action</span>
        <span>Test Data</span>
        <span>Expected Result</span>
        <span></span>
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={step.id} className="grid grid-cols-[24px_1fr_1fr_1fr_28px] gap-2 items-start group">
            <div className="flex flex-col items-center pt-1.5 gap-0.5">
              <span className="text-[10px] text-gray-500 font-mono">{step.step_number}</span>
              {canEdit && (
                <div className="flex flex-col opacity-0 group-hover:opacity-100">
                  <button onClick={() => move(i, -1)} className="text-gray-500 hover:text-white">
                    <ChevronUp size={11} />
                  </button>
                  <button onClick={() => move(i, 1)} className="text-gray-500 hover:text-white">
                    <ChevronDown size={11} />
                  </button>
                </div>
              )}
            </div>
            <textarea
              value={step.action}
              onChange={(e) => updateStep(step.id, 'action', e.target.value)}
              onBlur={() => saveStep(step)}
              disabled={!canEdit}
              rows={2}
              placeholder="What should the tester do?"
              className="bg-gray-700/70 border border-gray-600/40 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500/70 resize-y disabled:opacity-60"
            />
            <textarea
              value={step.test_data || ''}
              onChange={(e) => updateStep(step.id, 'test_data', e.target.value)}
              onBlur={() => saveStep(step)}
              disabled={!canEdit}
              rows={2}
              placeholder="Optional input data"
              className="bg-gray-700/70 border border-gray-600/40 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500/70 resize-y disabled:opacity-60"
            />
            <textarea
              value={step.expected_result || ''}
              onChange={(e) => updateStep(step.id, 'expected_result', e.target.value)}
              onBlur={() => saveStep(step)}
              disabled={!canEdit}
              rows={2}
              placeholder="What should happen?"
              className="bg-gray-700/70 border border-gray-600/40 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500/70 resize-y disabled:opacity-60"
            />
            {canEdit && (
              <button
                onClick={() => deleteStep(step.id)}
                className="text-gray-500 hover:text-red-400 mt-1.5 opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      {steps.length === 0 && (
        <p className="text-xs text-gray-500 py-2">No steps yet.</p>
      )}
      {canEdit && (
        <button
          onClick={addStep}
          className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium"
        >
          <Plus size={13} /> Add step
        </button>
      )}
    </div>
  )
}
