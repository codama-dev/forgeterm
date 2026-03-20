import { app, BrowserWindow } from 'electron'
import express from 'express'
import { createServer, type Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import type { PtyManager } from './ptyManager'
import type { Workspace, RemoteStatus } from '../shared/types'

export type { RemoteStatus }

interface WindowState {
  projectPath: string
  ptyManager: PtyManager
  configWatcher?: fs.FSWatcher
}

interface RemoteServerOptions {
  windowStates: Map<number, WindowState>
  loadWorkspaces: () => Workspace[]
  loadConfig: (projectPath: string) => { projectName?: string; window?: { emoji?: string; accentColor?: string } } | null
}

function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

const AUTH_FAIL_WINDOW_MS = 60_000
const MAX_AUTH_FAILURES = 10

export class RemoteServer {
  private app: express.Express | null = null
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private tunnelProcess: ChildProcess | null = null
  private tunnelUrl: string | null = null
  private port: number | null = null
  private token: string | null = null
  private options: RemoteServerOptions
  private authFailures = new Map<string, { count: number; firstAt: number }>()

  constructor(options: RemoteServerOptions) {
    this.options = options
  }

  private getAuthFilePath(): string {
    return path.join(app.getPath('userData'), 'remote-auth.json')
  }

  private loadOrCreateToken(): string {
    const authPath = this.getAuthFilePath()
    try {
      const raw = fs.readFileSync(authPath, 'utf-8')
      const data = JSON.parse(raw)
      if (data.token) return data.token
    } catch { /* generate new */ }

    const token = crypto.randomBytes(32).toString('hex')
    fs.writeFileSync(authPath, JSON.stringify({ token }, null, 2), { encoding: 'utf-8', mode: 0o600 })
    return token
  }

  private getClientIp(req: express.Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown'
  }

  private isRateLimited(ip: string): boolean {
    const entry = this.authFailures.get(ip)
    if (!entry) return false
    if (Date.now() - entry.firstAt > AUTH_FAIL_WINDOW_MS) {
      this.authFailures.delete(ip)
      return false
    }
    return entry.count >= MAX_AUTH_FAILURES
  }

  private recordAuthFailure(ip: string) {
    const entry = this.authFailures.get(ip)
    if (!entry || Date.now() - entry.firstAt > AUTH_FAIL_WINDOW_MS) {
      this.authFailures.set(ip, { count: 1, firstAt: Date.now() })
    } else {
      entry.count++
    }
  }

  private authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    // Allow the login page and its assets without auth
    if (req.path === '/' || req.path === '/login' || req.path.startsWith('/static/')) {
      return next()
    }

    const ip = this.getClientIp(req)
    if (this.isRateLimited(ip)) {
      res.status(429).json({ error: 'Too many failed attempts. Try again later.' })
      return
    }

    const tokenFromQuery = req.query.token as string | undefined
    const authHeader = req.headers.authorization
    const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    const tokenFromCookie = this.parseCookieToken(req.headers.cookie)

    const providedToken = tokenFromQuery || tokenFromHeader || tokenFromCookie

    if (safeCompare(providedToken, this.token)) {
      return next()
    }

    this.recordAuthFailure(ip)
    res.status(401).json({ error: 'Unauthorized' })
  }

  private parseCookieToken(cookie?: string): string | undefined {
    if (!cookie) return undefined
    const match = cookie.match(/forgeterm_token=([^;]+)/)
    return match?.[1]
  }

  private getWindowList() {
    const windows: Array<{
      id: number
      projectPath: string
      projectName: string
      emoji?: string
      accentColor?: string
      sessions: Array<{ id: string; name: string; command?: string; running: boolean }>
    }> = []

    for (const [winId, state] of this.options.windowStates) {
      const win = BrowserWindow.fromId(winId)
      if (!win || win.isDestroyed() || !state.projectPath) continue

      const config = this.options.loadConfig(state.projectPath)
      windows.push({
        id: winId,
        projectPath: path.basename(state.projectPath),
        projectName: config?.projectName || path.basename(state.projectPath),
        emoji: config?.window?.emoji,
        accentColor: config?.window?.accentColor,
        sessions: state.ptyManager.getAllSessions(),
      })
    }

    return windows
  }

  async start(preferredPort = 0): Promise<void> {
    if (this.server?.listening) return

    this.token = this.loadOrCreateToken()

    const expressApp = express()
    this.app = expressApp

    // Security headers
    expressApp.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('X-Frame-Options', 'DENY')
      res.setHeader('Referrer-Policy', 'no-referrer')
      next()
    })

    // Auth middleware
    expressApp.use((req, res, next) => this.authMiddleware(req, res, next))

    // Serve static web client - find the files in dev or production
    const candidates = [
      path.join(__dirname, 'remote-web'),                     // dist-electron/remote-web (unlikely but check)
      path.join(__dirname, '..', 'electron', 'remote-web'),   // dev: project root / electron/remote-web
      path.join(process.resourcesPath || '', 'remote-web'),   // production: Resources/remote-web
    ]
    const staticDir = candidates.find(d => fs.existsSync(d)) || candidates[1]
    expressApp.use('/static', express.static(staticDir))

    // Serve index.html for root
    expressApp.get('/', (_req, res) => {
      const indexPath = path.join(staticDir, 'index.html')
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath)
      } else {
        res.status(404).send('Web client not found')
      }
    })

    // API: list windows
    expressApp.get('/api/windows', (_req, res) => {
      res.json(this.getWindowList())
    })

    // API: list workspaces
    expressApp.get('/api/workspaces', (_req, res) => {
      res.json(this.options.loadWorkspaces())
    })

    // API: kill session
    expressApp.post('/api/sessions/:winId/:sessionId/kill', (req, res) => {
      const winId = Number(req.params.winId)
      const sessionId = req.params.sessionId
      if (!Number.isInteger(winId) || winId <= 0 || !/^session-\d+$/.test(sessionId)) {
        return res.status(400).json({ error: 'Invalid parameters' })
      }
      const state = this.options.windowStates.get(winId)
      if (!state) return res.status(404).json({ error: 'Window not found' })
      state.ptyManager.kill(sessionId)
      res.json({ ok: true })
    })

    // API: restart session
    expressApp.post('/api/sessions/:winId/:sessionId/restart', (req, res) => {
      const winId = Number(req.params.winId)
      const sessionId = req.params.sessionId
      if (!Number.isInteger(winId) || winId <= 0 || !/^session-\d+$/.test(sessionId)) {
        return res.status(400).json({ error: 'Invalid parameters' })
      }
      const state = this.options.windowStates.get(winId)
      if (!state) return res.status(404).json({ error: 'Window not found' })

      const win = BrowserWindow.fromId(winId)

      state.ptyManager.restart(
        sessionId,
        (sid, data) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('session:data', sid, data)
          }
        },
        (sid, exitCode) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('session:exit', sid, exitCode)
          }
        },
      )

      res.json({ ok: true })
    })

    // API: auth check - sets secure cookie on success
    expressApp.get('/api/auth', (_req, res) => {
      res.setHeader('Set-Cookie',
        `forgeterm_token=${this.token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
      )
      res.json({ ok: true })
    })

    // Create HTTP server
    const httpServer = createServer(expressApp)
    this.server = httpServer

    // WebSocket server for terminal I/O
    this.wss = new WebSocketServer({ noServer: true })

    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`)

      // Auth check for WebSocket (timing-safe)
      const tokenFromQuery = url.searchParams.get('token')
      const authHeader = request.headers.authorization
      const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
      const tokenFromCookie = this.parseCookieToken(request.headers.cookie)
      const providedToken = tokenFromQuery || tokenFromHeader || tokenFromCookie

      if (!safeCompare(providedToken, this.token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      // Parse path: /api/terminal/:winId/:sessionId (strict format)
      const match = url.pathname.match(/^\/api\/terminal\/(\d+)\/(session-\d+)$/)
      if (!match) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
        socket.destroy()
        return
      }

      const winId = Number(match[1])
      const sessionId = match[2]

      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.handleTerminalConnection(ws, winId, sessionId)
      })
    })

    // Start listening
    return new Promise((resolve, reject) => {
      httpServer.listen(preferredPort, '127.0.0.1', () => {
        const addr = httpServer.address()
        this.port = typeof addr === 'object' && addr ? addr.port : null
        console.log(`[RemoteServer] Listening on port ${this.port}`)
        resolve()
      })
      httpServer.on('error', reject)
    })
  }

  private handleTerminalConnection(ws: WebSocket, winId: number, sessionId: string) {
    const state = this.options.windowStates.get(winId)
    if (!state) {
      ws.close(4004, 'Window not found')
      return
    }

    const session = state.ptyManager.getSession(sessionId)
    if (!session) {
      ws.close(4004, 'Session not found')
      return
    }

    // Forward PTY output to WebSocket
    const removeDataListener = state.ptyManager.addDataListener(sessionId, (_id, data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }))
      }
    })

    const removeExitListener = state.ptyManager.addExitListener(sessionId, (_id, exitCode) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', exitCode }))
      }
    })

    // Forward WebSocket input to PTY
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'input' && typeof msg.data === 'string') {
          state.ptyManager.write(sessionId, msg.data)
        } else if (msg.type === 'resize' && msg.cols && msg.rows) {
          state.ptyManager.resize(sessionId, msg.cols, msg.rows)
        }
      } catch { /* ignore bad messages */ }
    })

    ws.on('close', () => {
      removeDataListener()
      removeExitListener()
    })

    ws.on('error', () => {
      removeDataListener()
      removeExitListener()
    })

    // Send initial session info
    ws.send(JSON.stringify({
      type: 'info',
      session: {
        id: session.id,
        name: session.name,
        running: session.running,
      },
    }))
  }

  async startTunnel(): Promise<string | null> {
    if (!this.port) return null
    if (this.tunnelProcess) return this.tunnelUrl

    return new Promise((resolve) => {
      const args = ['tunnel', '--url', `http://127.0.0.1:${this.port}`, '--no-autoupdate']

      try {
        this.tunnelProcess = spawn('cloudflared', args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch {
        console.error('[RemoteServer] Failed to spawn cloudflared - is it installed?')
        resolve(null)
        return
      }

      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          console.error('[RemoteServer] Timed out waiting for cloudflared tunnel URL')
          resolve(null)
        }
      }, 15000)

      const parseUrl = (data: Buffer) => {
        if (resolved) return
        const text = data.toString()
        // cloudflared outputs the URL to stderr in the format: https://xxx.trycloudflare.com
        const urlMatch = text.match(/(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/)
        if (urlMatch) {
          resolved = true
          clearTimeout(timeout)
          this.tunnelUrl = urlMatch[1]
          console.log(`[RemoteServer] Tunnel URL: ${this.tunnelUrl}`)
          resolve(this.tunnelUrl)
        }
      }

      this.tunnelProcess.stdout?.on('data', parseUrl)
      this.tunnelProcess.stderr?.on('data', parseUrl)

      this.tunnelProcess.on('error', (err) => {
        console.error('[RemoteServer] cloudflared error:', err.message)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(null)
        }
      })

      this.tunnelProcess.on('exit', (code) => {
        console.log(`[RemoteServer] cloudflared exited with code ${code}`)
        this.tunnelProcess = null
        this.tunnelUrl = null
      })
    })
  }

  stopTunnel() {
    if (this.tunnelProcess) {
      this.tunnelProcess.kill()
      this.tunnelProcess = null
      this.tunnelUrl = null
    }
  }

  stop() {
    this.stopTunnel()

    // Close all WebSocket connections
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.close()
      }
      this.wss.close()
      this.wss = null
    }

    if (this.server) {
      this.server.close()
      this.server = null
    }

    this.app = null
    this.port = null
    console.log('[RemoteServer] Stopped')
  }

  getStatus(): RemoteStatus {
    return {
      running: this.server?.listening ?? false,
      port: this.port,
      tunnelUrl: this.tunnelUrl,
      token: this.token,
    }
  }

  getToken(): string | null {
    return this.token
  }
}
