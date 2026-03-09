import * as pty from 'node-pty'
import os from 'node:os'

interface PtySession {
  id: string
  name: string
  pty: pty.IPty | null
  command?: string
  cwd: string
  running: boolean
}

interface CreateSessionOptions {
  name: string
  command?: string
  cwd: string
  idle?: boolean
  socketPath?: string
  onData: (id: string, data: string) => void
  onExit: (id: string, exitCode: number) => void
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()
  private nextId = 1
  private dataCallbacks = new Map<string, (id: string, data: string) => void>()
  private exitCallbacks = new Map<string, (id: string, exitCode: number) => void>()
  private socketPath?: string

  createSession(options: CreateSessionOptions): string {
    const id = `session-${this.nextId++}`

    if (options.socketPath) this.socketPath = options.socketPath

    this.dataCallbacks.set(id, options.onData)
    this.exitCallbacks.set(id, options.onExit)

    if (options.idle) {
      this.sessions.set(id, {
        id,
        name: options.name,
        pty: null,
        command: options.command,
        cwd: options.cwd,
        running: false,
      })
      return id
    }

    const extraEnv: Record<string, string> = {
      FORGETERM: '1',
      FORGETERM_PROJECT_PATH: options.cwd,
      FORGETERM_SESSION_ID: id,
      FORGETERM_SESSION_NAME: options.name,
    }
    if (this.socketPath) extraEnv.FORGETERM_SOCKET = this.socketPath

    const proc = this.spawnShell(options.cwd, extraEnv)

    proc.onData((data) => {
      this.dataCallbacks.get(id)?.(id, data)
    })

    proc.onExit(({ exitCode }) => {
      const session = this.sessions.get(id)
      if (session) {
        session.running = false
        session.pty = null
      }
      this.exitCallbacks.get(id)?.(id, exitCode ?? 0)
    })

    // If there's a command, write it to stdin after the shell initializes
    if (options.command) {
      setTimeout(() => {
        proc.write(options.command + '\n')
      }, 150)
    }

    this.sessions.set(id, {
      id,
      name: options.name,
      pty: proc,
      command: options.command,
      cwd: options.cwd,
      running: true,
    })

    return id
  }

  private spawnShell(cwd: string, extraEnv?: Record<string, string>): pty.IPty {
    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')
    return pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: { ...process.env, ...extraEnv } as Record<string, string>,
    })
  }

  write(id: string, data: string) {
    this.sessions.get(id)?.pty?.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    try {
      this.sessions.get(id)?.pty?.resize(cols, rows)
    } catch {
      // ignore resize errors on dead PTY
    }
  }

  kill(id: string) {
    const session = this.sessions.get(id)
    if (session?.pty) {
      session.pty.kill()
      session.pty = null
      session.running = false
    }
  }

  removeSession(id: string) {
    this.kill(id)
    this.sessions.delete(id)
    this.dataCallbacks.delete(id)
    this.exitCallbacks.delete(id)
  }

  restart(id: string, onData: (id: string, data: string) => void, onExit: (id: string, exitCode: number) => void): string {
    const session = this.sessions.get(id)
    if (!session) return id

    // Kill existing PTY if still running
    if (session.pty) {
      session.pty.kill()
      session.pty = null
    }

    const extraEnv: Record<string, string> = {
      FORGETERM: '1',
      FORGETERM_PROJECT_PATH: session.cwd,
      FORGETERM_SESSION_ID: id,
      FORGETERM_SESSION_NAME: session.name,
    }
    if (this.socketPath) extraEnv.FORGETERM_SOCKET = this.socketPath

    const proc = this.spawnShell(session.cwd, extraEnv)

    this.dataCallbacks.set(id, onData)
    this.exitCallbacks.set(id, onExit)

    proc.onData((data) => {
      this.dataCallbacks.get(id)?.(id, data)
    })

    proc.onExit(({ exitCode }) => {
      const s = this.sessions.get(id)
      if (s) {
        s.running = false
        s.pty = null
      }
      this.exitCallbacks.get(id)?.(id, exitCode ?? 0)
    })

    // If there's a command, write it to stdin after the shell initializes
    if (session.command) {
      setTimeout(() => {
        proc.write(session.command + '\n')
      }, 150)
    }

    session.pty = proc
    session.running = true

    return id
  }

  rename(id: string, name: string) {
    const session = this.sessions.get(id)
    if (session) {
      session.name = name
    }
  }

  getSession(id: string) {
    return this.sessions.get(id)
  }

  killAll() {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
    this.sessions.clear()
    this.dataCallbacks.clear()
    this.exitCallbacks.clear()
  }
}
