import { app, BrowserWindow } from 'electron'
import express from 'express'
import { createServer, type Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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
const MAX_AUTH_FAILURES_PER_IP = 5
const MAX_AUTH_FAILURES_GLOBAL = 20
const MAX_WS_CONNECTIONS = 5

export class RemoteServer {
  private app: express.Express | null = null
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private tunnelProcess: ChildProcess | null = null
  private tunnelUrl: string | null = null
  private port: number | null = null
  private pin: string | null = null
  private sessionPath: string | null = null
  private options: RemoteServerOptions
  private authFailuresPerIp = new Map<string, { count: number; firstAt: number }>()
  private globalAuthFailures = { count: 0, firstAt: 0 }
  private activeWsConnections = 0
  private tunnelError: string | null = null
  private tunnelLogs: string[] = []
  private static readonly MAX_LOGS = 200

  constructor(options: RemoteServerOptions) {
    this.options = options
  }

  private addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    this.tunnelLogs.push(`[${timestamp}] ${message}`)
    if (this.tunnelLogs.length > RemoteServer.MAX_LOGS) {
      this.tunnelLogs = this.tunnelLogs.slice(-RemoteServer.MAX_LOGS)
    }
  }

  private resolveCloudflaredPath(): string | null {
    // 1. Check common Homebrew/system locations directly
    const candidates = [
      '/opt/homebrew/bin/cloudflared',
      '/usr/local/bin/cloudflared',
      '/usr/bin/cloudflared',
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        this.addLog(`Found cloudflared at ${p}`)
        return p
      }
    }
    // 2. Try 'which' with augmented PATH
    try {
      const result = execFileSync('which', ['cloudflared'], {
        encoding: 'utf-8',
        env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` },
        timeout: 3000,
      }).trim()
      if (result && fs.existsSync(result)) {
        this.addLog(`Found cloudflared via which: ${result}`)
        return result
      }
    } catch {}
    this.addLog('cloudflared not found in any known location')
    return null
  }

  private generatePin(): string {
    return String(crypto.randomInt(0, 10000)).padStart(4, '0')
  }

  private generateSessionPath(): string {
    return crypto.randomBytes(6).toString('hex')
  }

  private getClientIp(req: express.Request | { headers: Record<string, string | string[] | undefined> }): string {
    // CF-Connecting-IP is set by Cloudflare and cannot be spoofed by the client
    const cfIp = req.headers['cf-connecting-ip'] as string | undefined
    if (cfIp) return cfIp.trim()
    // Fallback to req.ip (do NOT trust x-forwarded-for - it's spoofable)
    return ('ip' in req ? (req as express.Request).ip : undefined) || 'unknown'
  }

  private isRateLimited(ip: string): boolean {
    const now = Date.now()
    // Global rate limit - protects against distributed attacks
    if (this.globalAuthFailures.count >= MAX_AUTH_FAILURES_GLOBAL) {
      if (now - this.globalAuthFailures.firstAt <= AUTH_FAIL_WINDOW_MS) {
        return true
      }
      this.globalAuthFailures = { count: 0, firstAt: 0 }
    }
    // Per-IP rate limit
    const entry = this.authFailuresPerIp.get(ip)
    if (!entry) return false
    if (now - entry.firstAt > AUTH_FAIL_WINDOW_MS) {
      this.authFailuresPerIp.delete(ip)
      return false
    }
    return entry.count >= MAX_AUTH_FAILURES_PER_IP
  }

  private recordAuthFailure(ip: string) {
    const now = Date.now()
    // Per-IP
    const entry = this.authFailuresPerIp.get(ip)
    if (!entry || now - entry.firstAt > AUTH_FAIL_WINDOW_MS) {
      this.authFailuresPerIp.set(ip, { count: 1, firstAt: now })
    } else {
      entry.count++
    }
    // Global
    if (now - this.globalAuthFailures.firstAt > AUTH_FAIL_WINDOW_MS) {
      this.globalAuthFailures = { count: 1, firstAt: now }
    } else {
      this.globalAuthFailures.count++
    }
  }

  private authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    // Allow login page, static assets, and auth endpoint without cookie
    if (req.path === '/' || req.path === '/api/auth' || req.path.startsWith('/static/')) {
      return next()
    }

    // Cookie-only auth for all other routes
    const pinFromCookie = this.parseCookiePin(req.headers.cookie)
    if (safeCompare(pinFromCookie, this.pin)) {
      return next()
    }

    res.status(401).json({ error: 'Unauthorized' })
  }

  private parseCookiePin(cookie?: string): string | undefined {
    if (!cookie) return undefined
    const match = cookie.match(/forgeterm_pin=([^;]+)/)
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

    this.pin = this.generatePin()
    this.sessionPath = this.generateSessionPath()
    this.activeWsConnections = 0
    this.authFailuresPerIp.clear()
    this.globalAuthFailures = { count: 0, firstAt: 0 }

    const expressApp = express()
    this.app = expressApp

    // Security headers for all requests
    expressApp.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('X-Frame-Options', 'DENY')
      res.setHeader('Referrer-Policy', 'no-referrer')
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "connect-src 'self' wss: ws:",
        "img-src 'self' data:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '))
      next()
    })

    // All routes are behind the session path
    const router = express.Router()
    router.use((req, res, next) => this.authMiddleware(req, res, next))

    // Serve static web client
    const candidates = [
      path.join(__dirname, 'remote-web'),
      path.join(__dirname, '..', 'electron', 'remote-web'),
      path.join(process.resourcesPath || '', 'remote-web'),
    ]
    const staticDir = candidates.find(d => fs.existsSync(d)) || candidates[1]
    router.use('/static', express.static(staticDir))

    // Serve index.html
    router.get('/', (req, res) => {
      // Ensure trailing slash so relative URLs resolve correctly
      if (!req.originalUrl.endsWith('/')) {
        return res.redirect(301, req.originalUrl + '/')
      }
      const indexPath = path.join(staticDir, 'index.html')
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath)
      } else {
        res.status(404).send('Web client not found')
      }
    })

    // Auth endpoint - validates PIN, sets HttpOnly cookie
    router.post('/api/auth', express.json({ limit: '256b' }), (req, res) => {
      const ip = this.getClientIp(req)
      if (this.isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many failed attempts. Try again later.' })
      }

      const providedPin = typeof req.body?.pin === 'string' ? req.body.pin : ''
      if (safeCompare(providedPin, this.pin)) {
        res.setHeader('Set-Cookie',
          `forgeterm_pin=${this.pin}; HttpOnly; Secure; SameSite=Strict; Path=/s/${this.sessionPath}/; Max-Age=86400`
        )
        return res.json({ ok: true })
      }

      this.recordAuthFailure(ip)
      res.status(401).json({ error: 'Invalid PIN' })
    })

    // API: list windows
    router.get('/api/windows', (_req, res) => {
      res.json(this.getWindowList())
    })

    // API: list workspaces
    router.get('/api/workspaces', (_req, res) => {
      res.json(this.options.loadWorkspaces())
    })

    // API: kill session
    router.post('/api/sessions/:winId/:sessionId/kill', (req, res) => {
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
    router.post('/api/sessions/:winId/:sessionId/restart', (req, res) => {
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

    // Mount router under session path
    expressApp.use(`/s/${this.sessionPath}`, router)

    // Everything else returns generic 404
    expressApp.use((_req, res) => {
      res.status(404).end()
    })

    // Create HTTP server
    const httpServer = createServer(expressApp)
    this.server = httpServer

    // WebSocket server for terminal I/O
    this.wss = new WebSocketServer({ noServer: true })

    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`)

      // Verify session path
      const expectedPrefix = `/s/${this.sessionPath}/api/terminal/`
      if (!url.pathname.startsWith(expectedPrefix)) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
        socket.destroy()
        return
      }

      // Cookie-only auth for WebSocket
      const pinFromCookie = this.parseCookiePin(request.headers.cookie)
      if (!safeCompare(pinFromCookie, this.pin)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      // Enforce connection limit
      if (this.activeWsConnections >= MAX_WS_CONNECTIONS) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
        socket.destroy()
        return
      }

      // Parse winId/sessionId from path after prefix
      const remaining = url.pathname.slice(expectedPrefix.length)
      const match = remaining.match(/^(\d+)\/(session-\d+)$/)
      if (!match) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
        socket.destroy()
        return
      }

      const winId = Number(match[1])
      const sessionId = match[2]

      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.activeWsConnections++
        let counted = true
        const release = () => {
          if (counted) { this.activeWsConnections--; counted = false }
        }
        ws.on('close', release)
        ws.on('error', release)
        this.handleTerminalConnection(ws, winId, sessionId)
      })
    })

    // Start listening
    return new Promise((resolve, reject) => {
      httpServer.listen(preferredPort, '127.0.0.1', () => {
        const addr = httpServer.address()
        this.port = typeof addr === 'object' && addr ? addr.port : null
        console.log(`[RemoteServer] Listening on port ${this.port}, session path: /s/${this.sessionPath}/`)
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
        // Reject oversized messages (max 64KB - generous for terminal input)
        const rawStr = raw.toString()
        if (rawStr.length > 65536) return
        const msg = JSON.parse(rawStr)
        if (msg.type === 'input' && typeof msg.data === 'string') {
          state.ptyManager.write(sessionId, msg.data)
        } else if (msg.type === 'resize') {
          const cols = Number(msg.cols)
          const rows = Number(msg.rows)
          if (cols > 0 && cols <= 500 && rows > 0 && rows <= 200) {
            state.ptyManager.resize(sessionId, cols, rows)
          }
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

    this.tunnelError = null
    this.tunnelLogs = []

    // Resolve cloudflared binary
    const cloudflaredPath = this.resolveCloudflaredPath()
    if (!cloudflaredPath) {
      this.tunnelError = 'cloudflared not found. Install it: brew install cloudflared'
      this.addLog('ERROR: ' + this.tunnelError)
      return null
    }

    // Try up to 2 attempts (initial + 1 retry)
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) {
        this.addLog(`Retry attempt ${attempt}...`)
        await new Promise((r) => setTimeout(r, 2000))
      }

      const result = await this.attemptTunnel(cloudflaredPath)
      if (result) return result

      // Don't retry if cloudflared crashed immediately (likely a config/binary issue)
      if ((this.tunnelError as string | null)?.includes('exited immediately')) break
    }

    return null
  }

  private attemptTunnel(cloudflaredPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const args = ['tunnel', '--url', `http://127.0.0.1:${this.port}`, '--no-autoupdate']
      this.addLog(`Starting: ${cloudflaredPath} ${args.join(' ')}`)

      try {
        this.tunnelProcess = spawn(cloudflaredPath, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        this.tunnelError = `Failed to launch cloudflared: ${msg}`
        this.addLog('ERROR: ' + this.tunnelError)
        console.error('[RemoteServer]', this.tunnelError)
        resolve(null)
        return
      }

      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.tunnelError = 'Timed out waiting for tunnel URL (30s). Check logs for details.'
          this.addLog('ERROR: ' + this.tunnelError)
          console.error('[RemoteServer]', this.tunnelError)
          // Kill the timed-out process
          if (this.tunnelProcess) {
            this.tunnelProcess.kill()
            this.tunnelProcess = null
          }
          resolve(null)
        }
      }, 30000)

      const handleOutput = (data: Buffer) => {
        const text = data.toString().trim()
        if (!text) return
        // Log each line
        for (const line of text.split('\n')) {
          const trimmed = line.trim()
          if (trimmed) this.addLog(trimmed)
        }
        if (resolved) return
        const urlMatch = text.match(/(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/)
        if (urlMatch) {
          resolved = true
          clearTimeout(timeout)
          this.tunnelUrl = urlMatch[1]
          this.tunnelError = null
          this.addLog(`Tunnel established: ${this.tunnelUrl}`)
          console.log(`[RemoteServer] Tunnel URL: ${this.tunnelUrl}`)
          resolve(this.tunnelUrl)
        }
      }

      this.tunnelProcess.stdout?.on('data', handleOutput)
      this.tunnelProcess.stderr?.on('data', handleOutput)

      this.tunnelProcess.on('error', (err) => {
        this.addLog(`Process error: ${err.message}`)
        console.error('[RemoteServer] cloudflared error:', err.message)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          this.tunnelError = `cloudflared error: ${err.message}`
          resolve(null)
        }
      })

      this.tunnelProcess.on('exit', (code) => {
        this.addLog(`Process exited with code ${code}`)
        console.log(`[RemoteServer] cloudflared exited with code ${code}`)
        this.tunnelProcess = null
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          this.tunnelError = code !== 0
            ? `cloudflared exited immediately with code ${code}. Check logs for details.`
            : 'cloudflared exited unexpectedly'
          resolve(null)
        } else {
          // Tunnel was running and then exited - update state
          this.tunnelUrl = null
          this.tunnelError = `Tunnel disconnected (exit code ${code})`
        }
      })
    })
  }

  stopTunnel() {
    if (this.tunnelProcess) {
      this.addLog('Stopping tunnel...')
      this.tunnelProcess.kill()
      this.tunnelProcess = null
      this.tunnelUrl = null
    }
  }

  stop() {
    this.stopTunnel()

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
    this.pin = null
    this.sessionPath = null
    this.activeWsConnections = 0
    this.tunnelError = null
    this.tunnelLogs = []
    console.log('[RemoteServer] Stopped')
  }

  getStatus(): RemoteStatus {
    return {
      running: this.server?.listening ?? false,
      port: this.port,
      tunnelUrl: this.tunnelUrl,
      pin: this.pin,
      sessionPath: this.sessionPath,
      tunnelError: this.tunnelError,
      tunnelLogs: [...this.tunnelLogs],
    }
  }
}
