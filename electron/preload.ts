import { ipcRenderer, contextBridge } from 'electron'
import type { ForgeTermAPI } from '../shared/types'

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
}

contextBridge.exposeInMainWorld('forgeterm', api)
