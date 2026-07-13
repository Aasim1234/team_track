import { useState, useRef } from 'react'

// Lightweight markdown renderer (no external library) — covers the common cases
export function renderMarkdown(text) {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-900 rounded p-2 my-2 overflow-x-auto"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-900 px-1 rounded">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.*$)/gm, '<h3 class="text-base font-bold mt-2 mb-1">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-lg font-bold mt-2 mb-1">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-2 mb-1">$1</h1>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-400 hover:underline">$1</a>')
    .replace(/^- \[ \] (.*$)/gm, '<div class="flex items-center gap-2"><input type="checkbox" disabled /> $1</div>')
    .replace(/^- \[x\] (.*$)/gm, '<div class="flex items-center gap-2"><input type="checkbox" checked disabled /> $1</div>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\n/g, '<br/>')

  return html
}

const TOOLBAR_ACTIONS = [
  { icon: 'H', title: 'Heading', wrap: ['## ', ''], block: true },
  { icon: 'B', title: 'Bold', wrap: ['**', '**'], bold: true },
  { icon: 'I', title: 'Italic', wrap: ['*', '*'], italic: true },
  { icon: '❝', title: 'Quote', wrap: ['> ', ''], block: true },
  { icon: '</>', title: 'Code', wrap: ['`', '`'] },
  { icon: '🔗', title: 'Link', wrap: ['[', '](url)'] },
  { icon: '☰', title: 'Bulleted list', wrap: ['- ', ''], block: true },
  { icon: '1.', title: 'Numbered list', wrap: ['1. ', ''], block: true },
  { icon: '☑', title: 'Task list', wrap: ['- [ ] ', ''], block: true },
]

export default function CommentComposer({ onSubmit, issueStatus, onToggleStatus, submitLabel = 'Comment' }) {
  const [tab, setTab] = useState('write')
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  const insertWrap = (before, after, isBlock) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = text.slice(start, end)

    let insertion
    if (isBlock) {
      insertion = before + (selected || '')
    } else {
      insertion = before + (selected || 'text') + after
    }

    const newText = text.slice(0, start) + insertion + text.slice(end)
    setText(newText)

    setTimeout(() => {
      textarea.focus()
      const cursorPos = start + insertion.length
      textarea.setSelectionRange(cursorPos, cursorPos)
    }, 0)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onSubmit(text)
    setText('')
    setTab('write')
  }

  const isDone = issueStatus === 'done'

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2 border-b border-gray-700">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setTab('write')}
            className={`text-sm pb-2 ${tab === 'write' ? 'text-white border-b-2 border-orange-500' : 'text-gray-500'}`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`text-sm pb-2 ${tab === 'preview' ? 'text-white border-b-2 border-orange-500' : 'text-gray-500'}`}
          >
            Preview
          </button>
        </div>

        {tab === 'write' && (
          <div className="flex gap-1 pb-1">
            {TOOLBAR_ACTIONS.map((a) => (
              <button
                key={a.title}
                type="button"
                title={a.title}
                onClick={() => insertWrap(a.wrap[0], a.wrap[1], a.block)}
                className="text-xs text-gray-400 hover:text-white hover:bg-gray-700 w-7 h-7 rounded flex items-center justify-center"
              >
                {a.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        {tab === 'write' ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Use Markdown to format your comment"
            rows={6}
            className="w-full bg-gray-900 rounded p-3 outline-none text-sm resize-y"
          />
        ) : (
          <div
            className="w-full bg-gray-900 rounded p-3 text-sm min-h-[140px] text-gray-300"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(text) || '<span class="text-gray-500">Nothing to preview</span>' }}
          />
        )}
      </div>

      <div className="flex justify-between items-center px-3 pb-3">
        <span className="text-xs text-gray-500">Paste, drop, or click to add files</span>
        <div className="flex gap-2">
          {onToggleStatus && (
            <button
              type="button"
              onClick={() => onToggleStatus(isDone ? 'todo' : 'done')}
              className={`text-sm px-3 py-1.5 rounded font-medium border ${
                isDone
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  : 'border-purple-600 text-purple-300 hover:bg-purple-900/30'
              }`}
            >
              {isDone ? 'Reopen issue' : 'Close issue'}
            </button>
          )}
          <button
            type="submit"
            disabled={!text.trim()}
            className="bg-green-500 hover:bg-green-600 disabled:opacity-50 px-4 py-1.5 rounded text-sm font-semibold"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}
