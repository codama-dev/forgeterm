export interface ForgeTermConfig {
  theme?: {
    background?: string
    foreground?: string
    cursor?: string
    selection?: string
    black?: string
    red?: string
    green?: string
    yellow?: string
    blue?: string
    magenta?: string
    cyan?: string
    white?: string
  }
  terminalTheme?: 'dark' | 'light'
  font?: {
    family?: string
    size?: number
  }
  window?: {
    accentColor?: string
    titlebarBackground?: string
    titlebarBackgroundEnd?: string
    titlebarForeground?: string
    sidebarBackground?: string
    sidebarForeground?: string
    buttonBackground?: string
    emoji?: string
    themeName?: string
  }
  projectName?: string
  sessions?: Array<{
    name: string
    command?: string
    autoStart?: boolean
  }>
}

export interface SessionInfo {
  id: string
  name: string
  command?: string
  running: boolean
}

export interface RecentProject {
  path: string
  name: string
  lastOpened: number
}

export interface ForgeTermAPI {
  createSession: (name: string, command?: string, idle?: boolean) => Promise<string>
  killSession: (id: string) => Promise<void>
  restartSession: (id: string) => Promise<string>
  writeToSession: (id: string, data: string) => void
  resizeSession: (id: string, cols: number, rows: number) => void
  onSessionData: (callback: (id: string, data: string) => void) => () => void
  onSessionExit: (callback: (id: string, exitCode: number) => void) => () => void
  getProjectConfig: () => Promise<ForgeTermConfig | null>
  getProjectPath: () => Promise<string>
  onConfigChanged: (callback: () => void) => () => void
  openFolder: () => Promise<string | null>
  renameSession: (id: string, name: string) => Promise<void>
  onMenuNewSession: (callback: () => void) => () => void
  createAndOpenConfig: () => Promise<void>
  saveConfig: (config: ForgeTermConfig) => Promise<void>
  onOpenThemeEditor: (callback: () => void) => () => void
  onOpenProjectSettings: (callback: () => void) => () => void
  onOpenProjectSwitcher: (callback: () => void) => () => void
  getRecentProjects: () => Promise<RecentProject[]>
  openProject: (projectPath: string) => Promise<void>
}
