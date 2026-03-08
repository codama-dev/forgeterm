import { ipcRenderer, contextBridge } from 'electron'
import type { ForgeTermAPI, UpdateInfo } from '../shared/types'

const api: ForgeTermAPI = {
  createSession: (name: string, command?: string, idle?: boolean) =>
    ipcRenderer.invoke('session:create', name, command, idle),

  killSession: (id: string) =>
    ipcRenderer.invoke('session:kill', id),

  restartSession: (id: string) =>
    ipcRenderer.invoke('session:restart', id),

  writeToSession: (id: string, data: string) =>
    ipcRenderer.send('session:write', id, data),

  resizeSession: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('session:resize', id, cols, rows),

  onSessionData: (callback: (id: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) =>
      callback(id, data)
    ipcRenderer.on('session:data', handler)
    return () => { ipcRenderer.removeListener('session:data', handler) }
  },

  onSessionExit: (callback: (id: string, exitCode: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, exitCode: number) =>
      callback(id, exitCode)
    ipcRenderer.on('session:exit', handler)
    return () => { ipcRenderer.removeListener('session:exit', handler) }
  },

  getProjectConfig: () =>
    ipcRenderer.invoke('config:get'),

  getProjectPath: () =>
    ipcRenderer.invoke('project:get-path'),

  onConfigChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('config:changed', handler)
    return () => { ipcRenderer.removeListener('config:changed', handler) }
  },

  openFolder: () =>
    ipcRenderer.invoke('dialog:open-folder'),

  renameSession: (id: string, name: string) =>
    ipcRenderer.invoke('session:rename', id, name),

  onMenuNewSession: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:new-session', handler)
    return () => { ipcRenderer.removeListener('menu:new-session', handler) }
  },

  createAndOpenConfig: () =>
    ipcRenderer.invoke('config:create-and-open'),

  saveConfig: (config) =>
    ipcRenderer.invoke('config:save', JSON.parse(JSON.stringify(config))),

  onOpenThemeEditor: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:open-theme-editor', handler)
    return () => { ipcRenderer.removeListener('menu:open-theme-editor', handler) }
  },

  onOpenProjectSettings: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:open-project-settings', handler)
    return () => { ipcRenderer.removeListener('menu:open-project-settings', handler) }
  },

  onOpenProjectSwitcher: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:open-project-switcher', handler)
    return () => { ipcRenderer.removeListener('menu:open-project-switcher', handler) }
  },

  getRecentProjects: () =>
    ipcRenderer.invoke('projects:get-recent'),

  openProject: (projectPath: string) =>
    ipcRenderer.invoke('projects:open', projectPath),

  getWorkspaces: () =>
    ipcRenderer.invoke('workspaces:get'),

  setProjectWorkspace: (projectPath: string, workspaceName: string) =>
    ipcRenderer.invoke('workspaces:set-project', projectPath, workspaceName),

  removeProjectFromWorkspace: (projectPath: string) =>
    ipcRenderer.invoke('workspaces:remove-project', projectPath),

  openWorkspace: (workspaceName: string, arrange: boolean) =>
    ipcRenderer.invoke('workspaces:open', workspaceName, arrange),

  setWorkspaceArrange: (workspaceName: string, arrange: boolean) =>
    ipcRenderer.invoke('workspaces:set-arrange', workspaceName, arrange),

  setWorkspaceScreenPrefs: (workspaceName: string, displayCount: number, indices: number[]) =>
    ipcRenderer.invoke('workspaces:set-screen-prefs', workspaceName, displayCount, indices),

  getDisplays: () =>
    ipcRenderer.invoke('displays:get'),

  toggleWorkspaceProject: (workspaceName: string, projectPath: string) =>
    ipcRenderer.invoke('workspaces:toggle-project', workspaceName, projectPath),

  getSidebarMode: () =>
    ipcRenderer.invoke('project:get-sidebar-mode'),

  saveSidebarMode: (mode: string) =>
    ipcRenderer.invoke('project:save-sidebar-mode', mode),

  importVSCodeProjects: () =>
    ipcRenderer.invoke('import:vscode-projects'),

  detectProjectManagerFiles: () =>
    ipcRenderer.invoke('import:detect-editors'),

  importFromPath: (filePath: string) =>
    ipcRenderer.invoke('import:from-path', filePath),

  shouldShowImportSuggestion: () =>
    ipcRenderer.invoke('import:should-show-suggestion'),

  dismissImportSuggestion: () =>
    ipcRenderer.invoke('import:dismiss-suggestion'),

  removeRecentProject: (projectPath: string) =>
    ipcRenderer.invoke('projects:remove-recent', projectPath),

  deleteWorkspace: (workspaceName: string) =>
    ipcRenderer.invoke('workspaces:delete', workspaceName),

  openDataFile: (which: 'workspaces' | 'recent-projects') =>
    ipcRenderer.invoke('config:open-data-file', which),

  revealInFinder: () =>
    ipcRenderer.invoke('project:reveal-in-finder'),

  getRepoUrl: () =>
    ipcRenderer.invoke('project:get-repo-url'),

  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:open-external', url),

  checkForUpdate: () =>
    ipcRenderer.invoke('update:check'),

  getLastUpdateCheck: () =>
    ipcRenderer.invoke('update:get-last-check'),

  applyUpdate: () =>
    ipcRenderer.invoke('update:apply'),

  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info)
    ipcRenderer.on('update:available', handler)
    return () => { ipcRenderer.removeListener('update:available', handler) }
  },

  getFavoriteThemes: () =>
    ipcRenderer.invoke('themes:get-favorites'),

  saveFavoriteTheme: (theme) =>
    ipcRenderer.invoke('themes:save-favorite', JSON.parse(JSON.stringify(theme))),

  deleteFavoriteTheme: (name: string) =>
    ipcRenderer.invoke('themes:delete-favorite', name),
}

contextBridge.exposeInMainWorld('forgeterm', api)
