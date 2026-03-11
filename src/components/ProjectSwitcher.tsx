import { useState, useEffect, useRef, useCallback } from 'react'
import type { RecentProject, Workspace, DetectedEditor, DisplayInfo } from '../../shared/types'

interface ProjectSwitcherProps {
  accentColor: string
  onCancel: () => void
  welcomeMode?: boolean
}

type ConfirmDelete =
  | { type: 'project'; path: string; name: string }
  | { type: 'workspace'; name: string }

type FilterMode = 'recent' | 'workspaces' | 'projects' | 'all'

interface TileRect {
  x: number
  y: number
  width: number
  height: number
}

function calculateTilePositions(count: number, area: { width: number; height: number }): TileRect[] {
  const { width, height } = area
  if (count <= 0) return []
  if (count === 1) return [{ x: 0, y: 0, width, height }]
  if (count === 2) {
    const w = Math.floor(width / 2)
    return [
      { x: 0, y: 0, width: w, height },
      { x: w, y: 0, width: width - w, height },
    ]
  }
  if (count === 3) {
    const masterW = Math.floor(width / 2)
    const stackW = width - masterW
    const halfH = Math.floor(height / 2)
    return [
      { x: 0, y: 0, width: masterW, height },
      { x: masterW, y: 0, width: stackW, height: halfH },
      { x: masterW, y: halfH, width: stackW, height: height - halfH },
    ]
  }
  if (count === 4) {
    const w = Math.floor(width / 2)
    const h = Math.floor(height / 2)
    return [
      { x: 0, y: 0, width: w, height: h },
      { x: w, y: 0, width: width - w, height: h },
      { x: 0, y: h, width: w, height: height - h },
      { x: w, y: h, width: width - w, height: height - h },
    ]
  }
  if (count === 5) {
    const h = Math.floor(height / 2)
    const topW = Math.floor(width / 3)
    const botW = Math.floor(width / 2)
    return [
      { x: 0, y: 0, width: topW, height: h },
      { x: topW, y: 0, width: topW, height: h },
      { x: topW * 2, y: 0, width: width - topW * 2, height: h },
      { x: 0, y: h, width: botW, height: height - h },
      { x: botW, y: h, width: width - botW, height: height - h },
    ]
  }
  // 6+: 2x3 grid
  const colW = Math.floor(width / 3)
  const rowH = Math.floor(height / 2)
  const positions: TileRect[] = []
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      positions.push({
        x: col * colW,
        y: row * rowH,
        width: col === 2 ? width - colW * 2 : colW,
        height: row === 1 ? height - rowH : rowH,
      })
    }
  }
  return positions.slice(0, count)
}

function computeDistributionPreview(
  enabledCount: number,
  screenCount: number,
): { screenIdx: number; tiles: TileRect[] }[] {
  const previewW = 80
  const previewH = 50
  const base = Math.floor(enabledCount / screenCount)
  const extra = enabledCount % screenCount
  const result: { screenIdx: number; tiles: TileRect[] }[] = []
  for (let s = 0; s < screenCount; s++) {
    const count = base + (s < extra ? 1 : 0)
    result.push({
      screenIdx: s,
      tiles: count > 0 ? calculateTilePositions(count, { width: previewW, height: previewH }) : [],
    })
  }
  return result
}

function formatLastOpened(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  const date = new Date(ts)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ProjectSwitcher({ accentColor, onCancel, welcomeMode }: ProjectSwitcherProps) {
  const [projects, setProjects] = useState<RecentProject[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [filter, setFilter] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('recent')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showImportInfo, setShowImportInfo] = useState(false)
  const [detectedEditors, setDetectedEditors] = useState<DetectedEditor[]>([])
  const [showImportBanner, setShowImportBanner] = useState(false)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [dragWs, setDragWs] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number>(-1)
  const [dragOverIdx, setDragOverIdx] = useState<number>(-1)
  const [showArrangeHelp, setShowArrangeHelp] = useState<string | null>(null)
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

  const filteredWorkspaces = (filterMode === 'projects') ? [] : workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(q) ||
    ws.projects.some((p) => p.toLowerCase().includes(q)),
  )

  const filteredProjects = filterMode === 'workspaces' ? [] : (() => {
    const filtered = projects.filter((p) =>
      p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
    )
    // "All" tab sorts alphabetically; others keep lastOpened order
    if (filterMode === 'all') {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    }
    return filtered
  })()

  // In "Recent" mode, sort workspaces by most recent member project
  const getWorkspaceRecency = useCallback((ws: Workspace): number => {
    let maxTs = 0
    for (const p of ws.projects) {
      const proj = projects.find((pr) => pr.path === p)
      if (proj && proj.lastOpened > maxTs) maxTs = proj.lastOpened
    }
    return maxTs
  }, [projects])

  // Sort workspaces by recency in recent mode
  const sortedWorkspaces = filterMode === 'recent'
    ? [...filteredWorkspaces].sort((a, b) => getWorkspaceRecency(b) - getWorkspaceRecency(a))
    : filteredWorkspaces

  const totalItems = sortedWorkspaces.length + filteredProjects.length

  useEffect(() => {
    setSelectedIndex(0)
  }, [filter, filterMode])

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

  const handleDragStart = useCallback((wsName: string, idx: number) => {
    setDragWs(wsName)
    setDragIdx(idx)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }, [])

  const handleDrop = useCallback((wsName: string, dropIdx: number) => {
    if (dragWs !== wsName || dragIdx < 0 || dragIdx === dropIdx) {
      setDragWs(null)
      setDragIdx(-1)
      setDragOverIdx(-1)
      return
    }
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.name !== wsName) return ws
        const newProjects = [...ws.projects]
        const [moved] = newProjects.splice(dragIdx, 1)
        newProjects.splice(dropIdx, 0, moved)
        window.forgeterm.reorderWorkspaceProjects(wsName, newProjects)
        return { ...ws, projects: newProjects }
      }),
    )
    setDragWs(null)
    setDragIdx(-1)
    setDragOverIdx(-1)
  }, [dragWs, dragIdx])

  const handleDragEnd = useCallback(() => {
    setDragWs(null)
    setDragIdx(-1)
    setDragOverIdx(-1)
  }, [])

  const openWorkspace = useCallback((ws: Workspace) => {
    const disabled = new Set(ws.disabledProjects || [])
    const enabled = ws.projects.filter((p) => !disabled.has(p))
    if (enabled.length === 0) return
    window.forgeterm.openWorkspace(ws.name, ws.arrange ?? true)
    onCancel()
  }, [onCancel])

  const openSelected = useCallback(() => {
    if (selectedIndex < sortedWorkspaces.length) {
      openWorkspace(sortedWorkspaces[selectedIndex])
    } else {
      const project = filteredProjects[selectedIndex - sortedWorkspaces.length]
      if (project) {
        window.forgeterm.openProject(project.path)
        onCancel()
      }
    }
  }, [sortedWorkspaces, filteredProjects, selectedIndex, onCancel])

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

  // Build a map from project path -> project data for workspace tags
  const projectMap = new Map(projects.map((p) => [p.path, p]))

  return (
    <div className="modal-overlay" onClick={confirmDelete || welcomeMode ? undefined : onCancel}>
      <div className="modal project-switcher-modal" onClick={(e) => e.stopPropagation()}>
        {welcomeMode && (
          <div style={{
            padding: '24px 24px 16px',
            textAlign: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 28, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
              {'>_'}
            </div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#e2e8f0' }}>
              Welcome to ForgeTerm
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Open a project folder to get started
            </p>
          </div>
        )}
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

        {/* Filter tabs */}
        <div className="switcher-filter-tabs">
          {(['recent', 'workspaces', 'projects', 'all'] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              className={`switcher-filter-tab ${filterMode === mode ? 'active' : ''}`}
              onClick={() => setFilterMode(mode)}
            >
              {mode === 'recent' ? 'Recent' : mode === 'workspaces' ? 'Workspaces' : mode === 'projects' ? 'Projects' : 'All'}
            </button>
          ))}
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
          {sortedWorkspaces.length > 0 && (
            <>
              {filterMode !== 'recent' && (
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
              )}
              {sortedWorkspaces.map((ws, i) => {
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
                      {arrange && (
                        <button
                          className={`switcher-icon-btn arrange-help-btn ${showArrangeHelp === ws.name ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowArrangeHelp(showArrangeHelp === ws.name ? null : ws.name)
                          }}
                          title="How arrangement works"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="8" cy="8" r="7" />
                            <path d="M6 6.5a2 2 0 0 1 3.94.5c0 1.33-2 2-2 2" />
                            <circle cx="8" cy="12" r="0.5" fill="currentColor" />
                          </svg>
                        </button>
                      )}
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
                    {showArrangeHelp === ws.name && (
                      <div className="arrange-help-panel">
                        <div className="arrange-help-row"><strong>Drag</strong> project tags to reorder their window positions (A, B, C...)</div>
                        <div className="arrange-help-row"><strong>Click</strong> a tag to enable/disable it from the workspace launch</div>
                        {displays.length > 1 && (
                          <div className="arrange-help-row"><strong>Click screens</strong> in the map to choose which displays to use</div>
                        )}
                        <div className="arrange-help-row">Windows are tiled in letter order across selected screens</div>
                        {displays.length > 1 && (
                          <div className="arrange-help-row"><strong>Hover</strong> a screen to see which physical display it is</div>
                        )}
                      </div>
                    )}
                    <div className="switcher-workspace-projects">
                      {ws.projects.map((p, pi) => {
                        const proj = projectMap.get(p)
                        const projColor = proj?.accentColor
                        const enabledProjects = ws.projects.filter((pp) => !disabled.has(pp))
                        const letterIdx = disabled.has(p) ? -1 : enabledProjects.indexOf(p)
                        const letter = letterIdx >= 0 ? String.fromCharCode(65 + letterIdx) : null
                        const isDragging = dragWs === ws.name && dragIdx === pi
                        const isDropTarget = dragWs === ws.name && dragOverIdx === pi && dragIdx !== pi
                        return (
                          <span
                            key={p}
                            draggable
                            onDragStart={() => handleDragStart(ws.name, pi)}
                            onDragOver={(e) => handleDragOver(e, pi)}
                            onDrop={() => handleDrop(ws.name, pi)}
                            onDragEnd={handleDragEnd}
                            className={`switcher-workspace-tag ${disabled.has(p) ? 'disabled' : ''} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                            onClick={(e) => toggleWsProject(ws.name, p, e)}
                            title={disabled.has(p) ? 'Click to enable - Drag to reorder' : 'Click to disable - Drag to reorder'}
                            style={{
                              ...(projColor && !disabled.has(p) ? {
                                borderColor: projColor + '55',
                                background: projColor + '12',
                                color: projColor,
                              } : {}),
                              ...(isDropTarget ? { borderColor: accentColor, borderStyle: 'solid' } : {}),
                            }}
                          >
                            {letter && <span className="ws-tag-letter">{letter}</span>}
                            {proj?.emoji ? `${proj.emoji} ` : ''}{proj?.name || p.split('/').pop()}
                            {proj?.isOpen && (
                              <span className="switcher-open-dot" style={{ background: '#4ade80' }} title="Currently open" />
                            )}
                          </span>
                        )
                      })}
                    </div>
                    {arrange && (() => {
                      const enabledProjects = ws.projects.filter((p) => !disabled.has(p))
                      const selectedScreens = getSelectedScreens(ws)
                      const screenCount = displays.length > 1 ? selectedScreens.length : 1
                      const distribution = enabledProjects.length > 0
                        ? computeDistributionPreview(enabledProjects.length, screenCount)
                        : []

                      // Build letter-to-screen mapping
                      const screenTileLetters: { screenIdx: number; tiles: { letter: string; projPath: string }[] }[] = []
                      let letterOffset = 0
                      for (const screen of distribution) {
                        const items: { letter: string; projPath: string }[] = []
                        for (let ti = 0; ti < screen.tiles.length; ti++) {
                          items.push({
                            letter: String.fromCharCode(65 + letterOffset + ti),
                            projPath: enabledProjects[letterOffset + ti],
                          })
                        }
                        screenTileLetters.push({ screenIdx: screen.screenIdx, tiles: items })
                        letterOffset += screen.tiles.length
                      }

                      if (displays.length > 1) {
                        // Multi-screen: show spatial arrangement with tiles inside
                        const allBounds = displays.map((d) => d.bounds)
                        const minX = Math.min(...allBounds.map((b) => b.x))
                        const minY = Math.min(...allBounds.map((b) => b.y))
                        const maxX = Math.max(...allBounds.map((b) => b.x + b.width))
                        const maxY = Math.max(...allBounds.map((b) => b.y + b.height))
                        const totalW = maxX - minX
                        const totalH = maxY - minY
                        const maxW = 280
                        const maxMapH = 120
                        const scale = Math.min(maxW / totalW, maxMapH / totalH)
                        const mapW = totalW * scale
                        const mapH = totalH * scale

                        return (
                          <div className="screen-selector">
                            <div className="screen-arrangement-map">
                              <div className="screen-map-container" style={{ width: mapW, height: mapH }}>
                                {displays.map((d, idx) => {
                                  const isActive = selectedScreens.includes(idx)
                                  const left = (d.bounds.x - minX) * scale
                                  const top = (d.bounds.y - minY) * scale
                                  const w = d.bounds.width * scale
                                  const h = d.bounds.height * scale

                                  // Find tiles for this screen
                                  const activeScreenOrder = selectedScreens.indexOf(idx)
                                  const screenData = activeScreenOrder >= 0 ? screenTileLetters[activeScreenOrder] : null
                                  const tilePositions = screenData && screenData.tiles.length > 0
                                    ? calculateTilePositions(screenData.tiles.length, { width: w, height: h })
                                    : []

                                  return (
                                    <button
                                      key={d.id}
                                      className={`screen-map-display ${isActive ? 'active' : ''}`}
                                      style={{
                                        left, top, width: w, height: h,
                                        borderColor: isActive ? accentColor : undefined,
                                        background: isActive ? accentColor + '08' : undefined,
                                      }}
                                      onClick={(e) => toggleScreen(ws.name, idx, e)}
                                      onMouseEnter={() => window.forgeterm.highlightDisplay(idx, accentColor)}
                                      onMouseLeave={() => window.forgeterm.clearHighlightDisplay(idx)}
                                      title={`Display ${idx + 1}${d.isPrimary ? ' (primary)' : ''} - ${d.bounds.width}x${d.bounds.height}`}
                                    >
                                      {isActive && screenData ? (
                                        <>
                                          {tilePositions.map((tile, ti) => {
                                            const proj = projectMap.get(screenData.tiles[ti].projPath)
                                            const projColor = proj?.accentColor || accentColor
                                            return (
                                              <div
                                                key={ti}
                                                className="tile-preview-tile"
                                                style={{
                                                  left: tile.x,
                                                  top: tile.y,
                                                  width: tile.width,
                                                  height: tile.height,
                                                  background: projColor + '30',
                                                  borderColor: projColor + '60',
                                                }}
                                              >
                                                <span className="tile-preview-letter" style={{ color: projColor }}>{screenData.tiles[ti].letter}</span>
                                              </div>
                                            )
                                          })}
                                        </>
                                      ) : (
                                        <span className="screen-map-number">{idx + 1}</span>
                                      )}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      }

                      // Single screen: show simple tile preview
                      if (enabledProjects.length === 0) return null
                      const previewW = 120
                      const previewH = 75
                      const tiles = calculateTilePositions(enabledProjects.length, { width: previewW, height: previewH })
                      return (
                        <div className="tile-preview-container">
                          <span className="tile-preview-label">Layout:</span>
                          <div className="tile-preview-area" style={{ width: previewW, height: previewH }}>
                            {tiles.map((tile, ti) => {
                              const proj = projectMap.get(enabledProjects[ti])
                              const projColor = proj?.accentColor || accentColor
                              return (
                                <div
                                  key={ti}
                                  className="tile-preview-tile"
                                  style={{
                                    left: tile.x,
                                    top: tile.y,
                                    width: tile.width,
                                    height: tile.height,
                                    background: projColor + '25',
                                    borderColor: projColor + '55',
                                  }}
                                  title={proj?.name || enabledProjects[ti]?.split('/').pop()}
                                >
                                  <span className="tile-preview-letter" style={{ color: projColor }}>{String.fromCharCode(65 + ti)}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </>
          )}

          {filteredProjects.length > 0 && (
            <>
              {sortedWorkspaces.length > 0 && filterMode !== 'recent' && (
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
                const idx = sortedWorkspaces.length + i
                const projColor = project.accentColor
                return (
                  <div
                    key={project.path}
                    className={`switcher-item ${idx === selectedIndex ? 'selected' : ''}`}
                    style={idx === selectedIndex ? { background: (projColor || accentColor) + '22', borderLeftColor: projColor || accentColor } : undefined}
                    onClick={() => {
                      window.forgeterm.openProject(project.path)
                      onCancel()
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="switcher-project-row">
                      {project.emoji && (
                        <span className="switcher-project-emoji">{project.emoji}</span>
                      )}
                      {!project.emoji && projColor && (
                        <span className="switcher-project-color" style={{ background: projColor }} />
                      )}
                      <span className="switcher-name">
                        {project.name}
                        {project.isOpen && (
                          <span className="switcher-open-dot" style={{ background: '#4ade80' }} title="Currently open" />
                        )}
                      </span>
                      {project.workspace && (
                        <span className="switcher-badge" style={{ borderColor: (projColor || accentColor) + '66', color: projColor || accentColor }}>
                          {project.workspace}
                        </span>
                      )}
                      {project.lastOpened > 0 && (
                        <span className="switcher-last-opened">{formatLastOpened(project.lastOpened)}</span>
                      )}
                      <button
                        className="switcher-icon-btn switcher-open-project-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          window.forgeterm.openProject(project.path)
                          onCancel()
                        }}
                        title="Open project"
                        style={{ color: projColor || accentColor }}
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
