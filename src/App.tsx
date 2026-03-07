import { useEffect, useState, useCallback, useRef } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalView, clearTerminal } from './components/TerminalView'
import { NewSessionModal } from './components/NewSessionModal'
import { ThemeEditor } from './components/ThemeEditor'
import { ProjectSettings } from './components/ProjectSettings'
import { ProjectSwitcher } from './components/ProjectSwitcher'
import { HelpModal } from './components/HelpModal'
import { useSessionStore } from './store/sessionStore'
import type { ForgeTermConfig } from '../shared/types'
import './App.css'

function App() {
  const { sessions, activeSessionId, addSession, setRunning, setActive } = useSessionStore()
  const [config, setConfig] = useState<ForgeTermConfig | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showThemeEditor, setShowThemeEditor] = useState(false)
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [folderName, setFolderName] = useState('ForgeTerm')
  const initializedRef = useRef(false)

  const displayName = config?.projectName || folderName
  const win = config?.window
  const accentColor = win?.accentColor ?? '#38bdf8'
  const titlebarBg = win?.titlebarBackgroundEnd
    ? `linear-gradient(to right, ${win.titlebarBackground ?? '#0f1a2e'}, ${win.titlebarBackgroundEnd})`
    : win?.titlebarBackground ?? '#0f1a2e'
  const titlebarFg = win?.titlebarForeground ?? '#8faabe'
  const sidebarBg = win?.sidebarBackground
  const sidebarFg = win?.sidebarForeground
  const buttonBg = win?.buttonBackground
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
      const [projectConfig, projectPath] = await Promise.all([
        window.forgeterm.getProjectConfig(),
        window.forgeterm.getProjectPath(),
      ])

      setConfig(projectConfig)
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

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
  }, [activeSessionId, setActive])

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
        <span className="titlebar-text" style={{ color: titlebarFg }}>
          {emoji && <span className="titlebar-emoji">{emoji}</span>}
          {displayName}
        </span>
      </div>
      <div className="main-layout">
        <Sidebar
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
          onCancel={() => setShowThemeEditor(false)}
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
