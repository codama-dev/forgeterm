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
  workspace?: string
  sidebarMode?: 'full' | 'compact' | 'hidden'
}

export interface Workspace {
  name: string
  projects: string[] // project paths
  arrange?: boolean // tile windows on open (default true)
  disabledProjects?: string[] // paths to skip when opening
  screenPrefs?: Record<string, number[]> // key = display count, value = display indices to use
}

export interface DisplayInfo {
  id: number
  index: number
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
}

export interface ImportResult {
  projectsAdded: number
  workspacesCreated: string[]
  workspacesUpdated: string[]
}

export interface DetectedEditor {
  name: string
  path: string
}

export interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  releaseNotes?: string
  supportsAutoInstall?: boolean
}

export interface FavoriteTheme {
  name: string
  window: {
    accentColor: string
    titlebarBackground: string
    titlebarBackgroundEnd: string
    titlebarForeground: string
    sidebarBackground: string
    sidebarForeground: string
    buttonBackground: string
  }
  terminalMode: 'dark' | 'light'
}

export interface SessionTemplate {
  name: string
  command?: string
  projectName: string
  projectPath: string
}

export interface ForgeTermNotification {
  message: string
  title?: string
  sound?: boolean
  projectPath?: string
  sessionId?: string
  sessionName?: string
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
  getProjectPath: () => Promise<string | null>
  hasProject: () => Promise<boolean>
  onProjectOpened: (callback: () => void) => () => void
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
  getWorkspaces: () => Promise<Workspace[]>
  setProjectWorkspace: (projectPath: string, workspaceName: string) => Promise<void>
  removeProjectFromWorkspace: (projectPath: string) => Promise<void>
  openWorkspace: (workspaceName: string, arrange: boolean) => Promise<void>
  setWorkspaceArrange: (workspaceName: string, arrange: boolean) => Promise<void>
  setWorkspaceScreenPrefs: (workspaceName: string, displayCount: number, indices: number[]) => Promise<void>
  getDisplays: () => Promise<DisplayInfo[]>
  toggleWorkspaceProject: (workspaceName: string, projectPath: string) => Promise<void>
  getSidebarMode: () => Promise<'full' | 'compact' | 'hidden' | undefined>
  saveSidebarMode: (mode: 'full' | 'compact' | 'hidden') => Promise<void>
  importVSCodeProjects: () => Promise<ImportResult | null>
  removeRecentProject: (projectPath: string) => Promise<void>
  deleteWorkspace: (workspaceName: string) => Promise<void>
  openDataFile: (which: 'workspaces' | 'recent-projects') => Promise<void>
  revealInFinder: () => Promise<void>
  getRepoUrl: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
  detectProjectManagerFiles: () => Promise<DetectedEditor[]>
  importFromPath: (filePath: string) => Promise<ImportResult | null>
  dismissImportSuggestion: () => Promise<void>
  shouldShowImportSuggestion: () => Promise<boolean>
  checkForUpdate: () => Promise<UpdateInfo>
  getLastUpdateCheck: () => Promise<UpdateInfo | null>
  applyUpdate: () => Promise<void>
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  getFavoriteThemes: () => Promise<FavoriteTheme[]>
  saveFavoriteTheme: (theme: FavoriteTheme) => Promise<void>
  deleteFavoriteTheme: (name: string) => Promise<void>
  getAllSessionTemplates: () => Promise<SessionTemplate[]>
  onFocusSession: (callback: (sessionId: string) => void) => () => void
}
