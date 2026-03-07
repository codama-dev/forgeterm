import { app, BrowserWindow, ipcMain, Menu, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { PtyManager } from './ptyManager'
import type { ForgeTermConfig, RecentProject } from '../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  const filtered = projects.filter((p) => p.path !== projectPath)
  filtered.unshift({ path: projectPath, name, lastOpened: Date.now() })
  const trimmed = filtered.slice(0, 20)
  fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(trimmed, null, 2), 'utf-8')
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

function createProjectWindow(projectPath: string) {
  saveRecentProject(projectPath)
  const folderName = path.basename(projectPath)

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
  const configWatcher = watchConfig(win, projectPath)

  windowStates.set(win.id, {
    projectPath,
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
    return state?.projectPath ?? process.cwd()
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

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = result.filePaths[0]
    createProjectWindow(folderPath)
    return folderPath
  })

  ipcMain.handle('projects:get-recent', () => {
    return loadRecentProjects()
  })

  ipcMain.handle('projects:open', (_event, projectPath: string) => {
    createProjectWindow(projectPath)
  })
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
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
              createProjectWindow(result.filePaths[0])
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

function getInitialProjectPath(): string {
  // Check CLI args (skip electron binary and script path)
  const args = process.argv.slice(app.isPackaged ? 1 : 2)
  for (const arg of args) {
    if (!arg.startsWith('-') && !arg.startsWith('.')) {
      try {
        const resolved = path.resolve(arg)
        if (fs.statSync(resolved).isDirectory()) return resolved
      } catch { /* ignore */ }
    }
    if (arg === '.') return process.cwd()
    if (arg.startsWith('./') || arg.startsWith('/')) {
      try {
        const resolved = path.resolve(arg)
        if (fs.statSync(resolved).isDirectory()) return resolved
      } catch { /* ignore */ }
    }
  }
  return process.cwd()
}

app.whenReady().then(() => {
  buildMenu()
  setupIpcHandlers()

  const projectPath = getInitialProjectPath()
  createProjectWindow(projectPath)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createProjectWindow(process.cwd())
  }
})
