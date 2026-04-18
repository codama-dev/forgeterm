import { useState, useEffect, useCallback, useRef } from 'react'
import type { HistoricalSession, DashboardWorkspace } from '../../shared/types'

interface SessionSearchProps {
  workspaces: DashboardWorkspace[]
  onClose: () => void
}

function formatDate(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today ${time}`
  if (isYesterday) return `Yesterday ${time}`
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export function SessionSearch({ workspaces, onClose }: SessionSearchProps) {
  const [query, setQuery] = useState('')
  const [filterWorkspace, setFilterWorkspace] = useState<string>('')
  const [results, setResults] = useState<HistoricalSession[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    // Load all recent sessions on mount
    window.forgeterm.searchSessionHistory({}).then(setResults)
  }, [])

  const doSearch = useCallback((q: string, ws: string) => {
    setLoading(true)
    window.forgeterm.searchSessionHistory({
      query: q || undefined,
      workspace: ws || undefined,
    }).then(r => {
      setResults(r)
      setLoading(false)
    })
  }, [])

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value, filterWorkspace), 250)
  }, [doSearch, filterWorkspace])

  const handleWorkspaceChange = useCallback((value: string) => {
    setFilterWorkspace(value)
    doSearch(query, value)
  }, [doSearch, query])

  const handleCleanup = useCallback(async () => {
    const removed = await window.forgeterm.deleteOldSessions(60)
    if (removed > 0) {
      doSearch(query, filterWorkspace)
    }
  }, [doSearch, query, filterWorkspace])

  const handleClickResult = useCallback((session: HistoricalSession) => {
    window.forgeterm.openProject(session.projectPath)
  }, [])

  return (
    <div className="session-search-overlay" onClick={onClose}>
      <div className="session-search-modal" onClick={e => e.stopPropagation()}>
        <div className="session-search-header">
          <div className="session-search-title">Session History</div>
          <button className="session-search-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="session-search-filters">
          <input
            ref={inputRef}
            className="session-search-input"
            type="text"
            placeholder="Search sessions..."
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
          />
          <select
            className="session-search-select"
            value={filterWorkspace}
            onChange={e => handleWorkspaceChange(e.target.value)}
          >
            <option value="">All workspaces</option>
            {workspaces.map(ws => (
              <option key={ws.name} value={ws.name}>{ws.emoji ? `${ws.emoji} ` : ''}{ws.name}</option>
            ))}
          </select>
          <button className="session-search-cleanup" onClick={handleCleanup} title="Delete sessions older than 60 days">
            Clean up
          </button>
        </div>

        <div className="session-search-results">
          {loading && <div className="session-search-loading">Searching...</div>}
          {!loading && results.length === 0 && (
            <div className="session-search-empty">No sessions found</div>
          )}
          {!loading && results.map((session, i) => (
            <div
              key={`${session.id}-${i}`}
              className="session-search-result"
              onClick={() => handleClickResult(session)}
            >
              <div className="session-search-result-header">
                <span className="session-search-result-name">{session.name}</span>
                <span className="session-search-result-date">{formatDate(session.endedAt ?? session.createdAt ?? Date.now())}</span>
              </div>
              <div className="session-search-result-meta">
                <span className="session-search-result-project">
                  {session.projectPath.split('/').pop()}
                </span>
                {session.workspace && (
                  <span className="session-search-result-workspace">{session.workspace}</span>
                )}
              </div>
              {session.info?.title && (
                <div className="session-search-result-info">{session.info.title}</div>
              )}
              {session.info?.timeline && session.info.timeline.length > 0 && (
                <div className="session-search-result-timeline">
                  {session.info.timeline.slice(-2).map((entry, j) => (
                    <div key={j} className="session-search-result-entry">
                      {entry.lastAction}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
