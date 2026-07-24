import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, ChevronRight, ChevronDown, FolderTree, Search, X, ArrowLeft,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AppSidebar from '../components/AppSidebar'
import TopNav from '../components/TopNav'
import NewTestCaseModal from '../components/NewTestCaseModal'
import TestCaseStepsEditor from '../components/TestCaseStepsEditor'
import CommentComposer from '../components/CommentComposer'

const PRIORITY_CHIP = {
  critical: 'bg-red-500/15 text-red-400',
  high: 'bg-orange-500/15 text-orange-400',
  medium: 'bg-blue-500/15 text-blue-400',
  low: 'bg-gray-500/15 text-gray-400',
}

const AUTOMATION_CHIP = {
  automated: 'bg-green-500/15 text-green-400',
  in_progress: 'bg-blue-500/15 text-blue-400',
  planned: 'bg-orange-500/15 text-orange-400',
  not_automated: 'bg-gray-500/15 text-gray-400',
  not_applicable: 'bg-gray-500/15 text-gray-500',
}

function humanize(value) {
  if (!value) return ''
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function timeAgo(dateStr) {
  const seconds = Math.floor((new Date() - new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function buildTree(sections, suiteId) {
  const bySuite = sections.filter((s) => s.suite_id === suiteId)
  const byParent = (parentId) =>
    bySuite
      .filter((s) => s.parent_section_id === parentId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((s) => ({ ...s, children: byParent(s.id) }))
  return byParent(null)
}

function flattenWithPath(nodes, suiteName, depth = 0, path = []) {
  return nodes.flatMap((n) => {
    const nodePath = [...path, n.name]
    const entry = { ...n, depth, pathLabel: `${suiteName} / ${nodePath.join(' / ')}` }
    return [entry, ...flattenWithPath(n.children, suiteName, depth + 1, nodePath)]
  })
}

function SectionNode({ node, depth, selectedId, onSelect, expanded, onToggle, onAddSubsection, onDelete, canManage }) {
  const isOpen = expanded.has(node.id)
  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg pr-1.5 ${
          selectedId === node.id ? 'bg-blue-500/10 text-blue-400' : 'text-gray-300 hover:bg-gray-800'
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <button
          onClick={() => onToggle(node.id)}
          className={`p-0.5 text-gray-500 ${node.children.length === 0 ? 'invisible' : ''}`}
        >
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button onClick={() => onSelect(node.id)} className="flex-1 text-left py-1.5 text-[13px] truncate">
          {node.name}
        </button>
        {canManage && (
          <>
            <button
              onClick={() => onAddSubsection(node.suite_id, node.id)}
              title="Add subsection"
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white p-0.5"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => onDelete(node.id)}
              title="Delete section"
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-0.5"
            >
              <X size={12} />
            </button>
          </>
        )}
      </div>
      {isOpen && node.children.map((child) => (
        <SectionNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          onToggle={onToggle}
          onAddSubsection={onAddSubsection}
          onDelete={onDelete}
          canManage={canManage}
        />
      ))}
    </div>
  )
}

export default function TestCasesPage() {
  const { id: projectId, caseId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [project, setProject] = useState(null)
  const [suites, setSuites] = useState([])
  const [sections, setSections] = useState([])
  const [cases, setCases] = useState([])
  const [members, setMembers] = useState([])
  const [myRole, setMyRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const [expanded, setExpanded] = useState(new Set())
  const [selectedSectionId, setSelectedSectionId] = useState(null)
  const [search, setSearch] = useState('')
  const [showNewCase, setShowNewCase] = useState(false)
  const [newSectionFor, setNewSectionFor] = useState(null) // { suiteId, parentSectionId } | null
  const [newSectionName, setNewSectionName] = useState('')
  const [newSuiteName, setNewSuiteName] = useState('')
  const [showNewSuite, setShowNewSuite] = useState(false)

  const fetchAll = async () => {
    const [{ data: proj }, { data: suiteRows }, { data: sectionRows }, { data: caseRows }, { data: memberRows }, { data: roleRow }] =
      await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('test_suites').select('*').eq('project_id', projectId).order('created_at'),
        supabase.from('sections').select('*').eq('project_id', projectId).order('sort_order'),
        supabase
          .from('test_cases')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase.from('project_members').select('user_id, profiles(id, name)').eq('project_id', projectId),
        user
          ? supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
    setProject(proj)
    setSuites(suiteRows || [])
    setSections(sectionRows || [])
    setCases(caseRows || [])
    setMembers((memberRows || []).map((m) => m.profiles).filter(Boolean))
    setMyRole(roleRow?.role || null)
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [projectId, user])

  const canAuthor = ['admin', 'lead', 'tester'].includes(myRole)
  const canManageStructure = ['admin', 'lead'].includes(myRole)

  const sectionsWithPath = useMemo(() => {
    return suites.flatMap((suite) => flattenWithPath(buildTree(sections, suite.id), suite.name))
  }, [suites, sections])

  const toggleExpand = (sectionId) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId)
      return next
    })
  }

  const handleAddSuite = async (e) => {
    e.preventDefault()
    if (!newSuiteName.trim()) return
    const { error } = await supabase.from('test_suites').insert({ project_id: projectId, name: newSuiteName.trim() })
    if (error) { alert(error.message); return }
    setNewSuiteName('')
    setShowNewSuite(false)
    fetchAll()
  }

  const handleAddSection = async (e) => {
    e.preventDefault()
    if (!newSectionName.trim() || !newSectionFor) return
    const { error } = await supabase.from('sections').insert({
      suite_id: newSectionFor.suiteId,
      parent_section_id: newSectionFor.parentSectionId,
      name: newSectionName.trim(),
    })
    if (error) { alert(error.message); return }
    setNewSectionName('')
    setNewSectionFor(null)
    fetchAll()
  }

  const handleDeleteSection = async (sectionId) => {
    if (!confirm('Delete this section and everything inside it (subsections and test cases)? This cannot be undone.')) return
    await supabase.from('sections').delete().eq('id', sectionId)
    if (selectedSectionId === sectionId) setSelectedSectionId(null)
    fetchAll()
  }

  const handleDeleteSuite = async (suiteId) => {
    if (!confirm('Delete this entire test suite and everything inside it? This cannot be undone.')) return
    await supabase.from('test_suites').delete().eq('id', suiteId)
    fetchAll()
  }

  const filteredCases = cases.filter((c) => {
    if (selectedSectionId && c.section_id !== selectedSectionId) return false
    if (search && !`${c.human_id} ${c.title}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <AppSidebar />
        <div className="flex-1 min-w-0 p-6 animate-pulse">
          <div className="h-8 w-64 bg-gray-800 rounded-lg mb-4" />
          <div className="flex gap-4">
            <div className="w-64 h-96 bg-gray-800 rounded-xl" />
            <div className="flex-1 h-96 bg-gray-800/60 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (caseId) {
    return (
      <TestCaseDetail
        projectId={projectId}
        caseId={caseId}
        project={project}
        sectionsWithPath={sectionsWithPath}
        members={members}
        canAuthor={canAuthor}
        userId={user?.id}
        onRefreshList={fetchAll}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AppSidebar />
      <div className="flex-1 min-w-0">
        <TopNav
          breadcrumb={[{ label: 'Projects', to: '/dashboard' }, { label: project?.name, to: `/project/${projectId}/overview` }, { label: 'Test Cases' }]}
          onQuickCreate={canAuthor ? () => setShowNewCase(true) : undefined}
          quickCreateLabel="New Test Case"
        />

        <div className="flex" style={{ minHeight: 'calc(100vh - 53px)' }}>
          {/* Tree panel */}
          <div className="w-72 flex-shrink-0 border-r border-gray-800 p-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wider">Repository</p>
              {canManageStructure && (
                <button
                  onClick={() => setShowNewSuite(!showNewSuite)}
                  title="New suite"
                  className="text-gray-500 hover:text-white p-1 rounded hover:bg-gray-800"
                >
                  <Plus size={13} />
                </button>
              )}
            </div>

            {showNewSuite && (
              <form onSubmit={handleAddSuite} className="mb-2 flex gap-1.5">
                <input
                  value={newSuiteName}
                  onChange={(e) => setNewSuiteName(e.target.value)}
                  autoFocus
                  placeholder="Suite name"
                  className="flex-1 px-2 py-1.5 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none text-xs"
                />
                <button type="submit" className="text-xs bg-blue-500 hover:bg-blue-400 px-2 rounded-lg font-semibold">Add</button>
              </form>
            )}

            <button
              onClick={() => setSelectedSectionId(null)}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-[13px] mb-1 flex items-center gap-1.5 ${
                selectedSectionId === null ? 'bg-blue-500/10 text-blue-400' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FolderTree size={13} /> All Test Cases
            </button>

            {suites.map((suite) => (
              <div key={suite.id} className="mb-2 group/suite">
                <div className="flex items-center gap-1 px-1 py-1">
                  <span className="text-[12px] font-semibold text-gray-300 flex-1 truncate">{suite.name}</span>
                  {canManageStructure && (
                    <>
                      <button
                        onClick={() => setNewSectionFor({ suiteId: suite.id, parentSectionId: null })}
                        title="Add section"
                        className="opacity-0 group-hover/suite:opacity-100 text-gray-500 hover:text-white p-0.5"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteSuite(suite.id)}
                        title="Delete suite"
                        className="opacity-0 group-hover/suite:opacity-100 text-gray-500 hover:text-red-400 p-0.5"
                      >
                        <X size={12} />
                      </button>
                    </>
                  )}
                </div>

                {newSectionFor?.suiteId === suite.id && newSectionFor.parentSectionId === null && (
                  <form onSubmit={handleAddSection} className="flex gap-1.5 mb-1 px-1">
                    <input
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      autoFocus
                      placeholder="Section name"
                      className="flex-1 px-2 py-1 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none text-xs"
                    />
                    <button type="submit" className="text-xs bg-blue-500 hover:bg-blue-400 px-2 rounded-lg font-semibold">Add</button>
                  </form>
                )}

                {buildTree(sections, suite.id).map((node) => (
                  <div key={node.id}>
                    <SectionNode
                      node={node}
                      depth={0}
                      selectedId={selectedSectionId}
                      onSelect={setSelectedSectionId}
                      expanded={expanded}
                      onToggle={toggleExpand}
                      onAddSubsection={(suiteId, parentSectionId) => setNewSectionFor({ suiteId, parentSectionId })}
                      onDelete={handleDeleteSection}
                      canManage={canManageStructure}
                    />
                    {newSectionFor?.parentSectionId === node.id && (
                      <form onSubmit={handleAddSection} className="flex gap-1.5 my-1 pl-6">
                        <input
                          value={newSectionName}
                          onChange={(e) => setNewSectionName(e.target.value)}
                          autoFocus
                          placeholder="Subsection name"
                          className="flex-1 px-2 py-1 rounded-lg bg-gray-700/80 border border-gray-600/50 outline-none text-xs"
                        />
                        <button type="submit" className="text-xs bg-blue-500 hover:bg-blue-400 px-2 rounded-lg font-semibold">Add</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {suites.length === 0 && (
              <p className="text-xs text-gray-500 px-1 py-2">
                No test suites yet. {canManageStructure ? 'Create one above to get started.' : 'Ask a project admin to create one.'}
              </p>
            )}
          </div>

          {/* Case list panel */}
          <div className="flex-1 min-w-0 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search test cases"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-gray-800/80 border border-gray-600/40 outline-none text-sm"
                />
              </div>
              <span className="text-xs text-gray-500">{filteredCases.length} case{filteredCases.length === 1 ? '' : 's'}</span>
            </div>

            <div className="space-y-1.5">
              {filteredCases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/project/${projectId}/cases/${c.id}`)}
                  className="w-full text-left bg-gray-800/80 border border-gray-600/30 hover:border-gray-500/50 rounded-lg px-4 py-2.5 flex items-center gap-3 card-lift"
                >
                  <span className="text-[11px] font-mono text-blue-400 w-10 flex-shrink-0">{c.human_id}</span>
                  <span className="text-sm flex-1 truncate">{c.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-700 text-gray-300 capitalize flex-shrink-0">
                    {humanize(c.test_type)}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize flex-shrink-0 ${PRIORITY_CHIP[c.priority]}`}>
                    {c.priority}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md capitalize flex-shrink-0 ${AUTOMATION_CHIP[c.automation_status]}`}>
                    {humanize(c.automation_status)}
                  </span>
                </button>
              ))}
              {filteredCases.length === 0 && (
                <div className="text-center py-14">
                  <p className="text-sm text-gray-500">
                    {cases.length === 0 ? 'No test cases yet in this project.' : 'No test cases match your search.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showNewCase && (
        <NewTestCaseModal
          sections={sectionsWithPath}
          defaultSectionId={selectedSectionId}
          members={members}
          onClose={() => setShowNewCase(false)}
          onCreated={fetchAll}
        />
      )}
    </div>
  )
}

function TestCaseDetail({ projectId, caseId, project, sectionsWithPath, members, canAuthor, userId, onRefreshList }) {
  const navigate = useNavigate()
  const [testCase, setTestCase] = useState(null)
  const [history, setHistory] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('details')

  const fetchCase = async () => {
    const [{ data: tc }, { data: hist }, { data: comm }] = await Promise.all([
      supabase.from('test_cases').select('*').eq('id', caseId).single(),
      supabase.from('test_case_versions').select('*, profiles(name)').eq('test_case_id', caseId).order('changed_at', { ascending: false }),
      supabase.from('test_case_comments').select('*, profiles(name)').eq('test_case_id', caseId).order('created_at', { ascending: true }),
    ])
    setTestCase(tc)
    setHistory(hist || [])
    setComments(comm || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchCase()
  }, [caseId])

  const updateField = async (field, value) => {
    setTestCase((prev) => ({ ...prev, [field]: value }))
    await supabase.from('test_cases').update({ [field]: value, updated_by: userId }).eq('id', caseId)
    fetchCase()
  }

  const handleComment = async (body) => {
    await supabase.from('test_case_comments').insert({ test_case_id: caseId, user_id: userId, body })
    fetchCase()
  }

  if (loading || !testCase) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex">
        <AppSidebar />
        <div className="flex-1 p-6 animate-pulse">
          <div className="h-8 w-96 bg-gray-800 rounded-lg" />
        </div>
      </div>
    )
  }

  const section = sectionsWithPath.find((s) => s.id === testCase.section_id)

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AppSidebar />
      <div className="flex-1 min-w-0">
        <TopNav
          breadcrumb={[
            { label: 'Projects', to: '/dashboard' },
            { label: project?.name, to: `/project/${projectId}/overview` },
            { label: 'Test Cases', to: `/project/${projectId}/cases` },
            { label: testCase.human_id },
          ]}
        />

        <div className="p-6 max-w-5xl mx-auto">
          <button
            onClick={() => navigate(`/project/${projectId}/cases`)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4"
          >
            <ArrowLeft size={14} /> All Test Cases
          </button>

          <div className="flex items-start gap-3 mb-1">
            <span className="text-sm font-mono text-blue-400 mt-1">{testCase.human_id}</span>
            <input
              value={testCase.title}
              onChange={(e) => setTestCase((prev) => ({ ...prev, title: e.target.value }))}
              onBlur={(e) => updateField('title', e.target.value)}
              disabled={!canAuthor}
              className="flex-1 bg-transparent text-xl font-bold outline-none border-b border-transparent focus:border-gray-600 pb-1 disabled:opacity-80"
            />
          </div>
          <p className="text-xs text-gray-500 mb-6 ml-8">{section?.pathLabel}</p>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
            <div>
              <div className="flex gap-4 border-b border-gray-800 mb-4">
                {['details', 'comments', 'history'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`text-sm pb-2.5 capitalize ${tab === t ? 'text-white border-b-2 border-blue-500' : 'text-gray-500'}`}
                  >
                    {t} {t === 'comments' && comments.length > 0 ? `(${comments.length})` : ''}
                  </button>
                ))}
              </div>

              {tab === 'details' && (
                <div className="space-y-5">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5 font-semibold uppercase tracking-wide">Preconditions</label>
                    <textarea
                      value={testCase.preconditions || ''}
                      onChange={(e) => setTestCase((prev) => ({ ...prev, preconditions: e.target.value }))}
                      onBlur={(e) => updateField('preconditions', e.target.value)}
                      disabled={!canAuthor}
                      rows={2}
                      placeholder="None"
                      className="w-full bg-gray-800/70 border border-gray-600/30 rounded-lg p-3 text-sm outline-none focus:border-blue-500/60 resize-y disabled:opacity-70"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5 font-semibold uppercase tracking-wide">Objective</label>
                    <textarea
                      value={testCase.objective || ''}
                      onChange={(e) => setTestCase((prev) => ({ ...prev, objective: e.target.value }))}
                      onBlur={(e) => updateField('objective', e.target.value)}
                      disabled={!canAuthor}
                      rows={2}
                      placeholder="What is this test verifying?"
                      className="w-full bg-gray-800/70 border border-gray-600/30 rounded-lg p-3 text-sm outline-none focus:border-blue-500/60 resize-y disabled:opacity-70"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-2 font-semibold uppercase tracking-wide">Steps</label>
                    <TestCaseStepsEditor testCaseId={caseId} canEdit={canAuthor} />
                  </div>
                </div>
              )}

              {tab === 'comments' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {comments.map((c) => (
                      <div key={c.id} className="bg-gray-800/70 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold">{c.profiles?.name || 'Someone'}</span>
                          <span className="text-xs text-gray-500">{timeAgo(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    ))}
                    {comments.length === 0 && <p className="text-sm text-gray-500">No comments yet.</p>}
                  </div>
                  {canAuthor && <CommentComposer onSubmit={handleComment} submitLabel="Comment" />}
                </div>
              )}

              {tab === 'history' && (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="flex gap-2 text-sm">
                      <span className="text-gray-500">•</span>
                      <div>
                        <span className="text-gray-300">
                          {h.field_name === 'created' ? (
                            <><span className="font-medium">{h.profiles?.name || 'Someone'}</span> created this test case</>
                          ) : (
                            <>
                              <span className="font-medium">{h.profiles?.name || 'Someone'}</span> changed{' '}
                              <span className="text-gray-400">{humanize(h.field_name)}</span> from{' '}
                              <span className="text-gray-400">{h.old_value || '—'}</span> to{' '}
                              <span className="text-gray-200">{h.new_value || '—'}</span>
                            </>
                          )}
                        </span>
                        <span className="text-gray-500 text-xs ml-2">{timeAgo(h.changed_at)}</span>
                      </div>
                    </div>
                  ))}
                  {history.length === 0 && <p className="text-sm text-gray-500">No history yet.</p>}
                </div>
              )}
            </div>

            {/* Fields sidebar */}
            <div className="space-y-4">
              <div className="bg-gray-800/70 rounded-xl p-4 space-y-3.5">
                <FieldSelect label="Type" value={testCase.test_type} canEdit={canAuthor}
                  options={['functional', 'regression', 'smoke', 'sanity', 'integration', 'system', 'ui', 'api', 'performance', 'security', 'compatibility', 'uat', 'exploratory']}
                  onChange={(v) => updateField('test_type', v)} />
                <FieldSelect label="Priority" value={testCase.priority} canEdit={canAuthor}
                  options={['critical', 'high', 'medium', 'low']}
                  onChange={(v) => updateField('priority', v)} />
                <FieldSelect label="Automation" value={testCase.automation_status} canEdit={canAuthor}
                  options={['not_automated', 'planned', 'in_progress', 'automated', 'not_applicable']}
                  onChange={(v) => updateField('automation_status', v)} />
                <div>
                  <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide mb-1">Owner</p>
                  <select
                    value={testCase.owner_id || ''}
                    onChange={(e) => updateField('owner_id', e.target.value || null)}
                    disabled={!canAuthor}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-gray-700/80 border border-gray-600/40 outline-none text-sm disabled:opacity-70"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                {testCase.tags?.length > 0 && (
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide mb-1.5">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {testCase.tags.map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-700 text-gray-300">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldSelect({ label, value, options, onChange, canEdit }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide mb-1">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!canEdit}
        className="w-full px-2.5 py-1.5 rounded-lg bg-gray-700/80 border border-gray-600/40 outline-none text-sm capitalize disabled:opacity-70"
      >
        {options.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
      </select>
    </div>
  )
}
