import { app, net } from 'electron'

// --- Update provider abstraction ---
// Currently uses GitHub Releases API (notification-only).
// To switch to full auto-update with electron-updater:
//   1. `pnpm add electron-updater`
//   2. Replace GitHubReleaseProvider with ElectronUpdaterProvider below
//   3. The rest of the code (IPC, UI) stays the same

export interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  releaseNotes?: string
}

export interface UpdateProvider {
  check(): Promise<UpdateInfo>
  /** Apply the update (restart + install). Only supported by auto-updater providers. */
  apply(): Promise<void>
  /** Whether this provider supports in-app install (vs. just opening a URL). */
  readonly supportsAutoInstall: boolean
}

// --- GitHub Release provider (notification-only) ---

const GITHUB_OWNER = 'codama-dev'
const GITHUB_REPO = 'forgeterm'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pb[i] || 0) - (pa[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    request.setHeader('User-Agent', `ForgeTerm/${app.getVersion()}`)
    let body = ''
    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString() })
      response.on('end', () => {
        if (response.statusCode === 200) {
          try { resolve(JSON.parse(body)) }
          catch { reject(new Error('Invalid JSON')) }
        } else {
          reject(new Error(`HTTP ${response.statusCode}`))
        }
      })
    })
    request.on('error', reject)
    request.end()
  })
}

export class GitHubReleaseProvider implements UpdateProvider {
  readonly supportsAutoInstall = false

  async check(): Promise<UpdateInfo> {
    const currentVersion = app.getVersion()
    try {
      const data = await fetchJson(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      ) as { tag_name: string; html_url: string; body?: string }

      const latestVersion = data.tag_name.replace(/^v/, '')
      const available = compareVersions(currentVersion, latestVersion) > 0

      return {
        available,
        currentVersion,
        latestVersion,
        releaseUrl: data.html_url,
        releaseNotes: data.body ?? undefined,
      }
    } catch {
      return { available: false, currentVersion }
    }
  }

  async apply(): Promise<void> {
    throw new Error('Auto-install not supported. Use openExternal to open the release URL.')
  }
}

// --- Uncomment when you have code signing + electron-updater installed ---
//
// import { autoUpdater } from 'electron-updater'
//
// export class ElectronUpdaterProvider implements UpdateProvider {
//   readonly supportsAutoInstall = true
//
//   async check(): Promise<UpdateInfo> {
//     const currentVersion = app.getVersion()
//     try {
//       const result = await autoUpdater.checkForUpdates()
//       if (!result || !result.updateInfo) {
//         return { available: false, currentVersion }
//       }
//       const latestVersion = result.updateInfo.version
//       return {
//         available: compareVersions(currentVersion, latestVersion) > 0,
//         currentVersion,
//         latestVersion,
//         releaseNotes: typeof result.updateInfo.releaseNotes === 'string'
//           ? result.updateInfo.releaseNotes : undefined,
//       }
//     } catch {
//       return { available: false, currentVersion }
//     }
//   }
//
//   async apply(): Promise<void> {
//     await autoUpdater.downloadUpdate()
//     autoUpdater.quitAndInstall()
//   }
// }

// --- Singleton updater manager ---

export class UpdateManager {
  private provider: UpdateProvider
  private lastCheck: UpdateInfo | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners: Array<(info: UpdateInfo) => void> = []

  constructor(provider?: UpdateProvider) {
    // Swap this line to switch providers:
    this.provider = provider ?? new GitHubReleaseProvider()
  }

  get supportsAutoInstall(): boolean {
    return this.provider.supportsAutoInstall
  }

  onUpdateAvailable(fn: (info: UpdateInfo) => void) {
    this.listeners.push(fn)
  }

  async checkNow(): Promise<UpdateInfo> {
    this.lastCheck = await this.provider.check()
    if (this.lastCheck.available) {
      for (const fn of this.listeners) fn(this.lastCheck)
    }
    return this.lastCheck
  }

  getLastCheck(): UpdateInfo | null {
    return this.lastCheck
  }

  startPeriodicChecks() {
    // Check shortly after launch (give the app 30s to settle)
    setTimeout(() => this.checkNow(), 30_000)
    this.timer = setInterval(() => this.checkNow(), CHECK_INTERVAL_MS)
  }

  stopPeriodicChecks() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async applyUpdate(): Promise<void> {
    return this.provider.apply()
  }
}
