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
  dragDropBehavior?: 'ask' | 'path' | 'content' | 'copy'
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
  accentColor?: string
  emoji?: string
  isOpen?: boolean
}

export interface Workspace {
  name: string
  projects: string[] // project paths
  arrange?: boolean // tile windows on open (default true)
  disabledProjects?: string[] // paths to skip when opening
  screenPrefs?: Record<string, number[]> // key = display count, value = display indices to use
  emoji?: string
  description?: string
  accentColor?: string
  defaultCommand?: string
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
  dmgUrl?: string
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

export interface RemoteStatus {
  running: boolean
  port: number | null
  tunnelUrl: string | null
  token: string | null
}

export type CliStatus = 'not-setup' | 'connected' | 'error'

export type SessionActivityStatus = 'idle' | 'working' | 'unread'

export interface SessionStatusReport {
  sessionId: string
  sessionName: string
  status: SessionActivityStatus
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
  highlightDisplay: (displayIndex: number, color: string) => Promise<void>
  clearHighlightDisplay: (displayIndex: number) => Promise<void>
  toggleWorkspaceProject: (workspaceName: string, projectPath: string) => Promise<void>
  reorderWorkspaceProjects: (workspaceName: string, newOrder: string[]) => Promise<void>
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
  isCliInstalled: () => Promise<boolean>
  installCli: () => Promise<{ success: boolean; error?: string }>
  dismissCliPrompt: () => Promise<void>
  shouldShowCliPrompt: () => Promise<boolean>
  getCliStatus: () => Promise<CliStatus>
  restartCliServer: () => Promise<boolean>
  isFinderIntegrationInstalled: () => Promise<boolean>
  installFinderIntegration: () => Promise<{ success: boolean; error?: string }>
  uninstallFinderIntegration: () => Promise<{ success: boolean; error?: string }>
  checkForUpdate: () => Promise<UpdateInfo>
  getLastUpdateCheck: () => Promise<UpdateInfo | null>
  applyUpdate: () => Promise<void>
  downloadUpdate: () => Promise<void>
  onDownloadProgress: (callback: (progress: { progress: number; receivedBytes: number; totalBytes: number }) => void) => () => void
  installUpdate: () => Promise<void>
  getUpdateCommand: () => Promise<string | null>
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateCheckResult: (callback: (info: UpdateInfo) => void) => () => void
  getFavoriteThemes: () => Promise<FavoriteTheme[]>
  saveFavoriteTheme: (theme: FavoriteTheme) => Promise<void>
  deleteFavoriteTheme: (name: string) => Promise<void>
  getAllSessionTemplates: () => Promise<SessionTemplate[]>
  onFocusSession: (callback: (sessionId: string) => void) => () => void
  readFileContent: (filePath: string) => Promise<{ content: string; isBinary: boolean }>
  copyFileToProject: (filePath: string) => Promise<{ newPath: string; relativePath: string }>
  renameWorkspace: (oldName: string, newName: string) => Promise<void>
  updateWorkspace: (name: string, updates: Partial<Workspace>) => Promise<void>
  addProjectToWorkspace: (workspaceName: string, projectPath: string) => Promise<void>
  startRemoteAccess: () => Promise<RemoteStatus>
  stopRemoteAccess: () => Promise<RemoteStatus>
  getRemoteStatus: () => Promise<RemoteStatus>
  onRemoteStatusChanged: (callback: (status: RemoteStatus) => void) => () => void
  reportSessionStatuses: (statuses: SessionStatusReport[]) => void
}
