import { useEffect, useState, useCallback, useRef } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalView, clearTerminal } from './components/TerminalView'
import { NewSessionModal } from './components/NewSessionModal'
import { ThemeEditor } from './components/ThemeEditor'
import { ProjectSettings } from './components/ProjectSettings'
import { ProjectSwitcher } from './components/ProjectSwitcher'
import { HelpModal } from './components/HelpModal'
import { UpdateBanner } from './components/UpdateBanner'
import { useSessionStore } from './store/sessionStore'
import type { ForgeTermConfig } from '../shared/types'
import type { WindowTheme } from './themes'
import { generateWindowTheme, adjustAccentBrightness, getTerminalTheme } from './themes'
import './App.css'

type SidebarMode = 'full' | 'compact' | 'hidden'

function App() {
  const { sessions, activeSessionId, addSession, setRunning, setActive } = useSessionStore()
  const [config, setConfig] = useState<ForgeTermConfig | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showThemeEditor, setShowThemeEditor] = useState(false)
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [folderName, setFolderName] = useState('ForgeTerm')
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('full')
  const [previewTheme, setPreviewTheme] = useState<WindowTheme | null>(null)
  const initializedRef = useRef(false)

  const displayName = config?.projectName || folderName
  const win = config?.window
  // Use preview theme (from hover) if available, otherwise use config
  const effectiveWin = previewTheme ?? win
  const accentColor = effectiveWin?.accentColor ?? '#38bdf8'
  const titlebarBg = effectiveWin?.titlebarBackgroundEnd
    ? `linear-gradient(to right, ${effectiveWin.titlebarBackground ?? '#0f1a2e'}, ${effectiveWin.titlebarBackgroundEnd})`
    : effectiveWin?.titlebarBackground ?? '#0f1a2e'
  const titlebarFg = effectiveWin?.titlebarForeground ?? '#8faabe'
  const sidebarBg = effectiveWin?.sidebarBackground
  const sidebarFg = effectiveWin?.sidebarForeground
  const buttonBg = effectiveWin?.buttonBackground
  const emoji = win?.emoji

  const createSession = useCallback(async (name: string, command?: string, idle?: boolean) => {
    const id = await window.forgeterm.createSession(name, command, idle)
    if (id) {
      addSession({ id, name, command, running: !idle })
    }
  }, [addSession])

  // Initialize
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    async function init() {
      const [projectConfig, projectPath, savedSidebarMode] = await Promise.all([
        window.forgeterm.getProjectConfig(),
        window.forgeterm.getProjectPath(),
        window.forgeterm.getSidebarMode(),
      ])

      setConfig(projectConfig)
      if (savedSidebarMode) setSidebarMode(savedSidebarMode)
      const folder = projectPath.split('/').pop() || 'ForgeTerm'
      setFolderName(folder)
      document.title = projectConfig?.projectName || folder

      if (projectConfig?.sessions?.length) {
        for (const s of projectConfig.sessions) {
          const idle = s.autoStart === false
          await createSession(s.name, s.command, idle)
        }
      } else {
        await createSession('shell')
      }
    }

    init()
  }, [createSession])

  // Listen for session exits
  useEffect(() => {
    return window.forgeterm.onSessionExit((id, _exitCode) => {
      setRunning(id, false)
    })
  }, [setRunning])

  // Listen for config changes
  useEffect(() => {
    return window.forgeterm.onConfigChanged(async () => {
      const newConfig = await window.forgeterm.getProjectConfig()
      setConfig(newConfig)
      if (newConfig?.projectName) {
        document.title = newConfig.projectName
      }
    })
  }, [])

  // Listen for menu events
  useEffect(() => {
    return window.forgeterm.onMenuNewSession(() => setShowModal(true))
  }, [])

  useEffect(() => {
    return window.forgeterm.onOpenThemeEditor(() => setShowThemeEditor(true))
  }, [])

  useEffect(() => {
    return window.forgeterm.onOpenProjectSettings(() => setShowProjectSettings(true))
  }, [])

  useEffect(() => {
    return window.forgeterm.onOpenProjectSwitcher(() => setShowProjectSwitcher(true))
  }, [])

  const cycleSidebarMode = useCallback(() => {
    setSidebarMode((prev) => {
      const next = prev === 'full' ? 'compact' : prev === 'compact' ? 'hidden' : 'full'
      window.forgeterm.saveSidebarMode(next)
      return next
    })
  }, [])

  const handleThemePreview = useCallback((windowTheme: WindowTheme | null) => {
    setPreviewTheme(windowTheme)
  }, [])

  const adjustCurrentThemeBrightness = useCallback(async (delta: number) => {
    const currentAccent = config?.window?.accentColor ?? '#38bdf8'
    const newAccent = adjustAccentBrightness(currentAccent, delta)
    const newWindow = generateWindowTheme(newAccent)
    const terminal = getTerminalTheme(config?.terminalTheme ?? 'dark')
    terminal.cursor = newAccent
    const updated: ForgeTermConfig = {
      ...config,
      theme: terminal,
      window: {
        ...newWindow,
        emoji: config?.window?.emoji,
        themeName: undefined, // no longer a preset
      },
    }
    await window.forgeterm.saveConfig(updated)
    setConfig(updated)
  }, [config])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      // Cmd+B: cycle sidebar mode
      if (mod && !e.shiftKey && e.key === 'b') {
        e.preventDefault()
        cycleSidebarMode()
      }

      // Cmd+N or Cmd+T: new session
      if (mod && !e.shiftKey && (e.key === 'n' || e.key === 't')) {
        e.preventDefault()
        setShowModal(true)
      }

      // Cmd+Shift+T: theme editor
      if (mod && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        setShowThemeEditor(true)
      }

      // Cmd+,: project settings
      if (mod && e.key === ',') {
        e.preventDefault()
        setShowProjectSettings(true)
      }

      // Cmd+P: project switcher
      if (mod && !e.shiftKey && e.key === 'p') {
        e.preventDefault()
        setShowProjectSwitcher(true)
      }

      // Cmd+K: clear terminal
      if (mod && e.key === 'k') {
        e.preventDefault()
        if (activeSessionId) {
          clearTerminal(activeSessionId)
        }
      }

      // Cmd+1-9: switch sessions
      if (mod && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        const store = useSessionStore.getState()
        if (index < store.sessions.length) {
          setActive(store.sessions[index].id)
        }
      }

      // Cmd+?: help
      if (mod && e.shiftKey && e.key === '?') {
        e.preventDefault()
        setShowHelp(true)
      }

      // Cmd+Shift+= / Cmd+Shift+-: lighten/darken accent
      if (mod && e.shiftKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        adjustCurrentThemeBrightness(7)
      }
      if (mod && e.shiftKey && e.key === '_') {
        e.preventDefault()
        adjustCurrentThemeBrightness(-7)
      }

      // Escape: close modals
      if (e.key === 'Escape') {
        setShowModal(false)
        setShowThemeEditor(false)
        setShowProjectSettings(false)
        setShowProjectSwitcher(false)
        setShowHelp(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSessionId, setActive, cycleSidebarMode, adjustCurrentThemeBrightness])

  const handleNewSession = useCallback(async (name: string, command?: string) => {
    setShowModal(false)
    await createSession(name, command)
  }, [createSession])

  const handleSaveTheme = useCallback(async (updatedConfig: ForgeTermConfig) => {
    setShowThemeEditor(false)
    await window.forgeterm.saveConfig(updatedConfig)
    setConfig(updatedConfig)
  }, [])

  const handleSaveProjectSettings = useCallback(async (updatedConfig: ForgeTermConfig) => {
    setShowProjectSettings(false)
    await window.forgeterm.saveConfig(updatedConfig)
    setConfig(updatedConfig)
    if (updatedConfig.projectName) {
      document.title = updatedConfig.projectName
    } else {
      document.title = folderName
    }

    // Create any newly configured sessions that don't exist yet
    const configuredSessions = updatedConfig.sessions || []
    const currentSessions = useSessionStore.getState().sessions
    for (const cs of configuredSessions) {
      const exists = currentSessions.some((s) => s.name === cs.name)
      if (!exists) {
        const idle = cs.autoStart === false
        await createSession(cs.name, cs.command, idle)
      }
    }
  }, [createSession, folderName])

  const handleEditConfig = useCallback(() => {
    window.forgeterm.createAndOpenConfig()
  }, [])

  return (
    <div
      className="app"
      style={{ '--accent-color': accentColor } as React.CSSProperties}
    >
      <div className="titlebar" style={{ background: titlebarBg }}>
        <button
          className="sidebar-toggle-btn"
          onClick={cycleSidebarMode}
          title={`Toggle Sidebar (${navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl+'}B)`}
          style={{ color: titlebarFg }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="2" width="14" height="12" rx="2" />
            <line x1="5.5" y1="2" x2="5.5" y2="14" />
            {sidebarMode === 'hidden' && <line x1="3" y1="8" x2="5" y2="8" strokeWidth="1.5" />}
          </svg>
        </button>
        <span className="titlebar-text" style={{ color: titlebarFg }}>
          {emoji && <span className="titlebar-emoji">{emoji}</span>}
          {displayName}
        </span>
        <button
          className="open-project-btn"
          onClick={() => setShowProjectSwitcher(true)}
          title="Open Project (Cmd+P)"
          style={{ background: accentColor }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4.5V13a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 13V6.5A1.5 1.5 0 0 0 12.5 5H8L6.5 3H3.5A1.5 1.5 0 0 0 2 4.5z" />
          </svg>
          Open
        </button>
      </div>
      <UpdateBanner accentColor={accentColor} />
      <div className="main-layout">
        {sidebarMode !== 'hidden' && (
          <Sidebar
            mode={sidebarMode}
            accentColor={accentColor}
            sidebarBackground={sidebarBg}
            sidebarForeground={sidebarFg}
            buttonBackground={buttonBg}
            onNewSession={() => setShowModal(true)}
            onDuplicateSession={(name, command) => createSession(name, command)}
            onProjectSettings={() => setShowProjectSettings(true)}
            onThemeEditor={() => setShowThemeEditor(true)}
            onHelp={() => setShowHelp(true)}
          />
        )}
        <div className="terminal-area">
          {sessions.map((session) => (
            <TerminalView
              key={session.id}
              sessionId={session.id}
              active={session.id === activeSessionId}
              config={config}
            />
          ))}
          {sessions.length === 0 && (
            <div className="empty-state">
              <p>No sessions. Press Cmd+N to create one.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <NewSessionModal
          accentColor={accentColor}
          presets={(config?.sessions || []).map((s) => ({ name: s.name, command: s.command }))}
          onSubmit={handleNewSession}
          onCancel={() => setShowModal(false)}
        />
      )}

      {showThemeEditor && (
        <ThemeEditor
          config={config}
          onSave={handleSaveTheme}
          onCancel={() => { setShowThemeEditor(false); setPreviewTheme(null) }}
          onPreview={handleThemePreview}
        />
      )}

      {showProjectSettings && (
        <ProjectSettings
          config={config}
          accentColor={accentColor}
          projectName={folderName}
          onSave={handleSaveProjectSettings}
          onCancel={() => setShowProjectSettings(false)}
        />
      )}

      {showProjectSwitcher && (
        <ProjectSwitcher
          accentColor={accentColor}
          onCancel={() => setShowProjectSwitcher(false)}
        />
      )}

      {showHelp && (
        <HelpModal
          accentColor={accentColor}
          onClose={() => setShowHelp(false)}
        />
      )}
    </div>
  )
}

export default App
