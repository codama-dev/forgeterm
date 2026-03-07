import { useState, useRef, useEffect, useCallback } from 'react'
import { useSessionStore, type Session } from '../store/sessionStore'

interface ContextMenuState {
  x: number
  y: number
  sessionId: string
}

interface SidebarProps {
  accentColor: string
  sidebarBackground?: string
  sidebarForeground?: string
  buttonBackground?: string
  onNewSession: () => void
  onDuplicateSession: (name: string, command?: string) => void
  onProjectSettings: () => void
  onThemeEditor: () => void
  onHelp: () => void
}

export function Sidebar({
  accentColor,
  sidebarBackground,
  sidebarForeground,
  buttonBackground,
  onNewSession,
  onDuplicateSession,
  onProjectSettings,
  onThemeEditor,
  onHelp,
}: SidebarProps) {
  const { sessions, activeSessionId, setActive } = useSessionStore()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const btnBg = buttonBackground ?? '#1c2d4d'
  const sidebarFg = sidebarForeground ?? '#8faabe'

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId })
  }, [])

  const handlePlay = useCallback(async (id: string) => {
    await window.forgeterm.restartSession(id)
    useSessionStore.getState().setRunning(id, true)
  }, [])

  const handleStop = useCallback(async (id: string) => {
    await window.forgeterm.killSession(id)
    useSessionStore.getState().setRunning(id, false)
  }, [])

  const handleDuplicate = useCallback((id: string) => {
    const session = sessions.find((s) => s.id === id)
    if (session) {
      onDuplicateSession(session.name + ' (copy)', session.command)
    }
  }, [sessions, onDuplicateSession])

  const handleRename = useCallback(() => {
    if (!contextMenu) return
    const session = sessions.find((s) => s.id === contextMenu.sessionId)
    if (session) {
      setEditingId(session.id)
      setEditName(session.name)
    }
    setContextMenu(null)
  }, [contextMenu, sessions])

  const commitRename = useCallback(async () => {
    if (editingId && editName.trim()) {
      await window.forgeterm.renameSession(editingId, editName.trim())
      useSessionStore.getState().renameSession(editingId, editName.trim())
    }
    setEditingId(null)
  }, [editingId, editName])

  return (
    <div
      className="sidebar"
      style={{
        ...(sidebarBackground ? { background: sidebarBackground } : {}),
        ...(sidebarForeground ? { color: sidebarForeground } : {}),
      }}
    >
      <div className="sidebar-header" style={{ color: sidebarFg }}>Sessions</div>
      <div className="sidebar-sessions">
        {sessions.map((session: Session) => (
          <div
            key={session.id}
            className={`sidebar-session ${session.id === activeSessionId ? 'active' : ''}`}
            style={
              session.id === activeSessionId
                ? { borderLeftColor: accentColor, background: btnBg }
                : undefined
            }
            onClick={() => setActive(session.id)}
            onContextMenu={(e) => handleContextMenu(e, session.id)}
          >
            {editingId === session.id ? (
              <input
                ref={editInputRef}
                className="rename-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                style={{ borderColor: accentColor }}
              />
            ) : (
              <>
                <span
                  className={`session-indicator ${session.running ? 'running' : 'stopped'}`}
                  style={session.running ? { color: accentColor } : undefined}
                />
                <span className="session-name">{session.name}</span>
                <div className="session-controls">
                  <button
                    className="session-ctrl-btn duplicate"
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(session.id) }}
                    title="Duplicate"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="1" width="10" height="10" rx="1.5" />
                      <path d="M1 5v9.5a.5.5 0 0 0 .5.5H11" />
                    </svg>
                  </button>
                  {session.running ? (
                    <button
                      className="session-ctrl-btn stop"
                      onClick={(e) => { e.stopPropagation(); handleStop(session.id) }}
                      title="Stop"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      className="session-ctrl-btn play"
                      onClick={(e) => { e.stopPropagation(); handlePlay(session.id) }}
                      title="Start"
                      style={{ color: accentColor }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M2 1l7 4-7 4V1z" fill="currentColor" />
                      </svg>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="sidebar-actions">
        <button
          className="sidebar-action-btn"
          onClick={onNewSession}
          title="New Session (Cmd+N)"
          style={{ background: btnBg, color: sidebarFg }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <button
          className="sidebar-action-btn"
          onClick={onProjectSettings}
          title="Project Settings (Cmd+,)"
          style={{ background: btnBg, color: sidebarFg }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          className="sidebar-action-btn"
          onClick={onThemeEditor}
          title="Theme Editor (Cmd+Shift+T)"
          style={{ background: btnBg, color: sidebarFg }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1a2 2 0 0 0 2-2 10 10 0 0 0-7-13z" />
            <circle cx="8" cy="10" r="1.5" fill="currentColor" />
            <circle cx="12" cy="7" r="1.5" fill="currentColor" />
            <circle cx="16" cy="10" r="1.5" fill="currentColor" />
            <circle cx="9" cy="14" r="1.5" fill="currentColor" />
          </svg>
        </button>
        <button
          className="sidebar-action-btn"
          onClick={onHelp}
          title="Help & Shortcuts (?)"
          style={{ background: btnBg, color: sidebarFg }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => {
            const id = contextMenu.sessionId
            setContextMenu(null)
            handlePlay(id)
          }}>
            Restart
          </div>
          <div className="context-menu-item" onClick={() => {
            const id = contextMenu.sessionId
            setContextMenu(null)
            handleStop(id)
          }}>
            Kill
          </div>
          <div className="context-menu-item" onClick={() => {
            const id = contextMenu.sessionId
            setContextMenu(null)
            handleDuplicate(id)
          }}>
            Duplicate
          </div>
          <div className="context-menu-item" onClick={handleRename}>
            Rename
          </div>
        </div>
      )}
    </div>
  )
}
