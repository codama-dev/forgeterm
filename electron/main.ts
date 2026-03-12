import { app, BrowserWindow, ipcMain, Menu, dialog, shell, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { PtyManager } from './ptyManager'
import type { ForgeTermConfig, RecentProject, Workspace, ImportResult, FavoriteTheme, DetectedEditor, UpdateInfo, SessionTemplate } from '../shared/types'
import { UpdateManager } from './updater'
import { NotificationServer, getSocketPath } from './notificationServer'
import { generateWindowTheme, getTerminalTheme, PRESET_THEMES } from '../src/themes'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Enable Chrome DevTools Protocol for external automation (e.g. Playwright)
app.commandLine.appendSwitch('remote-debugging-port', '9222')

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

interface WindowState {
  projectPath: string
  ptyManager: PtyManager
  configWatcher?: fs.FSWatcher
}

const windowStates = new Map<number, WindowState>()
const updateManager = new UpdateManager()
const notificationServer = new NotificationServer({
  findWindowForProject,
  getProjectDisplayName: (projectPath: string) => {
    if (!projectPath) return null
    const config = loadConfig(projectPath)
    return config?.projectName || path.basename(projectPath)
  },
  focusOrCreateWindow: (projectPath: string) => {
    focusOrCreateWindow(projectPath)
  },
  loadRecentProjects,
})

// --- Recent projects ---

function getRecentProjectsPath(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json')
}

function loadRecentProjects(): RecentProject[] {
  try {
    const raw = fs.readFileSync(getRecentProjectsPath(), 'utf-8')
    return JSON.parse(raw) as RecentProject[]
  } catch {
    return []
  }
}

function saveRecentProject(projectPath: string) {
  const projects = loadRecentProjects()
  const config = loadConfig(projectPath)
  const name = config?.projectName || path.basename(projectPath)
  const workspace = getWorkspaceForProject(projectPath)
  const existing = projects.find((p) => p.path === projectPath)
  const filtered = projects.filter((p) => p.path !== projectPath)
  filtered.unshift({ ...existing, path: projectPath, name, lastOpened: Date.now(), workspace })
  const trimmed = filtered.slice(0, 20)
  fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(trimmed, null, 2), 'utf-8')
}

// --- Workspaces ---

function getWorkspacesPath(): string {
  return path.join(app.getPath('userData'), 'workspaces.json')
}

function loadWorkspaces(): Workspace[] {
  try {
    const raw = fs.readFileSync(getWorkspacesPath(), 'utf-8')
    return JSON.parse(raw) as Workspace[]
  } catch {
    return []
  }
}

function saveWorkspaces(workspaces: Workspace[]) {
  fs.writeFileSync(getWorkspacesPath(), JSON.stringify(workspaces, null, 2), 'utf-8')
}

function setProjectWorkspace(projectPath: string, workspaceName: string) {
  const workspaces = loadWorkspaces()
  // Remove project from any existing workspace
  for (const ws of workspaces) {
    ws.projects = ws.projects.filter((p) => p !== projectPath)
  }
  // Add to target workspace (create if needed)
  let target = workspaces.find((ws) => ws.name === workspaceName)
  if (!target) {
    target = { name: workspaceName, projects: [] }
    workspaces.push(target)
  }
  target.projects.push(projectPath)
  // Remove empty workspaces
  const cleaned = workspaces.filter((ws) => ws.projects.length > 0)
  saveWorkspaces(cleaned)
}

function removeProjectFromWorkspace(projectPath: string) {
  const workspaces = loadWorkspaces()
  for (const ws of workspaces) {
    ws.projects = ws.projects.filter((p) => p !== projectPath)
  }
  const cleaned = workspaces.filter((ws) => ws.projects.length > 0)
  saveWorkspaces(cleaned)
}

function getWorkspaceForProject(projectPath: string): string | undefined {
  const workspaces = loadWorkspaces()
  return workspaces.find((ws) => ws.projects.includes(projectPath))?.name
}

// --- Window tiling ---

function calculateTilePositions(count: number, workArea: Electron.Rectangle): Electron.Rectangle[] {
  const { x, y, width, height } = workArea
  const gap = 0

  if (count <= 0) return []
  if (count === 1) return [{ x, y, width, height }]

  if (count === 2) {
    const w = Math.floor(width / 2)
    return [
      { x, y, width: w, height },
      { x: x + w + gap, y, width: width - w - gap, height },
    ]
  }

  if (count === 3) {
    // Master left, two stacked right
    const masterW = Math.floor(width / 2)
    const stackW = width - masterW - gap
    const halfH = Math.floor(height / 2)
    return [
      { x, y, width: masterW, height },
      { x: x + masterW + gap, y, width: stackW, height: halfH },
      { x: x + masterW + gap, y: y + halfH + gap, width: stackW, height: height - halfH - gap },
    ]
  }

  if (count === 4) {
    // 2x2 grid
    const w = Math.floor(width / 2)
    const h = Math.floor(height / 2)
    return [
      { x, y, width: w, height: h },
      { x: x + w + gap, y, width: width - w - gap, height: h },
      { x, y: y + h + gap, width: w, height: height - h - gap },
      { x: x + w + gap, y: y + h + gap, width: width - w - gap, height: height - h - gap },
    ]
  }

  if (count === 5) {
    // Top row: 3, bottom row: 2
    const h = Math.floor(height / 2)
    const topW = Math.floor(width / 3)
    const botW = Math.floor(width / 2)
    return [
      { x, y, width: topW, height: h },
      { x: x + topW + gap, y, width: topW, height: h },
      { x: x + topW * 2 + gap * 2, y, width: width - topW * 2 - gap * 2, height: h },
      { x, y: y + h + gap, width: botW, height: height - h - gap },
      { x: x + botW + gap, y: y + h + gap, width: width - botW - gap, height: height - h - gap },
    ]
  }

  // 6: 2x3 grid (2 rows, 3 columns)
  const colW = Math.floor(width / 3)
  const rowH = Math.floor(height / 2)
  const positions: Electron.Rectangle[] = []
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const isLastCol = col === 2
      const isLastRow = row === 1
      positions.push({
        x: x + col * (colW + gap),
        y: y + row * (rowH + gap),
        width: isLastCol ? width - colW * 2 - gap * 2 : colW,
        height: isLastRow ? height - rowH - gap : rowH,
      })
    }
  }
  return positions.slice(0, count)
}

function tileWindows(windows: BrowserWindow[], displayIndices?: number[]) {
  if (windows.length === 0) return

  const allDisplays = screen.getAllDisplays()

  // Determine which displays to use
  let targetDisplays: Electron.Display[]
  if (displayIndices && displayIndices.length > 0) {
    targetDisplays = displayIndices
      .filter((i) => i >= 0 && i < allDisplays.length)
      .map((i) => allDisplays[i])
    if (targetDisplays.length === 0) targetDisplays = [allDisplays[0]]
  } else {
    targetDisplays = [screen.getDisplayMatching(windows[0].getBounds())]
  }

  // Distribute windows across selected displays as evenly as possible
  const screenCount = targetDisplays.length
  const base = Math.floor(windows.length / screenCount)
  const extra = windows.length % screenCount

  const allTiles: Electron.Rectangle[] = []
  let windowIdx = 0
  for (let s = 0; s < screenCount; s++) {
    const count = base + (s < extra ? 1 : 0)
    if (count === 0) continue
    const tiles = calculateTilePositions(count, targetDisplays[s].workArea)
    allTiles.push(...tiles)
    windowIdx += count
  }

  windows.forEach((win, i) => {
    if (allTiles[i]) {
      win.setBounds(allTiles[i], true)
    }
  })
}

const DEFAULT_CONFIG: ForgeTermConfig = {
  theme: {
    background: '#0f172a',
    foreground: '#e2e8f0',
    cursor: '#38bdf8',
    selection: 'rgba(56, 189, 248, 0.3)',
    black: '#1e293b',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#f1f5f9',
  },
  font: {
    family: 'JetBrains Mono, Menlo, Monaco, monospace',
    size: 13,
  },
  terminalTheme: 'dark' as const,
  window: {
    accentColor: '#38bdf8',
    titlebarBackground: '#0f1a2e',
    titlebarBackgroundEnd: '#162640',
    titlebarForeground: '#8faabe',
    sidebarBackground: '#111b2e',
    sidebarForeground: '#8faabe',
    buttonBackground: '#1c2d4d',
    themeName: 'midnight',
  },
  sessions: [],
}

// --- Peacock sync ---

function readPeacockColor(projectPath: string): string | null {
  const settingsPath = path.join(projectPath, '.vscode', 'settings.json')
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(raw)
    const color = settings['peacock.color']
    if (typeof color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(color.trim())) {
      return color.startsWith('#') ? color.trim() : `#${color.trim()}`
    }
    return null
  } catch {
    return null
  }
}

function autoAssignThemeIfNeeded(projectPath: string) {
  const config = loadConfig(projectPath)
  // Only apply if no existing window theme
  if (config?.window?.accentColor) return

  // Try Peacock color first
  const peacockColor = readPeacockColor(projectPath)
  if (peacockColor) {
    const windowTheme = generateWindowTheme(peacockColor)
    const terminalColors = getTerminalTheme('dark')
    const newConfig: ForgeTermConfig = {
      ...config,
      window: { ...windowTheme, themeName: 'peacock' },
      theme: terminalColors,
      terminalTheme: 'dark',
    }
    saveConfig(projectPath, newConfig)
    return
  }

  // "Surprise me" - assign a random preset theme
  const preset = PRESET_THEMES[Math.floor(Math.random() * PRESET_THEMES.length)]
  const terminalColors = getTerminalTheme('dark')
  const newConfig: ForgeTermConfig = {
    ...config,
    window: { ...preset.window, themeName: preset.id },
    theme: terminalColors,
    terminalTheme: 'dark',
  }
  saveConfig(projectPath, newConfig)
}

function loadConfig(projectPath: string): ForgeTermConfig | null {
  const configPath = path.join(projectPath, '.forgeterm.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as ForgeTermConfig
  } catch {
    return null
  }
}

function saveConfig(projectPath: string, config: ForgeTermConfig) {
  const configPath = path.join(projectPath, '.forgeterm.json')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

function watchConfig(win: BrowserWindow, projectPath: string) {
  const configPath = path.join(projectPath, '.forgeterm.json')
  try {
    const watcher = fs.watch(configPath, () => {
      if (!win.isDestroyed()) {
        win.webContents.send('config:changed')
      }
    })
    return watcher
  } catch {
    // File doesn't exist yet - watch the directory instead
    try {
      const watcher = fs.watch(projectPath, (_, filename) => {
        if (filename === '.forgeterm.json' && !win.isDestroyed()) {
          win.webContents.send('config:changed')
        }
      })
      return watcher
    } catch {
      return undefined
    }
  }
}

function findWindowForProject(projectPath: string): BrowserWindow | null {
  for (const [winId, state] of windowStates) {
    if (state.projectPath === projectPath) {
      const win = BrowserWindow.fromId(winId)
      if (win && !win.isDestroyed()) return win
    }
  }
  return null
}

function focusOrCreateWindow(projectPath: string): BrowserWindow {
  const existing = findWindowForProject(projectPath)
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return existing
  }
  return createProjectWindow(projectPath)
}

function createProjectWindow(projectPath: string | null) {
  if (projectPath) {
    autoAssignThemeIfNeeded(projectPath)
    saveRecentProject(projectPath)
  }
  const folderName = projectPath ? path.basename(projectPath) : 'ForgeTerm'

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: folderName,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const ptyManager = new PtyManager()
  const configWatcher = projectPath ? watchConfig(win, projectPath) : undefined

  windowStates.set(win.id, {
    projectPath: projectPath ?? '',
    ptyManager,
    configWatcher,
  })

  win.on('closed', () => {
    const state = windowStates.get(win.id)
    if (state) {
      state.ptyManager.killAll()
      state.configWatcher?.close()
      windowStates.delete(win.id)
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  return win
}

function getStateForEvent(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  return windowStates.get(win.id) ?? null
}

// --- Editor detection for Project Manager import ---

function getEditorCandidates(): { name: string; path: string }[] {
  const home = app.getPath('home')
  const pmSuffix = 'User/globalStorage/alefragnani.project-manager/projects.json'

  const macEditors = [
    { name: 'VS Code', dir: 'Code' },
    { name: 'Cursor', dir: 'Cursor' },
    { name: 'Windsurf', dir: 'Windsurf' },
    { name: 'VSCodium', dir: 'VSCodium' },
    { name: 'VS Code Insiders', dir: 'Code - Insiders' },
  ]

  const candidates: { name: string; path: string }[] = []

  // macOS paths
  for (const editor of macEditors) {
    candidates.push({
      name: editor.name,
      path: path.join(home, 'Library/Application Support', editor.dir, pmSuffix),
    })
  }

  // Linux paths
  for (const editor of macEditors) {
    candidates.push({
      name: editor.name,
      path: path.join(home, '.config', editor.dir, pmSuffix),
    })
  }

  return candidates
}

function detectProjectManagerFiles(): DetectedEditor[] {
  return getEditorCandidates()
    .filter((c) => fs.existsSync(c.path))
    .map((c) => ({ name: c.name, path: c.path }))
}

function getImportDismissedPath(): string {
  return path.join(app.getPath('userData'), 'import-dismissed.json')
}

function isImportDismissed(): boolean {
  try {
    return fs.existsSync(getImportDismissedPath())
  } catch {
    return false
  }
}

function importProjectsFromFile(filePath: string): ImportResult | null {
  interface VSCodeProject {
    name: string
    rootPath: string
    tags: string[]
    enabled: boolean
    workspace?: string
  }

  let vsProjects: VSCodeProject[]
  try {
    vsProjects = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }

  const enabledProjects = vsProjects.filter((p) => p.enabled && p.rootPath)

  const existingRecent = loadRecentProjects()
  const existingPaths = new Set(existingRecent.map((p) => p.path))
  const existingWorkspaces = loadWorkspaces()
  const existingWsNames = new Set(existingWorkspaces.map((ws) => ws.name))

  const wsMap = new Map<string, Set<string>>()
  for (const ws of existingWorkspaces) {
    wsMap.set(ws.name, new Set(ws.projects))
  }

  const tagProjects = new Map<string, string[]>()
  for (const p of enabledProjects) {
    if (p.tags && p.tags.length > 0) {
      for (const tag of p.tags) {
        if (!tagProjects.has(tag)) tagProjects.set(tag, [])
        tagProjects.get(tag)!.push(p.rootPath)
      }
    }
  }

  const tagWorkspaces = new Map<string, string[]>()
  for (const [tag, paths] of tagProjects) {
    if (paths.length >= 2) {
      tagWorkspaces.set(tag, paths)
    }
  }

  let projectsAdded = 0
  const workspacesCreated: string[] = []
  const workspacesUpdated = new Set<string>()

  const newRecent = [...existingRecent]
  for (const p of enabledProjects) {
    if (!existingPaths.has(p.rootPath)) {
      newRecent.push({
        path: p.rootPath,
        name: p.name,
        lastOpened: 0,
        workspace: p.workspace || undefined,
      })
      existingPaths.add(p.rootPath)
      projectsAdded++
    } else if (p.workspace) {
      const existing = newRecent.find((r) => r.path === p.rootPath)
      if (existing && existing.workspace !== p.workspace) {
        existing.workspace = p.workspace
      }
    }

    if (p.workspace) {
      if (!wsMap.has(p.workspace)) {
        wsMap.set(p.workspace, new Set())
      }
      const ws = wsMap.get(p.workspace)!
      if (!ws.has(p.rootPath)) {
        ws.add(p.rootPath)
        if (existingWsNames.has(p.workspace)) {
          workspacesUpdated.add(p.workspace)
        }
      }
    }
  }

  const projectsWithExplicitWs = new Set(
    enabledProjects.filter((p) => p.workspace).map((p) => p.rootPath),
  )
  for (const [tag, paths] of tagWorkspaces) {
    const unassigned = paths.filter((p) => !projectsWithExplicitWs.has(p))
    if (unassigned.length >= 2) {
      if (!wsMap.has(tag)) {
        wsMap.set(tag, new Set())
      }
      const ws = wsMap.get(tag)!
      for (const p of unassigned) {
        ws.add(p)
      }
      for (const rp of newRecent) {
        if (unassigned.includes(rp.path) && !rp.workspace) {
          rp.workspace = tag
        }
      }
    }
  }

  for (const [name] of wsMap) {
    if (!existingWsNames.has(name)) {
      workspacesCreated.push(name)
    }
  }

  fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(newRecent, null, 2), 'utf-8')

  const finalWorkspaces: Workspace[] = []
  for (const [name, paths] of wsMap) {
    if (paths.size === 0) continue
    const existing = existingWorkspaces.find((ws) => ws.name === name)
    finalWorkspaces.push({
      name,
      projects: Array.from(paths),
      arrange: existing?.arrange ?? true,
    })
  }
  saveWorkspaces(finalWorkspaces)

  return {
    projectsAdded,
    workspacesCreated,
    workspacesUpdated: Array.from(workspacesUpdated),
  }
}

function setupIpcHandlers() {
  ipcMain.handle('session:create', (event, name: string, command?: string, idle?: boolean) => {
    const state = getStateForEvent(event)
    if (!state) return null

    const win = BrowserWindow.fromWebContents(event.sender)!
    const id = state.ptyManager.createSession({
      name,
      command,
      idle,
      cwd: state.projectPath,
      socketPath: getSocketPath(),
      onData: (sessionId, data) => {
        if (!win.isDestroyed()) {
          win.webContents.send('session:data', sessionId, data)
        }
      },
      onExit: (sessionId, exitCode) => {
        if (!win.isDestroyed()) {
          win.webContents.send('session:exit', sessionId, exitCode)
        }
      },
    })
    return id
  })

  ipcMain.handle('session:kill', (event, id: string) => {
    getStateForEvent(event)?.ptyManager.kill(id)
  })

  ipcMain.handle('session:restart', (event, id: string) => {
    const state = getStateForEvent(event)
    if (!state) return null

    const win = BrowserWindow.fromWebContents(event.sender)!
    return state.ptyManager.restart(
      id,
      (sessionId, data) => {
        if (!win.isDestroyed()) {
          win.webContents.send('session:data', sessionId, data)
        }
      },
      (sessionId, exitCode) => {
        if (!win.isDestroyed()) {
          win.webContents.send('session:exit', sessionId, exitCode)
        }
      },
    )
  })

  ipcMain.on('session:write', (event, id: string, data: string) => {
    getStateForEvent(event)?.ptyManager.write(id, data)
  })

  ipcMain.on('session:resize', (event, id: string, cols: number, rows: number) => {
    getStateForEvent(event)?.ptyManager.resize(id, cols, rows)
  })

  ipcMain.handle('session:rename', (event, id: string, name: string) => {
    getStateForEvent(event)?.ptyManager.rename(id, name)
  })

  ipcMain.handle('config:get', (event) => {
    const state = getStateForEvent(event)
    if (!state) return null
    return loadConfig(state.projectPath)
  })

  ipcMain.handle('project:get-path', (event) => {
    const state = getStateForEvent(event)
    return state?.projectPath || null
  })

  ipcMain.handle('project:has-project', (event) => {
    const state = getStateForEvent(event)
    return !!(state?.projectPath)
  })

  ipcMain.handle('config:create-and-open', async (event) => {
    const state = getStateForEvent(event)
    if (!state) return
    const configPath = path.join(state.projectPath, '.forgeterm.json')
    if (!fs.existsSync(configPath)) {
      saveConfig(state.projectPath, DEFAULT_CONFIG)
    }
    await shell.openPath(configPath)
  })

  ipcMain.handle('config:save', (event, config: ForgeTermConfig) => {
    const state = getStateForEvent(event)
    if (!state) return
    saveConfig(state.projectPath, config)
  })

  ipcMain.handle('dialog:open-folder', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = result.filePaths[0]

    // If the current window has no project (welcome state), reuse it
    const state = getStateForEvent(event)
    if (state && !state.projectPath) {
      const win = BrowserWindow.fromWebContents(event.sender)!
      autoAssignThemeIfNeeded(folderPath)
      saveRecentProject(folderPath)
      state.projectPath = folderPath
      state.configWatcher = watchConfig(win, folderPath)
      win.setTitle(path.basename(folderPath))
      win.webContents.send('config:changed')
      win.webContents.send('project:opened')
      return folderPath
    }

    focusOrCreateWindow(folderPath)
    return folderPath
  })

  ipcMain.handle('projects:get-recent', () => {
    const projects = loadRecentProjects()
    const openPaths = new Set(
      Array.from(windowStates.values()).map((s) => s.projectPath),
    )
    return projects
      .map((p) => {
        const config = loadConfig(p.path)
        return {
          ...p,
          accentColor: config?.window?.accentColor,
          emoji: config?.window?.emoji,
          isOpen: openPaths.has(p.path),
        }
      })
      .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
  })

  ipcMain.handle('projects:open', (event, projectPath: string) => {
    const sourceWin = BrowserWindow.fromWebContents(event.sender)
    const targetWin = focusOrCreateWindow(projectPath)
    // Ensure new window gets focus after the source window's modal dismissal
    if (sourceWin && targetWin !== sourceWin) {
      setTimeout(() => targetWin.focus(), 100)
    }
  })

  ipcMain.handle('workspaces:get', () => {
    return loadWorkspaces()
  })

  ipcMain.handle('workspaces:set-project', (_event, projectPath: string, workspaceName: string) => {
    setProjectWorkspace(projectPath, workspaceName)
  })

  ipcMain.handle('workspaces:remove-project', (_event, projectPath: string) => {
    removeProjectFromWorkspace(projectPath)
  })

  ipcMain.handle('workspaces:open', (event, workspaceName: string, arrange: boolean) => {
    const workspaces = loadWorkspaces()
    const ws = workspaces.find((w) => w.name === workspaceName)
    if (ws) {
      const sourceWin = BrowserWindow.fromWebContents(event.sender)
      const disabled = new Set(ws.disabledProjects || [])
      const enabledPaths = ws.projects.filter((p) => !disabled.has(p))
      const windows: BrowserWindow[] = []
      for (const projectPath of enabledPaths) {
        windows.push(focusOrCreateWindow(projectPath))
      }
      if (arrange) {
        // Look up screen preferences for current display count
        const displayCount = screen.getAllDisplays().length
        const key = String(displayCount)
        const indices = ws.screenPrefs?.[key]
        tileWindows(windows, indices)
      }
      // Ensure opened windows get focus instead of the source window
      const lastNew = windows[windows.length - 1]
      if (sourceWin && lastNew && lastNew !== sourceWin) {
        setTimeout(() => lastNew.focus(), 100)
      }
    }
  })

  ipcMain.handle('workspaces:set-arrange', (_event, workspaceName: string, arrange: boolean) => {
    const workspaces = loadWorkspaces()
    const ws = workspaces.find((w) => w.name === workspaceName)
    if (ws) {
      ws.arrange = arrange
      saveWorkspaces(workspaces)
    }
  })

  ipcMain.handle('workspaces:set-screen-prefs', (_event, workspaceName: string, displayCount: number, indices: number[]) => {
    const workspaces = loadWorkspaces()
    const ws = workspaces.find((w) => w.name === workspaceName)
    if (ws) {
      if (!ws.screenPrefs) ws.screenPrefs = {}
      ws.screenPrefs[String(displayCount)] = indices
      saveWorkspaces(workspaces)
    }
  })

  ipcMain.handle('displays:get', () => {
    const allDisplays = screen.getAllDisplays()
    const primary = screen.getPrimaryDisplay()
    return allDisplays.map((d, i) => ({
      id: d.id,
      index: i,
      bounds: d.bounds,
      workArea: d.workArea,
      isPrimary: d.id === primary.id,
    }))
  })

  // Track active highlight windows to clean up
  const highlightWindows = new Map<number, BrowserWindow>()

  ipcMain.handle('displays:highlight', (_event, displayIndex: number, color: string) => {
    const allDisplays = screen.getAllDisplays()
    if (displayIndex < 0 || displayIndex >= allDisplays.length) return

    // Clean up existing highlight for this display
    const existing = highlightWindows.get(displayIndex)
    if (existing && !existing.isDestroyed()) existing.close()

    const display = allDisplays[displayIndex]
    const { x, y, width, height } = display.bounds
    const borderWidth = 6
    const labelSize = 80

    const win = new BrowserWindow({
      x, y, width, height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      type: 'panel',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    win.setIgnoreMouseEvents(true)
    highlightWindows.set(displayIndex, win)

    win.loadURL(`data:text/html,<!DOCTYPE html><html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{background:transparent;overflow:hidden}
      .border{position:fixed;inset:0;border:${borderWidth}px solid ${color};border-radius:8px;pointer-events:none;animation:fadeIn 0.15s ease-out}
      .label{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:${labelSize}px;height:${labelSize}px;border-radius:50%;background:${color}33;border:3px solid ${color};display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;font-size:36px;font-weight:700;color:${color};animation:fadeIn 0.15s ease-out}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    </style></head><body><div class="border"></div><div class="label">${displayIndex + 1}</div></body></html>`)

    setTimeout(() => {
      if (!win.isDestroyed()) win.close()
      highlightWindows.delete(displayIndex)
    }, 1200)
  })

  ipcMain.handle('displays:clear-highlight', (_event, displayIndex: number) => {
    const existing = highlightWindows.get(displayIndex)
    if (existing && !existing.isDestroyed()) existing.close()
    highlightWindows.delete(displayIndex)
  })

  ipcMain.handle('workspaces:reorder-projects', (_event, workspaceName: string, newOrder: string[]) => {
    const workspaces = loadWorkspaces()
    const ws = workspaces.find((w) => w.name === workspaceName)
    if (ws) {
      ws.projects = newOrder
      saveWorkspaces(workspaces)
    }
  })

  ipcMain.handle('workspaces:toggle-project', (_event, workspaceName: string, projectPath: string) => {
    const workspaces = loadWorkspaces()
    const ws = workspaces.find((w) => w.name === workspaceName)
    if (ws) {
      const disabled = new Set(ws.disabledProjects || [])
      if (disabled.has(projectPath)) {
        disabled.delete(projectPath)
      } else {
        disabled.add(projectPath)
      }
      ws.disabledProjects = disabled.size > 0 ? Array.from(disabled) : undefined
      saveWorkspaces(workspaces)
    }
  })

  ipcMain.handle('project:get-sidebar-mode', (event) => {
    const state = getStateForEvent(event)
    if (!state) return undefined
    const projects = loadRecentProjects()
    const project = projects.find((p) => p.path === state.projectPath)
    return project?.sidebarMode
  })

  ipcMain.handle('project:save-sidebar-mode', (event, mode: string) => {
    const state = getStateForEvent(event)
    if (!state) return
    const projects = loadRecentProjects()
    const project = projects.find((p) => p.path === state.projectPath)
    if (project) {
      project.sidebarMode = mode as 'full' | 'compact' | 'hidden'
      fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(projects, null, 2), 'utf-8')
    }
  })

  ipcMain.handle('import:vscode-projects', async () => {
    const detected = detectProjectManagerFiles()
    let defaultPath: string | undefined
    if (detected.length > 0) {
      defaultPath = path.dirname(detected[0].path)
    }

    const dialogResult = await dialog.showOpenDialog({
      title: 'Select projects JSON file to import',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) return null
    return importProjectsFromFile(dialogResult.filePaths[0])
  })

  ipcMain.handle('import:from-path', (_event, filePath: string) => {
    return importProjectsFromFile(filePath)
  })

  ipcMain.handle('import:detect-editors', () => {
    return detectProjectManagerFiles()
  })

  ipcMain.handle('import:should-show-suggestion', () => {
    if (isImportDismissed()) return false
    const detected = detectProjectManagerFiles()
    const recentProjects = loadRecentProjects()
    // Only show suggestion if we found editors AND user has few projects (first-time feel)
    return detected.length > 0 && recentProjects.length <= 1
  })

  ipcMain.handle('import:dismiss-suggestion', () => {
    fs.writeFileSync(getImportDismissedPath(), JSON.stringify({ dismissed: true }), 'utf-8')
  })

  ipcMain.handle('projects:remove-recent', (_event, projectPath: string) => {
    const projects = loadRecentProjects().filter((p) => p.path !== projectPath)
    fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(projects, null, 2), 'utf-8')
    // Also remove from any workspace
    removeProjectFromWorkspace(projectPath)
  })

  ipcMain.handle('workspaces:delete', (_event, workspaceName: string) => {
    const workspaces = loadWorkspaces().filter((ws) => ws.name !== workspaceName)
    saveWorkspaces(workspaces)
    // Clear workspace field from recent projects
    const projects = loadRecentProjects().map((p) =>
      p.workspace === workspaceName ? { ...p, workspace: undefined } : p,
    )
    fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(projects, null, 2), 'utf-8')
  })

  ipcMain.handle('config:open-data-file', async (_event, which: string) => {
    const filePath = which === 'workspaces' ? getWorkspacesPath() : getRecentProjectsPath()
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf-8')
    }
    await shell.openPath(filePath)
  })

  ipcMain.handle('project:reveal-in-finder', (event) => {
    const state = getStateForEvent(event)
    if (state) {
      shell.showItemInFolder(state.projectPath)
    }
  })

  ipcMain.handle('project:get-repo-url', (event) => {
    const state = getStateForEvent(event)
    if (!state) return null
    try {
      const raw = execSync('git remote get-url origin', {
        cwd: state.projectPath,
        encoding: 'utf-8',
        timeout: 3000,
      }).trim()
      // Convert SSH URL to HTTPS
      const sshMatch = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
      if (sshMatch) {
        return `https://${sshMatch[1]}/${sshMatch[2]}`
      }
      // Already HTTPS - strip .git suffix
      return raw.replace(/\.git$/, '')
    } catch {
      return null
    }
  })

  ipcMain.handle('shell:open-external', (_event, url: string) => {
    shell.openExternal(url)
  })

  // --- Favorite themes ---

  const getFavoriteThemesPath = () => path.join(app.getPath('userData'), 'favorite-themes.json')

  ipcMain.handle('themes:get-favorites', () => {
    try {
      const raw = fs.readFileSync(getFavoriteThemesPath(), 'utf-8')
      return JSON.parse(raw) as FavoriteTheme[]
    } catch {
      return []
    }
  })

  ipcMain.handle('themes:save-favorite', (_event, theme: FavoriteTheme) => {
    let favorites: FavoriteTheme[] = []
    try {
      favorites = JSON.parse(fs.readFileSync(getFavoriteThemesPath(), 'utf-8'))
    } catch { /* empty */ }
    // Replace if same name exists
    favorites = favorites.filter((f) => f.name !== theme.name)
    favorites.push(theme)
    fs.writeFileSync(getFavoriteThemesPath(), JSON.stringify(favorites, null, 2), 'utf-8')
  })

  ipcMain.handle('themes:delete-favorite', (_event, name: string) => {
    let favorites: FavoriteTheme[] = []
    try {
      favorites = JSON.parse(fs.readFileSync(getFavoriteThemesPath(), 'utf-8'))
    } catch { /* empty */ }
    favorites = favorites.filter((f) => f.name !== name)
    fs.writeFileSync(getFavoriteThemesPath(), JSON.stringify(favorites, null, 2), 'utf-8')
  })

  // --- Session templates from all projects ---

  ipcMain.handle('sessions:get-all-templates', (): SessionTemplate[] => {
    const projects = loadRecentProjects()
    const templates: SessionTemplate[] = []
    for (const project of projects) {
      const config = loadConfig(project.path)
      if (config?.sessions?.length) {
        const projectName = config.projectName || path.basename(project.path)
        for (const s of config.sessions) {
          templates.push({
            name: s.name,
            command: s.command,
            projectName,
            projectPath: project.path,
          })
        }
      }
    }
    return templates
  })

  // --- CLI install ---

  function getCliDismissedPath(): string {
    return path.join(app.getPath('userData'), 'cli-prompt-dismissed.json')
  }

  function getCliSourcePath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'bin', 'forgeterm-cli.sh')
    }
    return path.join(__dirname, '..', 'bin', 'forgeterm-cli.sh')
  }

  ipcMain.handle('cli:is-installed', () => {
    return fs.existsSync('/usr/local/bin/forgeterm')
  })

  ipcMain.handle('cli:get-status', (): string => {
    const installed = fs.existsSync('/usr/local/bin/forgeterm')
    if (!installed) return 'not-setup'
    if (notificationServer.isListening()) return 'connected'
    return 'error'
  })

  ipcMain.handle('cli:restart-server', (): boolean => {
    try {
      notificationServer.stop()
      notificationServer.start()
      return notificationServer.isListening()
    } catch {
      return false
    }
  })

  ipcMain.handle('cli:should-show-prompt', () => {
    if (fs.existsSync('/usr/local/bin/forgeterm')) return false
    try {
      const data = JSON.parse(fs.readFileSync(getCliDismissedPath(), 'utf-8'))
      return !data.dismissed
    } catch {
      return true
    }
  })

  ipcMain.handle('cli:dismiss-prompt', () => {
    fs.writeFileSync(getCliDismissedPath(), JSON.stringify({ dismissed: true }), 'utf-8')
  })

  ipcMain.handle('cli:install', (): { success: boolean; error?: string } => {
    const targetPath = '/usr/local/bin/forgeterm'
    const sourcePath = getCliSourcePath()

    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: `CLI script not found at ${sourcePath}` }
    }

    try {
      // Try direct copy first
      try {
        fs.copyFileSync(sourcePath, targetPath)
        fs.chmodSync(targetPath, 0o755)
      } catch {
        // Need elevated permissions
        const script = `do shell script "cp '${sourcePath}' '${targetPath}' && chmod 755 '${targetPath}'" with administrator privileges`
        execSync(`osascript -e '${script}'`)
      }
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('User canceled')) {
        return { success: false, error: 'cancelled' }
      }
      return { success: false, error: msg }
    }
  })

  // --- Update checks ---

  ipcMain.handle('update:check', async (): Promise<UpdateInfo> => {
    const info = await updateManager.checkNow()
    return { ...info, supportsAutoInstall: updateManager.supportsAutoInstall }
  })

  ipcMain.handle('update:get-last-check', (): UpdateInfo | null => {
    const info = updateManager.getLastCheck()
    if (!info) return null
    return { ...info, supportsAutoInstall: updateManager.supportsAutoInstall }
  })

  ipcMain.handle('update:apply', async () => {
    await updateManager.applyUpdate()
  })

  ipcMain.handle('update:download', async () => {
    const info = updateManager.getLastCheck()
    if (!info?.dmgUrl) throw new Error('No DMG URL available')
    await updateManager.downloadDmg(info.dmgUrl)
  })

  ipcMain.handle('update:install', () => {
    const info = updateManager.getLastCheck()
    if (!info?.dmgUrl) throw new Error('No DMG URL available')
    updateManager.installViaScript(info.dmgUrl)
  })

  ipcMain.handle('update:get-command', (): string | null => {
    const info = updateManager.getLastCheck()
    if (!info?.dmgUrl) return null
    return updateManager.buildUpdateCommand(info.dmgUrl)
  })
}

async function installCli() {
  const targetPath = '/usr/local/bin/forgeterm'
  let sourcePath: string

  if (app.isPackaged) {
    // In packaged app, the CLI is in the Resources directory
    sourcePath = path.join(process.resourcesPath, 'bin', 'forgeterm-cli.sh')
  } else {
    // In dev, it's in the project bin directory
    sourcePath = path.join(__dirname, '..', 'bin', 'forgeterm-cli.sh')
  }

  if (!fs.existsSync(sourcePath)) {
    dialog.showErrorBox('Install Failed', `CLI script not found at ${sourcePath}`)
    return
  }

  try {
    // Check if already installed and up to date
    if (fs.existsSync(targetPath)) {
      const existing = fs.readFileSync(targetPath, 'utf-8')
      const source = fs.readFileSync(sourcePath, 'utf-8')
      if (existing === source) {
        dialog.showMessageBox({
          type: 'info',
          message: 'Command line tool already installed',
          detail: `The 'forgeterm' command is available at ${targetPath}`,
        })
        return
      }
    }

    // Try direct copy first (works if /usr/local/bin is writable)
    try {
      fs.copyFileSync(sourcePath, targetPath)
      fs.chmodSync(targetPath, 0o755)
    } catch {
      // Need elevated permissions - use osascript to prompt for admin
      const script = `do shell script "cp '${sourcePath}' '${targetPath}' && chmod 755 '${targetPath}'" with administrator privileges`
      execSync(`osascript -e '${script}'`)
    }

    dialog.showMessageBox({
      type: 'info',
      message: 'Command line tool installed',
      detail: `You can now use 'forgeterm' from any terminal.\n\nTry: forgeterm notify "Hello!"`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('User canceled')) {
      dialog.showErrorBox('Install Failed', msg)
    }
  }
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: async () => {
            const info = await updateManager.checkNow()
            const win = BrowserWindow.getFocusedWindow()
            if (win && !win.isDestroyed()) {
              win.webContents.send('update:check-result', {
                ...info,
                supportsAutoInstall: updateManager.supportsAutoInstall,
              })
            }
          },
        },
        {
          label: 'Install Command Line Tool...',
          click: async () => {
            await installCli()
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:new-session')
          },
        },
        { type: 'separator' },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory'],
            })
            if (!result.canceled && result.filePaths.length > 0) {
              focusOrCreateWindow(result.filePaths[0])
            }
          },
        },
        {
          label: 'Switch Project...',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:open-project-switcher')
          },
        },
        { type: 'separator' },
        {
          label: 'Project Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:open-project-settings')
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Theme Editor...',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:open-theme-editor')
          },
        },
        { type: 'separator' },
        {
          label: 'Edit Config JSON...',
          click: async () => {
            const win = BrowserWindow.getFocusedWindow()
            if (!win) return
            const state = windowStates.get(win.id)
            if (!state) return
            const configPath = path.join(state.projectPath, '.forgeterm.json')
            if (!fs.existsSync(configPath)) {
              saveConfig(state.projectPath, DEFAULT_CONFIG)
            }
            await shell.openPath(configPath)
          },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function isWritableDirectory(dirPath: string): boolean {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK)
    return dirPath !== '/'
  } catch {
    return false
  }
}

function getInitialProjectPath(): string | null {
  // Check CLI args (skip electron binary and script path)
  const args = process.argv.slice(app.isPackaged ? 1 : 2)
  for (const arg of args) {
    if (!arg.startsWith('-') && !arg.startsWith('.')) {
      try {
        const resolved = path.resolve(arg)
        if (fs.statSync(resolved).isDirectory() && isWritableDirectory(resolved)) return resolved
      } catch { /* ignore */ }
    }
    if (arg === '.') {
      const cwd = process.cwd()
      if (isWritableDirectory(cwd)) return cwd
    }
    if (arg.startsWith('./') || arg.startsWith('/')) {
      try {
        const resolved = path.resolve(arg)
        if (fs.statSync(resolved).isDirectory() && isWritableDirectory(resolved)) return resolved
      } catch { /* ignore */ }
    }
  }
  const cwd = process.cwd()
  return isWritableDirectory(cwd) ? cwd : null
}

// Handle macOS "Open with" / drag folder onto dock icon
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  try {
    if (!fs.statSync(filePath).isDirectory()) return
  } catch { return }

  if (app.isReady()) {
    focusOrCreateWindow(filePath)
  } else {
    // App not ready yet - store for launch
    process.argv.push(filePath)
  }
})

app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: 'ForgeTerm',
    copyright: 'Copyright © 2026 ForgeTerm',
    credits: 'Built by Codama\nhttps://codama.dev',
    website: 'https://codama.dev',
  })
  buildMenu()
  setupIpcHandlers()
  notificationServer.start()

  // Broadcast update availability to all renderer windows
  updateManager.onUpdateAvailable((info) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('update:available', { ...info, supportsAutoInstall: updateManager.supportsAutoInstall })
      }
    }
  })
  updateManager.startPeriodicChecks()

  const projectPath = getInitialProjectPath()
  createProjectWindow(projectPath)
})

app.on('will-quit', () => {
  notificationServer.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const cwd = process.cwd()
    createProjectWindow(isWritableDirectory(cwd) ? cwd : null)
  }
})
