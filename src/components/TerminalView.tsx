import { useEffect, useRef, useCallback, useState } from 'react'
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

// Single shared data listener - dispatches to the right terminal by session ID
const dataHandlers = new Map<string, (data: string) => void>()
let unsubSharedDataListener: (() => void) | null = null

function ensureSharedDataListener() {
  if (unsubSharedDataListener) return
  unsubSharedDataListener = window.forgeterm.onSessionData((id, data) => {
    dataHandlers.get(id)?.(data)
  })
}

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
  const cleanupRef = useRef<(() => void) | null>(null)
  const configRef = useRef(config)
  const [isScrolledUp, setIsScrolledUp] = useState(false)
  configRef.current = config

  const initTerminal = useCallback(() => {
    if (!containerRef.current || initializedRef.current) return
    if (terminals.has(sessionId)) return
    initializedRef.current = true

    const currentConfig = configRef.current
    const terminal = new Terminal({
      theme: getThemeOptions(currentConfig),
      fontFamily: currentConfig?.font?.family ?? 'JetBrains Mono, Menlo, Monaco, monospace',
      fontSize: currentConfig?.font?.size ?? 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)

    // Fit after opening
    requestAnimationFrame(() => {
      fitAddon.fit()
      window.forgeterm.resizeSession(sessionId, terminal.cols, terminal.rows)
    })

    // Register data handler via shared listener (1 IPC listener for all terminals)
    ensureSharedDataListener()
    dataHandlers.set(sessionId, (data) => terminal.write(data))

    // Write user input to PTY
    terminal.onData((data) => {
      window.forgeterm.writeToSession(sessionId, data)
    })

    // Handle resize with throttling
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) return
      resizeTimer = setTimeout(() => {
        resizeTimer = null
        if (containerRef.current?.offsetParent !== null) {
          fitAddon.fit()
          window.forgeterm.resizeSession(sessionId, terminal.cols, terminal.rows)
        }
      }, 50)
    })
    resizeObserver.observe(containerRef.current)

    // Drag-and-drop: insert file paths into terminal
    const container = containerRef.current
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        const paths = Array.from(files)
          .map((f) => {
            const p = (f as any).path as string
            return p?.includes(' ') ? `'${p}'` : p
          })
          .filter(Boolean)
          .join(' ')
        if (paths) {
          window.forgeterm.writeToSession(sessionId, paths)
        }
      }
    }
    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('drop', handleDrop)

    // Track scroll position to show/hide scroll-to-bottom button
    const scrollDisposable = terminal.onScroll(() => {
      const isAtBottom = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY
      setIsScrolledUp(!isAtBottom)
    })

    terminals.set(sessionId, { terminal, fitAddon })

    cleanupRef.current = () => {
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('drop', handleDrop)
      scrollDisposable.dispose()
      dataHandlers.delete(sessionId)
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeObserver.disconnect()
      terminal.dispose()
      terminals.delete(sessionId)
    }
  }, [sessionId])

  useEffect(() => {
    initTerminal()
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
      initializedRef.current = false
    }
  }, [initTerminal])

  // Fit and scroll to bottom when becoming active
  useEffect(() => {
    if (active) {
      const entry = terminals.get(sessionId)
      if (entry) {
        requestAnimationFrame(() => {
          entry.fitAddon.fit()
          window.forgeterm.resizeSession(sessionId, entry.terminal.cols, entry.terminal.rows)
          entry.terminal.scrollToBottom()
          setIsScrolledUp(false)
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

  const handleScrollToBottom = useCallback(() => {
    const entry = terminals.get(sessionId)
    if (entry) {
      entry.terminal.scrollToBottom()
      setIsScrolledUp(false)
      entry.terminal.focus()
    }
  }, [sessionId])

  const handleScrollToTop = useCallback(() => {
    const entry = terminals.get(sessionId)
    if (entry) {
      entry.terminal.scrollToTop()
      entry.terminal.focus()
    }
  }, [sessionId])

  return (
    <div className="terminal-wrapper" style={{ display: active ? 'block' : 'none' }}>
      <div ref={containerRef} className="terminal-container" />
      {active && isScrolledUp && (
        <div className="terminal-scroll-controls">
          <button
            className="terminal-scroll-btn"
            onClick={handleScrollToTop}
            title="Scroll to top"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2.5L2.5 7.5M7 2.5L11.5 7.5M7 2.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="terminal-scroll-btn"
            onClick={handleScrollToBottom}
            title="Scroll to bottom"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 11.5L2.5 6.5M7 11.5L11.5 6.5M7 11.5V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export function clearTerminal(sessionId: string) {
  const entry = terminals.get(sessionId)
  if (entry) {
    entry.terminal.clear()
  }
}

export function scrollTerminalToTop(sessionId: string) {
  const entry = terminals.get(sessionId)
  if (entry) {
    entry.terminal.scrollToTop()
  }
}

export function scrollTerminalToBottom(sessionId: string) {
  const entry = terminals.get(sessionId)
  if (entry) {
    entry.terminal.scrollToBottom()
  }
}
