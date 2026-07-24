import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutDashboard, Map, Target, Plus, FolderKanban, CircleDot, CornerDownLeft, ListChecks,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { recordRecentProject } from '../lib/recentProjects'

const ACTIONS = [
  { id: 'nav-dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { id: 'nav-plans', label: 'Go to Plans', icon: Map, to: '/plans' },
  { id: 'nav-goals', label: 'Go to Goals', icon: Target, to: '/goals' },
  { id: 'new-project', label: 'Create new project', icon: Plus, to: '/dashboard?new=1' },
]

export default function CommandPalette() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState([])
  const [issues, setIssues] = useState([])
  const [testCases, setTestCases] = useState([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Global shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onOpenEvent = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('tt:cmdk', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('tt:cmdk', onOpenEvent)
    }
  }, [])

  // Load projects when opened
  useEffect(() => {
    if (!open) return
    setQuery('')
    setIssues([])
    setTestCases([])
    setSelected(0)
    setTimeout(() => inputRef.current?.focus(), 30)
    supabase
      .from('projects')
      .select('id, name, key')
      .order('name')
      .then(({ data }) => setProjects(data || []))
  }, [open])

  // Debounced issue + test case search
  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setIssues([])
      setTestCases([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      const q = query.trim()
      const [{ data: issueRows }, { data: caseRows }] = await Promise.all([
        supabase.from('issues').select('id, title, project_id, status').ilike('title', `%${q}%`).limit(8),
        supabase.from('test_cases').select('id, human_id, title, project_id').ilike('title', `%${q}%`).limit(8),
      ])
      setIssues(issueRows || [])
      setTestCases(caseRows || [])
    }, 180)
    return () => clearTimeout(debounceRef.current)
  }, [query, open])

  const q = query.trim().toLowerCase()
  const filteredActions = ACTIONS.filter((a) => !q || a.label.toLowerCase().includes(q))
  const filteredProjects = projects.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.key?.toLowerCase().includes(q)
  )

  // Flat list for keyboard navigation
  const flat = [
    ...filteredActions.map((a) => ({ kind: 'action', item: a })),
    ...filteredProjects.map((p) => ({ kind: 'project', item: p })),
    ...testCases.map((c) => ({ kind: 'testcase', item: c })),
    ...issues.map((i) => ({ kind: 'issue', item: i })),
  ]

  useEffect(() => {
    if (selected >= flat.length) setSelected(Math.max(0, flat.length - 1))
  }, [flat.length, selected])

  const run = useCallback(
    (entry) => {
      if (!entry) return
      setOpen(false)
      if (entry.kind === 'action') navigate(entry.item.to)
      if (entry.kind === 'project') {
        recordRecentProject(entry.item.id)
        navigate(`/project/${entry.item.id}/overview`)
      }
      if (entry.kind === 'issue') {
        navigate(`/project/${entry.item.project_id}/issue/${entry.item.id}`)
      }
      if (entry.kind === 'testcase') {
        navigate(`/project/${entry.item.project_id}/cases/${entry.item.id}`)
      }
    },
    [navigate]
  )

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(flat[selected])
    }
  }

  if (!user || !open) return null

  let flatIndex = -1
  const renderRow = (kind, item, icon, label, sub) => {
    flatIndex++
    const idx = flatIndex
    return (
      <button
        key={`${kind}-${item.id}`}
        onClick={() => run({ kind, item })}
        onMouseEnter={() => setSelected(idx)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left ${
          selected === idx ? 'bg-blue-500/15 text-white' : 'text-gray-300'
        }`}
      >
        {icon}
        <span className="text-[13px] flex-1 truncate">{label}</span>
        {sub && <span className="text-[11px] text-gray-500 flex-shrink-0">{sub}</span>}
        {selected === idx && <CornerDownLeft size={12} className="text-gray-500 flex-shrink-0" />}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[16vh] px-4 animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl glass rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-600/40">
          <Search size={16} className="text-gray-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search projects, issues, or type a command..."
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-gray-500"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600/60 text-gray-400">
            Esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {filteredActions.length > 0 && (
            <>
              <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Actions
              </p>
              {filteredActions.map((a) =>
                renderRow('action', a, <a.icon size={15} className="text-gray-500 flex-shrink-0" />, a.label)
              )}
            </>
          )}

          {filteredProjects.length > 0 && (
            <>
              <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Projects
              </p>
              {filteredProjects.map((p) =>
                renderRow(
                  'project',
                  p,
                  <FolderKanban size={15} className="text-blue-400 flex-shrink-0" />,
                  p.name,
                  p.key
                )
              )}
            </>
          )}

          {testCases.length > 0 && (
            <>
              <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Test Cases
              </p>
              {testCases.map((c) =>
                renderRow(
                  'testcase',
                  c,
                  <ListChecks size={15} className="text-blue-400 flex-shrink-0" />,
                  c.title,
                  c.human_id
                )
              )}
            </>
          )}

          {issues.length > 0 && (
            <>
              <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Issues
              </p>
              {issues.map((i) =>
                renderRow(
                  'issue',
                  i,
                  <CircleDot size={15} className="text-green-400 flex-shrink-0" />,
                  i.title,
                  i.status?.replace('_', ' ')
                )
              )}
            </>
          )}

          {flat.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              No results for “{query}”
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
