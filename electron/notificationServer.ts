import { app, Notification, BrowserWindow } from 'electron'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import type { ForgeTermNotification } from '../shared/types'

export function getSocketPath(): string {
  return path.join(app.getPath('userData'), 'forgeterm.sock')
}

interface NotificationServerOptions {
  findWindowForProject: (projectPath: string) => BrowserWindow | null
  getProjectDisplayName: (projectPath: string) => string | null
  focusOrCreateWindow: (projectPath: string) => void
  loadRecentProjects: () => Array<{ path: string; name: string; lastOpened?: number; workspace?: string }>
  openFolderAsWorkspace: (parentPath: string) => void
}

interface CliCommand {
  command: string
  [key: string]: unknown
}

export class NotificationServer {
  private server: net.Server | null = null
  private options: NotificationServerOptions

  constructor(options: NotificationServerOptions) {
    this.options = options
  }

  start() {
    const socketPath = getSocketPath()

    // Clean up stale socket file
    try {
      fs.unlinkSync(socketPath)
    } catch {
      // ignore
    }

    this.server = net.createServer((conn) => {
      let buffer = ''
      conn.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const payload = JSON.parse(line)
            const result = this.handleCommand(payload)
            conn.write(JSON.stringify(result) + '\n')
          } catch {
            conn.write(JSON.stringify({ ok: false, error: 'Invalid JSON' }) + '\n')
          }
        }
      })
    })

    this.server.on('error', (err) => {
      console.error('NotificationServer error:', err.message)
    })

    this.server.listen(socketPath)
  }

  private handleCommand(payload: CliCommand | ForgeTermNotification): { ok: boolean; error?: string; data?: unknown } {
    // New-style command with explicit `command` field
    if ('command' in payload && typeof payload.command === 'string') {
      switch (payload.command) {
        case 'notify':
          this.showNotification(payload as unknown as ForgeTermNotification)
          return { ok: true }

        case 'open': {
          const projectPath = payload.path as string
          if (!projectPath) return { ok: false, error: 'Missing path' }
          try {
            const resolved = path.resolve(projectPath)
            if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
              return { ok: false, error: `Not a directory: ${resolved}` }
            }
            this.options.focusOrCreateWindow(resolved)
            return { ok: true }
          } catch (err: unknown) {
            return { ok: false, error: (err as Error).message }
          }
        }

        case 'list': {
          const projects = this.options.loadRecentProjects()
          return { ok: true, data: projects }
        }

        case 'open-workspace': {
          const parentPath = payload.path as string
          if (!parentPath) return { ok: false, error: 'Missing path' }
          try {
            const resolved = path.resolve(parentPath)
            if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
              return { ok: false, error: `Not a directory: ${resolved}` }
            }
            this.options.openFolderAsWorkspace(resolved)
            return { ok: true }
          } catch (err: unknown) {
            return { ok: false, error: (err as Error).message }
          }
        }

        default:
          return { ok: false, error: `Unknown command: ${payload.command}` }
      }
    }

    // Legacy: treat as notification (backwards compat with old CLI)
    if ('message' in payload) {
      this.showNotification(payload as ForgeTermNotification)
      return { ok: true }
    }

    return { ok: false, error: 'Unknown payload format' }
  }

  private showNotification(notif: ForgeTermNotification) {
    const title = notif.title || this.options.getProjectDisplayName(notif.projectPath ?? '') || 'ForgeTerm'
    const body = notif.sessionName
      ? `[${notif.sessionName}] ${notif.message}`
      : notif.message

    const n = new Notification({
      title,
      body,
      silent: notif.sound === false,
    })

    n.on('click', () => {
      if (notif.projectPath) {
        const win = this.options.findWindowForProject(notif.projectPath)
        if (win) {
          if (win.isMinimized()) win.restore()
          win.focus()
          if (notif.sessionId) {
            win.webContents.send('notification:focus-session', notif.sessionId)
          }
        }
      }
    })

    n.show()
  }

  isListening(): boolean {
    return this.server?.listening ?? false
  }

  stop() {
    this.server?.close()
    try {
      fs.unlinkSync(getSocketPath())
    } catch {
      // ignore
    }
  }
}
