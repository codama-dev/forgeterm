import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ForgeTermConfig } from '../../shared/types'

interface TerminalViewProps {
  sessionId: string
  active: boolean
  config: ForgeTermConfig | null
}

const terminals = new Map<string, { terminal: Terminal; fitAddon: FitAddon }>()

function getThemeOptions(config: ForgeTermConfig | null) {
  const theme = config?.theme
  return {
    background: theme?.background ?? '#0f172a',
    foreground: theme?.foreground ?? '#e2e8f0',
    cursor: theme?.cursor ?? '#38bdf8',
    selection: theme?.selection ?? 'rgba(56, 189, 248, 0.3)',
    black: theme?.black ?? '#1e293b',
    red: theme?.red ?? '#f87171',
    green: theme?.green ?? '#4ade80',
    yellow: theme?.yellow ?? '#facc15',
    blue: theme?.blue ?? '#60a5fa',
    magenta: theme?.magenta ?? '#c084fc',
    cyan: theme?.cyan ?? '#22d3ee',
    white: theme?.white ?? '#f1f5f9',
  }
}

export function TerminalView({ sessionId, active, config }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)

  const initTerminal = useCallback(() => {
    if (!containerRef.current || initializedRef.current) return
    if (terminals.has(sessionId)) return
    initializedRef.current = true

    const terminal = new Terminal({
      theme: getThemeOptions(config),
      fontFamily: config?.font?.family ?? 'JetBrains Mono, Menlo, Monaco, monospace',
      fontSize: config?.font?.size ?? 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)

    // Fit after opening
    requestAnimationFrame(() => {
      fitAddon.fit()
      window.forgeterm.resizeSession(sessionId, terminal.cols, terminal.rows)
    })

    // Write data from PTY to terminal
    const unsubData = window.forgeterm.onSessionData((id, data) => {
      if (id === sessionId) {
        terminal.write(data)
      }
    })

    // Write user input to PTY
    terminal.onData((data) => {
      window.forgeterm.writeToSession(sessionId, data)
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current?.offsetParent !== null) {
        fitAddon.fit()
        window.forgeterm.resizeSession(sessionId, terminal.cols, terminal.rows)
      }
    })
    resizeObserver.observe(containerRef.current)

    terminals.set(sessionId, { terminal, fitAddon })

    // Cleanup function stored for later
    const cleanup = () => {
      unsubData()
      resizeObserver.disconnect()
      terminal.dispose()
      terminals.delete(sessionId)
    }
    ;(containerRef.current as any).__cleanup = cleanup
  }, [sessionId, config])

  useEffect(() => {
    initTerminal()
    return () => {
      if (containerRef.current) {
        (containerRef.current as any).__cleanup?.()
      }
      initializedRef.current = false
    }
  }, [initTerminal])

  // Fit when becoming active
  useEffect(() => {
    if (active) {
      const entry = terminals.get(sessionId)
      if (entry) {
        requestAnimationFrame(() => {
          entry.fitAddon.fit()
          window.forgeterm.resizeSession(sessionId, entry.terminal.cols, entry.terminal.rows)
          entry.terminal.focus()
        })
      }
    }
  }, [active, sessionId])

  // Update theme when config changes
  useEffect(() => {
    const entry = terminals.get(sessionId)
    if (entry) {
      entry.terminal.options.theme = getThemeOptions(config)
      if (config?.font?.family) {
        entry.terminal.options.fontFamily = config.font.family
      }
      if (config?.font?.size) {
        entry.terminal.options.fontSize = config.font.size
      }
    }
  }, [config, sessionId])

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ display: active ? 'block' : 'none' }}
    />
  )
}

export function clearTerminal(sessionId: string) {
  const entry = terminals.get(sessionId)
  if (entry) {
    entry.terminal.clear()
  }
}
