import { useState, useEffect, useRef, useCallback } from 'react'
import type { RecentProject, Workspace, DetectedEditor, DisplayInfo } from '../../shared/types'

interface ProjectSwitcherProps {
  accentColor: string
  onCancel: () => void
}

type ConfirmDelete =
  | { type: 'project'; path: string; name: string }
  | { type: 'workspace'; name: string }

export function ProjectSwitcher({ accentColor, onCancel }: ProjectSwitcherProps) {
  const [projects, setProjects] = useState<RecentProject[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [filter, setFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showImportInfo, setShowImportInfo] = useState(false)
  const [detectedEditors, setDetectedEditors] = useState<DetectedEditor[]>([])
  const [showImportBanner, setShowImportBanner] = useState(false)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const refreshData = useCallback(() => {
    return Promise.all([
      window.forgeterm.getRecentProjects(),
      window.forgeterm.getWorkspaces(),
    ]).then(([p, w]) => {
      setProjects(p)
      setWorkspaces(w)
    })
  }, [])

  useEffect(() => {
    refreshData()
    inputRef.current?.focus()
    window.forgeterm.getDisplays().then(setDisplays)

    // Check for auto-import suggestion
    Promise.all([
      window.forgeterm.shouldShowImportSuggestion(),
      window.forgeterm.detectProjectManagerFiles(),
    ]).then(([shouldShow, editors]) => {
      setDetectedEditors(editors)
      if (shouldShow && editors.length > 0) {
        setShowImportBanner(true)
      }
    })
  }, [refreshData])

  const q = filter.toLowerCase()

  const filteredWorkspaces = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(q) ||
    ws.projects.some((p) => p.toLowerCase().includes(q)),
  )

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
  )

  const totalItems = filteredWorkspaces.length + filteredProjects.length

  useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

  const toggleArrange = useCallback((wsName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.name !== wsName) return ws
        const newArrange = !(ws.arrange ?? true)
        window.forgeterm.setWorkspaceArrange(wsName, newArrange)
        return { ...ws, arrange: newArrange }
      }),
    )
  }, [])

  const getSelectedScreens = useCallback((ws: Workspace): number[] => {
    const key = String(displays.length)
    const saved = ws.screenPrefs?.[key]
    if (saved && saved.length > 0) return saved
    // Default: all screens
    return displays.map((_, i) => i)
  }, [displays])

  const toggleScreen = useCallback((wsName: string, screenIndex: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.name !== wsName) return ws
        const current = getSelectedScreens(ws)
        let next: number[]
        if (current.includes(screenIndex)) {
          // Don't allow deselecting all screens
          if (current.length <= 1) return ws
          next = current.filter((i) => i !== screenIndex)
        } else {
          next = [...current, screenIndex].sort()
        }
        const key = String(displays.length)
        window.forgeterm.setWorkspaceScreenPrefs(wsName, displays.length, next)
        return { ...ws, screenPrefs: { ...ws.screenPrefs, [key]: next } }
      }),
    )
  }, [displays, getSelectedScreens])

  const toggleWsProject = useCallback((wsName: string, projectPath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.forgeterm.toggleWorkspaceProject(wsName, projectPath)
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.name !== wsName) return ws
        const disabled = new Set(ws.disabledProjects || [])
        if (disabled.has(projectPath)) {
          disabled.delete(projectPath)
        } else {
          disabled.add(projectPath)
        }
        return { ...ws, disabledProjects: disabled.size > 0 ? Array.from(disabled) : undefined }
      }),
    )
  }, [])

  const openWorkspace = useCallback((ws: Workspace) => {
    const disabled = new Set(ws.disabledProjects || [])
    const enabled = ws.projects.filter((p) => !disabled.has(p))
    if (enabled.length === 0) return
    window.forgeterm.openWorkspace(ws.name, ws.arrange ?? true)
    onCancel()
  }, [onCancel])

  const openSelected = useCallback(() => {
    if (selectedIndex < filteredWorkspaces.length) {
      openWorkspace(filteredWorkspaces[selectedIndex])
    } else {
      const project = filteredProjects[selectedIndex - filteredWorkspaces.length]
      if (project) {
        window.forgeterm.openProject(project.path)
        onCancel()
      }
    }
  }, [filteredWorkspaces, filteredProjects, selectedIndex, onCancel])

  const handleOpenFolder = useCallback(async () => {
    await window.forgeterm.openFolder()
    onCancel()
  }, [onCancel])

  const handleImport = useCallback(async () => {
    const result = await window.forgeterm.importVSCodeProjects()
    if (!result) {
      setToast('Import cancelled')
      setTimeout(() => setToast(null), 3000)
      return
    }
    await refreshData()
    const parts: string[] = []
    if (result.projectsAdded > 0) parts.push(`${result.projectsAdded} projects imported`)
    if (result.workspacesCreated.length > 0) parts.push(`${result.workspacesCreated.length} workspaces created`)
    if (result.workspacesUpdated.length > 0) parts.push(`${result.workspacesUpdated.length} workspaces updated`)
    setToast(parts.length > 0 ? parts.join(', ') : 'Everything up to date')
    setTimeout(() => setToast(null), 3000)
  }, [refreshData])

  const handleImportFromEditor = useCallback(async (editorPath: string) => {
    const result = await window.forgeterm.importFromPath(editorPath)
    setShowImportBanner(false)
    await window.forgeterm.dismissImportSuggestion()
    if (!result) {
      setToast('Could not read projects file')
      setTimeout(() => setToast(null), 3000)
      return
    }
    await refreshData()
    const parts: string[] = []
    if (result.projectsAdded > 0) parts.push(`${result.projectsAdded} projects imported`)
    if (result.workspacesCreated.length > 0) parts.push(`${result.workspacesCreated.length} workspaces created`)
    if (result.workspacesUpdated.length > 0) parts.push(`${result.workspacesUpdated.length} workspaces updated`)
    setToast(parts.length > 0 ? parts.join(', ') : 'Everything up to date')
    setTimeout(() => setToast(null), 3000)
  }, [refreshData])

  const dismissImportBanner = useCallback(async () => {
    setShowImportBanner(false)
    await window.forgeterm.dismissImportSuggestion()
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return
    if (confirmDelete.type === 'project') {
      await window.forgeterm.removeRecentProject(confirmDelete.path)
    } else {
      await window.forgeterm.deleteWorkspace(confirmDelete.name)
    }
    setConfirmDelete(null)
    await refreshData()
  }, [confirmDelete, refreshData])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (confirmDelete) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, totalItems - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        openSelected()
      }
    },
    [totalItems, openSelected, confirmDelete],
  )

  const projectNameMap = new Map(projects.map((p) => [p.path, p.name]))

  return (
    <div className="modal-overlay" onClick={confirmDelete ? undefined : onCancel}>
      <div className="modal project-switcher-modal" onClick={(e) => e.stopPropagation()}>
        <div className="switcher-search">
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects and workspaces..."
            className="switcher-input"
          />
        </div>

        {/* Auto-import banner */}
        {showImportBanner && (
          <div className="import-banner">
            <div className="import-banner-content">
              <svg className="import-banner-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2v8M5 7l3 3 3-3" />
                <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
              </svg>
              <div className="import-banner-text">
                <span className="import-banner-title">Import projects from Project Manager?</span>
                <span className="import-banner-desc">
                  Found in {detectedEditors.map((e) => e.name).join(', ')}
                </span>
              </div>
            </div>
            <div className="import-banner-actions">
              {detectedEditors.map((editor) => (
                <button
                  key={editor.path}
                  className="import-banner-btn import-banner-accept"
                  style={{ borderColor: accentColor + '66', color: accentColor }}
                  onClick={() => handleImportFromEditor(editor.path)}
                >
                  {detectedEditors.length > 1 ? editor.name : 'Import'}
                </button>
              ))}
              <button className="import-banner-btn import-banner-dismiss" onClick={dismissImportBanner}>
                No thanks
              </button>
            </div>
          </div>
        )}

        <div className="switcher-list">
          {filteredWorkspaces.length > 0 && (
            <>
              <div className="switcher-section-label">
                Workspaces
                <button
                  className="switcher-edit-config-btn"
                  onClick={() => window.forgeterm.openDataFile('workspaces')}
                  title="Edit workspaces.json"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" /></svg>
                </button>
              </div>
              {filteredWorkspaces.map((ws, i) => {
                const arrange = ws.arrange ?? true
                const disabled = new Set(ws.disabledProjects || [])
                const enabledCount = ws.projects.filter((p) => !disabled.has(p)).length
                return (
                  <div
                    key={`ws-${ws.name}`}
                    className={`switcher-item switcher-workspace ${i === selectedIndex ? 'selected' : ''}`}
                    style={i === selectedIndex ? { background: accentColor + '22', borderLeftColor: accentColor } : undefined}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <div className="switcher-workspace-header">
                      <svg className="switcher-workspace-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="3" width="6" height="10" rx="1" />
                        <rect x="9" y="3" width="6" height="10" rx="1" />
                      </svg>
                      <span className="switcher-name">{ws.name}</span>
                      <span className="switcher-workspace-count">
                        {enabledCount}/{ws.projects.length}
                      </span>
                      <button
                        className="switcher-icon-btn switcher-open-ws-btn"
                        onClick={(e) => { e.stopPropagation(); openWorkspace(ws) }}
                        title="Open workspace"
                        style={{ color: accentColor }}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 2l10 6-10 6V2z" />
                        </svg>
                      </button>
                      <button
                        className={`switcher-icon-btn arrange-toggle ${arrange ? 'active' : ''}`}
                        onClick={(e) => toggleArrange(ws.name, e)}
                        title={arrange ? 'Auto-arrange: on' : 'Auto-arrange: off'}
                        style={arrange ? { color: accentColor } : undefined}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="1" y="1" width="6" height="6" rx="1" />
                          <rect x="9" y="1" width="6" height="6" rx="1" />
                          <rect x="1" y="9" width="6" height="6" rx="1" />
                          <rect x="9" y="9" width="6" height="6" rx="1" />
                        </svg>
                      </button>
                      <button
                        className="switcher-icon-btn switcher-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDelete({ type: 'workspace', name: ws.name })
                        }}
                        title="Delete workspace"
                      >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                      </button>
                    </div>
                    {arrange && displays.length > 1 && (
                      <div className="screen-selector">
                        <span className="screen-selector-label">Screens:</span>
                        {displays.map((d, idx) => {
                          const selected = getSelectedScreens(ws)
                          const isActive = selected.includes(idx)
                          return (
                            <button
                              key={d.id}
                              className={`screen-btn ${isActive ? 'active' : ''}`}
                              style={isActive ? { borderColor: accentColor, color: accentColor } : undefined}
                              onClick={(e) => toggleScreen(ws.name, idx, e)}
                              title={`Display ${idx + 1}${d.isPrimary ? ' (primary)' : ''} - ${d.bounds.width}x${d.bounds.height}`}
                            >
                              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                                <rect x="0.5" y="0.5" width="13" height="8" rx="1" />
                                <path d="M5 9.5h4" />
                              </svg>
                              <span>{idx + 1}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <div className="switcher-workspace-projects">
                      {ws.projects.map((p) => (
                        <span
                          key={p}
                          className={`switcher-workspace-tag ${disabled.has(p) ? 'disabled' : ''}`}
                          onClick={(e) => toggleWsProject(ws.name, p, e)}
                          title={disabled.has(p) ? 'Click to enable' : 'Click to disable'}
                        >
                          {projectNameMap.get(p) || p.split('/').pop()}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {filteredProjects.length > 0 && (
            <>
              {filteredWorkspaces.length > 0 && (
                <div className="switcher-section-label">
                  Projects
                  <button
                    className="switcher-edit-config-btn"
                    onClick={() => window.forgeterm.openDataFile('recent-projects')}
                    title="Edit recent-projects.json"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" /></svg>
                  </button>
                </div>
              )}
              {filteredProjects.map((project, i) => {
                const idx = filteredWorkspaces.length + i
                return (
                  <div
                    key={project.path}
                    className={`switcher-item ${idx === selectedIndex ? 'selected' : ''}`}
                    style={idx === selectedIndex ? { background: accentColor + '22', borderLeftColor: accentColor } : undefined}
                    onClick={() => {
                      window.forgeterm.openProject(project.path)
                      onCancel()
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="switcher-project-row">
                      <span className="switcher-name">{project.name}</span>
                      {project.workspace && (
                        <span className="switcher-badge" style={{ borderColor: accentColor + '66', color: accentColor }}>
                          {project.workspace}
                        </span>
                      )}
                      <button
                        className="switcher-icon-btn switcher-open-project-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          window.forgeterm.openProject(project.path)
                          onCancel()
                        }}
                        title="Open project"
                        style={{ color: accentColor }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 3l6 5-6 5" />
                        </svg>
                      </button>
                      <button
                        className="switcher-icon-btn switcher-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDelete({ type: 'project', path: project.path, name: project.name })
                        }}
                        title="Remove project"
                      >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                      </button>
                    </div>
                    <span className="switcher-path">{project.path}</span>
                  </div>
                )
              })}
            </>
          )}

          {totalItems === 0 && (
            <div className="switcher-empty">No results found</div>
          )}
        </div>
        <div className="switcher-footer">
          <div className="switcher-footer-row">
            <button className="switcher-footer-btn" onClick={handleOpenFolder} title="Open a folder">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
              </svg>
              Open Folder
            </button>
            <div className="switcher-import-group">
              <button className="switcher-footer-btn" onClick={handleImport} title="Import projects from a JSON file">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8M5 7l3 3 3-3" />
                  <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
                </svg>
                Import JSON
              </button>
              <button
                className="switcher-info-btn"
                onClick={() => setShowImportInfo(!showImportInfo)}
                title="Import format info"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="7" />
                  <path d="M8 11V7M8 5V4.5" />
                </svg>
              </button>
            </div>
          </div>
          {showImportInfo && (
            <div className="import-info-panel">
              <div className="import-info-title">Import Format</div>
              <p className="import-info-text">
                Compatible with <strong>VS Code Project Manager</strong> format.
                Works with VS Code, Cursor, Windsurf, and other VS Code forks.
              </p>
              <div className="import-info-code">
                {'[{ "name": "my-app", "rootPath": "/path",\n   "tags": ["work"], "enabled": true }]'}
              </div>
              {detectedEditors.length > 0 && (
                <div className="import-info-detected">
                  <span className="import-info-detected-label">Detected:</span>
                  {detectedEditors.map((e) => (
                    <button
                      key={e.path}
                      className="import-info-detected-btn"
                      style={{ borderColor: accentColor + '44', color: accentColor }}
                      onClick={() => handleImportFromEditor(e.path)}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="switcher-toast">{toast}</div>
      )}

      {confirmDelete && (
        <div className="modal-overlay confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {confirmDelete.type === 'workspace' ? 'Delete workspace?' : 'Remove project?'}
            </h3>
            <p className="confirm-text">
              {confirmDelete.type === 'workspace'
                ? `This will delete the "${confirmDelete.name}" workspace. The projects inside will remain in your project list.`
                : `This will remove "${confirmDelete.name}" from your recent projects.`
              }
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn-create"
                style={{ background: '#f87171' }}
                onClick={handleConfirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
