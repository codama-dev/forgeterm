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
            const payload = JSON.parse(line) as ForgeTermNotification
            this.showNotification(payload)
            conn.write(JSON.stringify({ ok: true }) + '\n')
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

  stop() {
    this.server?.close()
    try {
      fs.unlinkSync(getSocketPath())
    } catch {
      // ignore
    }
  }
}
