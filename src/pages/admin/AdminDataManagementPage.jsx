import { useState, useEffect } from 'react'
import { HardDrive, Paperclip, Download, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { deleteAttachment } from '../../lib/attachments'
import AdminSidebar from '../../components/AdminSidebar'
import AppHeader from '../../components/AppHeader'
import PageHeader from '../../components/PageHeader'
import EnterpriseTable from '../../components/ui/EnterpriseTable'
import EmptyState from '../../components/ui/EmptyState'

const TABS = ['STORAGE', 'ATTACHMENTS', 'EXPORTS']

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// Builds a CSV string from an array of objects and triggers a browser download —
// pure client-side, no backend/export job needed.
function downloadCsv(filename, rows, columns) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = columns.map((c) => escape(c.label)).join(',')
  const lines = rows.map((r) => columns.map((c) => escape(c.value(r))).join(','))
  const csv = [header, ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function StorageTab() {
  const [usage, setUsage] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('storage_usage')
      .select('*')
      .then(({ data }) => {
        setUsage(data || [])
        setLoading(false)
      })
  }, [])

  const totalBytes = usage.reduce((sum, u) => sum + Number(u.total_bytes), 0)
  const totalObjects = usage.reduce((sum, u) => sum + u.object_count, 0)

  if (loading) return <div className="h-32 bg-gray-700 rounded-lg animate-pulse" />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
          <p className="text-xl font-semibold text-white">{formatBytes(totalBytes)}</p>
          <p className="text-[12px] text-gray-500">Total storage used</p>
        </div>
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
          <p className="text-xl font-semibold text-white">{totalObjects}</p>
          <p className="text-[12px] text-gray-500">Total files</p>
        </div>
      </div>

      <div className="border border-gray-600 rounded-lg divide-y divide-gray-100">
        {usage.map((u) => (
          <div key={u.bucket_id} className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-gray-300 font-mono">{u.bucket_id}</span>
            <div className="flex items-center gap-4 text-[12px] text-gray-500">
              <span>{u.object_count} file{u.object_count === 1 ? '' : 's'}</span>
              <span className="text-white font-medium">{formatBytes(Number(u.total_bytes))}</span>
            </div>
          </div>
        ))}
        {usage.length === 0 && <p className="text-[12px] text-gray-500 px-4 py-6 text-center">No files uploaded yet.</p>}
      </div>
    </div>
  )
}

function AttachmentsTab() {
  const [attachments, setAttachments] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchAttachments = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('attachments')
      .select('*, issues(title, project_id, projects(name, key)), profiles(name)')
      .order('created_at', { ascending: false })
    setAttachments(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAttachments()
  }, [])

  const handleDelete = async (a) => {
    if (!confirm(`Delete "${a.file_name}"? This removes the file permanently.`)) return
    await deleteAttachment(a)
    fetchAttachments()
  }

  const filtered = attachments.filter(
    (a) => !search || a.file_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="relative max-w-xs mb-3">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search file name"
          className="w-full pl-7 pr-2.5 py-1.5 rounded-md bg-gray-700 border border-gray-600 text-[13px] outline-none focus:border-blue-500"
        />
      </div>

      <EnterpriseTable
        loading={loading}
        rows={filtered}
        rowKey={(a) => a.id}
        emptyState={
          <EmptyState
            icon={Paperclip}
            title="No issue attachments yet"
            description="Files uploaded to issues (via the Classic Kanban board) will appear here. Test case attachments aren't uploadable yet — that's part of a later phase."
          />
        }
        columns={[
          { key: 'file_name', label: 'File', render: (a) => <span className="text-white font-medium">{a.file_name}</span> },
          { key: 'type', label: 'Type', render: (a) => <span className="capitalize">{a.file_type}</span> },
          {
            key: 'issue',
            label: 'Attached To',
            render: (a) => (
              <span className="text-gray-400">
                {a.issues?.projects?.key ? `${a.issues.projects.key} — ` : ''}{a.issues?.title || 'Deleted issue'}
              </span>
            ),
          },
          { key: 'uploaded_by', label: 'Uploaded By', render: (a) => a.profiles?.name || '—' },
          { key: 'created_at', label: 'Date', render: (a) => new Date(a.created_at).toLocaleDateString() },
          {
            key: 'actions',
            label: '',
            width: '70px',
            render: (a) => (
              <button onClick={() => handleDelete(a)} className="text-gray-400 hover:text-red-500 p-1">
                <Trash2 size={13} />
              </button>
            ),
          },
        ]}
      />
    </div>
  )
}

function ExportsTab() {
  const [exporting, setExporting] = useState(false)

  const exportProjects = async () => {
    setExporting(true)
    const { data } = await supabase.from('projects').select('name, key, description, created_at').order('name')
    downloadCsv('projects.csv', data || [], [
      { label: 'Name', value: (r) => r.name },
      { label: 'Key', value: (r) => r.key },
      { label: 'Description', value: (r) => r.description },
      { label: 'Created', value: (r) => new Date(r.created_at).toLocaleDateString() },
    ])
    setExporting(false)
  }

  const exportTestCases = async () => {
    setExporting(true)
    const { data } = await supabase
      .from('test_cases')
      .select('human_id, title, test_type, priority, automation_status, created_at, projects(key)')
      .order('created_at', { ascending: false })
    downloadCsv('test_cases.csv', data || [], [
      { label: 'ID', value: (r) => r.human_id },
      { label: 'Project', value: (r) => r.projects?.key },
      { label: 'Title', value: (r) => r.title },
      { label: 'Type', value: (r) => r.test_type },
      { label: 'Priority', value: (r) => r.priority },
      { label: 'Automation Status', value: (r) => r.automation_status },
      { label: 'Created', value: (r) => new Date(r.created_at).toLocaleDateString() },
    ])
    setExporting(false)
  }

  return (
    <div className="space-y-3 max-w-lg">
      {[
        { label: 'All Projects', desc: 'Name, key, description, created date', onClick: exportProjects },
        { label: 'All Test Cases', desc: 'ID, project, title, type, priority, automation status', onClick: exportTestCases },
      ].map((item) => (
        <div key={item.label} className="flex items-center justify-between bg-gray-800 border border-gray-600 rounded-lg px-4 py-3">
          <div>
            <p className="text-[13px] font-medium text-white">{item.label}</p>
            <p className="text-[12px] text-gray-500">{item.desc}</p>
          </div>
          <button
            onClick={item.onClick}
            disabled={exporting}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:underline disabled:opacity-50"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      ))}
      <p className="text-[11px] text-gray-500">
        Exports download immediately as CSV. Scheduled/background exports and PDF/Excel formats aren't built yet.
      </p>
    </div>
  )
}

export default function AdminDataManagementPage() {
  const [tab, setTab] = useState('STORAGE')

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AppHeader breadcrumb={[{ label: 'Administration', to: '/admin' }, { label: 'Data Management' }]} />
        <PageHeader title="Data Management" subtitle="Storage usage, attachments, and data exports" />

        <div className="px-6 pt-3 flex items-center gap-4 border-b border-gray-600">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[12px] font-semibold pb-2.5 tracking-wide flex items-center gap-1.5 ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500'
              }`}
            >
              {t === 'STORAGE' && <HardDrive size={13} />}
              {t === 'ATTACHMENTS' && <Paperclip size={13} />}
              {t === 'EXPORTS' && <Download size={13} />}
              {t}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'STORAGE' && <StorageTab />}
          {tab === 'ATTACHMENTS' && <AttachmentsTab />}
          {tab === 'EXPORTS' && <ExportsTab />}
        </div>
      </div>
    </div>
  )
}
