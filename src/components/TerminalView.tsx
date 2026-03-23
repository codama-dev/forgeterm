import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import type { ForgeTermConfig } from '../../shared/types'
import { useSessionStore } from '../store/sessionStore'

interface TerminalViewProps {
  sessionId: string
  active: boolean
  config: ForgeTermConfig | null
}

interface DropMenuState {
  x: number
  y: number
  files: string[]
}

const terminals = new Map<string, { terminal: Terminal; fitAddon: FitAddon; searchAddon: SearchAddon }>()

// Activity tracking: after 5s of silence, transition from 'working' to 'unread'
const ACTIVITY_TIMEOUT_MS = 5000
const activityTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Single shared data listener - dispatches to the right terminal by session ID
const dataHandlers = new Map<string, (data: string) => void>()
let unsubSharedDataListener: (() => void) | null = null

// Search toggle registry - allows App to trigger search via Cmd+F
const searchToggles = new Map<string, () => void>()

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

function quotePath(p: string): string {
  return `"${p}"`
}

async function executeDrop(sessionId: string, action: 'path' | 'content' | 'copy', files: string[]) {
  for (const filePath of files) {
    if (action === 'path') {
      window.forgeterm.writeToSession(sessionId, quotePath(filePath) + ' ')
    } else if (action === 'content') {
      const result = await window.forgeterm.readFileContent(filePath)
      if (result.isBinary) {
        window.forgeterm.writeToSession(sessionId, quotePath(filePath) + ' ')
      } else {
        window.forgeterm.writeToSession(sessionId, result.content)
      }
    } else if (action === 'copy') {
      const result = await window.forgeterm.copyFileToProject(filePath)
      window.forgeterm.writeToSession(sessionId, quotePath(result.relativePath) + ' ')
    }
  }
}

export function TerminalView({ sessionId, active, config }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  const configRef = useRef(config)
  const [isScrolledUp, setIsScrolledUp] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [dropMenu, setDropMenu] = useState<DropMenuState | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ index: number; count: number } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isAtBottomRef = useRef(true)
  const dragCountRef = useRef(0)
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

    const searchAddon = new SearchAddon()
    terminal.loadAddon(searchAddon)

    // Clickable URLs - opens in default browser
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.forgeterm.openExternal(uri)
    })
    terminal.loadAddon(webLinksAddon)

    terminal.open(containerRef.current)

    // GPU-accelerated rendering (falls back to default canvas if WebGL unavailable)
    let webglAddon: WebglAddon | null = null
    try {
      webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        try { webglAddon?.dispose() } catch { /* already gone */ }
        webglAddon = null
      })
      terminal.loadAddon(webglAddon)
    } catch {
      webglAddon = null
    }

    // Fit after opening
    requestAnimationFrame(() => {
      fitAddon.fit()
      terminal.scrollToBottom()
      window.forgeterm.resizeSession(sessionId, terminal.cols, terminal.rows)
    })

    // Register data handler via shared listener (1 IPC listener for all terminals)
    ensureSharedDataListener()
    dataHandlers.set(sessionId, (data) => {
      terminal.write(data, () => {
        // Check the CURRENT value of isAtBottomRef, not a captured snapshot.
        // terminal.write() queues data for processing in an animation frame,
        // so the user may have scrolled up between when write() was called
        // and when this callback fires. Checking the ref here avoids the race
        // condition that yanks the user back to the bottom.
        if (isAtBottomRef.current) {
          terminal.scrollToBottom()
        }
      })

      // Activity tracking: mark non-active sessions as working
      const store = useSessionStore.getState()
      if (store.activeSessionId !== sessionId) {
        store.markSessionWorking(sessionId)
        const existing = activityTimers.get(sessionId)
        if (existing) clearTimeout(existing)
        activityTimers.set(sessionId, setTimeout(() => {
          const s = useSessionStore.getState()
          const session = s.sessions.find((sess) => sess.id === sessionId)
          if (session?.activityStatus === 'working' && s.activeSessionId !== sessionId) {
            s.setActivityStatus(sessionId, 'unread')
          }
          activityTimers.delete(sessionId)
        }, ACTIVITY_TIMEOUT_MS))
      }
    })

    // Write user input to PTY
    terminal.onData((data) => {
      window.forgeterm.writeToSession(sessionId, data)
    })

    // Handle resize with throttling - preserve scroll position
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) return
      resizeTimer = setTimeout(() => {
        resizeTimer = null
        if (containerRef.current?.offsetParent !== null) {
          fitAddon.fit()
          if (isAtBottomRef.current) {
            terminal.scrollToBottom()
          }
          window.forgeterm.resizeSession(sessionId, terminal.cols, terminal.rows)
        }
      }, 50)
    })
    resizeObserver.observe(containerRef.current)

    // Drag-and-drop
    const container = containerRef.current
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCountRef.current++
      if (dragCountRef.current === 1) {
        setIsDraggingOver(true)
      }
    }
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCountRef.current--
      if (dragCountRef.current <= 0) {
        dragCountRef.current = 0
        setIsDraggingOver(false)
      }
    }
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCountRef.current = 0
      setIsDraggingOver(false)

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const paths = Array.from(files)
        .map((f) => (f as any).path as string)
        .filter(Boolean)
      if (paths.length === 0) return

      const behavior = configRef.current?.dragDropBehavior ?? 'ask'
      if (behavior !== 'ask') {
        executeDrop(sessionId, behavior, paths)
        return
      }

      // Show the action menu at the drop position
      const rect = container.getBoundingClientRect()
      setDropMenu({
        x: Math.min(e.clientX - rect.left, rect.width - 200),
        y: Math.min(e.clientY - rect.top, rect.height - 120),
        files: paths,
      })
    }
    container.addEventListener('dragenter', handleDragEnter)
    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('dragleave', handleDragLeave)
    container.addEventListener('drop', handleDrop)

    // Detect user scroll-up via wheel events to reliably cancel stick-to-bottom.
    // Wheel events only fire on user input (not programmatic scrolls), so this
    // prevents the auto-scroll from fighting the user during rapid output.
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && isAtBottomRef.current) {
        isAtBottomRef.current = false
        setIsScrolledUp(true)
      }
    }
    container.addEventListener('wheel', handleWheel, { passive: true })

    // Track scroll position to show/hide scroll-to-bottom button
    const scrollDisposable = terminal.onScroll(() => {
      const isAtBottom = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY
      isAtBottomRef.current = isAtBottom
      setIsScrolledUp(!isAtBottom)
    })

    terminals.set(sessionId, { terminal, fitAddon, searchAddon })

    cleanupRef.current = () => {
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('dragenter', handleDragEnter)
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('dragleave', handleDragLeave)
      container.removeEventListener('drop', handleDrop)
      scrollDisposable.dispose()
      dataHandlers.delete(sessionId)
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeObserver.disconnect()
      // Dispose WebGL addon first to avoid _isDisposed crash during terminal teardown
      if (webglAddon) {
        try { webglAddon.dispose() } catch { /* already disposed */ }
        webglAddon = null
      }
      terminal.dispose()
      terminals.delete(sessionId)
      const actTimer = activityTimers.get(sessionId)
      if (actTimer) clearTimeout(actTimer)
      activityTimers.delete(sessionId)
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
      // Clear activity state when user views this session
      useSessionStore.getState().setActivityStatus(sessionId, 'idle')
      const actTimer = activityTimers.get(sessionId)
      if (actTimer) clearTimeout(actTimer)
      activityTimers.delete(sessionId)

      const entry = terminals.get(sessionId)
      if (entry) {
        requestAnimationFrame(() => {
          entry.fitAddon.fit()
          // Force full re-render - needed when transitioning from display:none
          entry.terminal.refresh(0, entry.terminal.rows - 1)
          window.forgeterm.resizeSession(sessionId, entry.terminal.cols, entry.terminal.rows)
          entry.terminal.scrollToBottom()
          isAtBottomRef.current = true
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

  // Dismiss drop menu or search on Escape
  useEffect(() => {
    if (!dropMenu && !showSearch) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropMenu(null)
        if (showSearch) {
          setShowSearch(false)
          const entry = terminals.get(sessionId)
          entry?.searchAddon.clearDecorations()
          entry?.terminal.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [dropMenu, showSearch, sessionId])

  const handleScrollToBottom = useCallback(() => {
    const entry = terminals.get(sessionId)
    if (entry) {
      entry.terminal.scrollToBottom()
      isAtBottomRef.current = true
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

  const searchDecorations = {
    matchBackground: '#facc1540',
    matchBorder: '#facc1580',
    activeMatchBackground: '#facc15',
    activeMatchBorder: '#facc15',
    activeMatchColorOverviewRuler: '#facc15',
    matchOverviewRuler: '#facc1560',
  }

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    const entry = terminals.get(sessionId)
    if (!entry) return
    if (query) {
      // Start from bottom (most recent output) so latest matches show first
      entry.searchAddon.findPrevious(query, { regex: false, caseSensitive: false, decorations: searchDecorations })
    } else {
      entry.searchAddon.clearDecorations()
      setSearchResults(null)
    }
  }, [sessionId])

  const handleSearchNext = useCallback(() => {
    const entry = terminals.get(sessionId)
    if (entry && searchQuery) {
      entry.searchAddon.findNext(searchQuery, { regex: false, caseSensitive: false, decorations: searchDecorations })
    }
  }, [sessionId, searchQuery])

  const handleSearchPrev = useCallback(() => {
    const entry = terminals.get(sessionId)
    if (entry && searchQuery) {
      entry.searchAddon.findPrevious(searchQuery, { regex: false, caseSensitive: false, decorations: searchDecorations })
    }
  }, [sessionId, searchQuery])

  const handleCloseSearch = useCallback(() => {
    setShowSearch(false)
    setSearchResults(null)
    const entry = terminals.get(sessionId)
    if (entry) {
      entry.searchAddon.clearDecorations()
      entry.terminal.focus()
    }
  }, [sessionId])

  // Expose toggle for Cmd+F from App
  useEffect(() => {
    if (active) {
      searchToggles.set(sessionId, () => {
        setShowSearch(prev => {
          if (prev) {
            const entry = terminals.get(sessionId)
            entry?.searchAddon.clearDecorations()
            entry?.terminal.focus()
            return false
          }
          return true
        })
      })
    }
    return () => {
      if (!active) searchToggles.delete(sessionId)
    }
  }, [active, sessionId])

  // Focus search input when shown + subscribe to result count changes
  useEffect(() => {
    if (showSearch) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
      const entry = terminals.get(sessionId)
      if (entry) {
        const dispose = entry.searchAddon.onDidChangeResults((e) => {
          if (e.resultCount === 0 && !searchQuery) {
            setSearchResults(null)
          } else {
            setSearchResults({ index: e.resultIndex, count: e.resultCount })
          }
        })
        return () => dispose.dispose()
      }
    } else {
      setSearchResults(null)
    }
  }, [showSearch, sessionId])

  const handleDropAction = useCallback((action: 'path' | 'content' | 'copy') => {
    if (!dropMenu) return
    executeDrop(sessionId, action, dropMenu.files)
    setDropMenu(null)
    terminals.get(sessionId)?.terminal.focus()
  }, [sessionId, dropMenu])

  return (
    <div className="terminal-wrapper" style={{ display: active ? 'block' : 'none' }}>
      {active && showSearch && (
        <div className="terminal-search-bar">
          <input
            ref={searchInputRef}
            className="terminal-search-input"
            type="text"
            placeholder="Find..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.shiftKey ? handleSearchPrev() : handleSearchNext()
              }
              if (e.key === 'Escape') {
                handleCloseSearch()
              }
            }}
          />
          {searchQuery && searchResults != null && (
            <span className="terminal-search-count" style={{
              color: searchResults.count === 0 ? '#f87171' : undefined,
            }}>
              {searchResults.count === 0
                ? 'No results'
                : `${searchResults.index + 1} of ${searchResults.count}`}
            </span>
          )}
          <button className="terminal-search-nav-btn" onClick={handleSearchPrev} title="Previous (Shift+Enter)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L2 6l4 4M2 6h8" />
            </svg>
          </button>
          <button className="terminal-search-nav-btn" onClick={handleSearchNext} title="Next (Enter)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 10l4-4-4-4M10 6H2" />
            </svg>
          </button>
          <button className="terminal-search-nav-btn" onClick={handleCloseSearch} title="Close (Esc)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
      )}
      <div ref={containerRef} className="terminal-container" />
      {active && isDraggingOver && (
        <div className="terminal-drag-overlay">
          <span className="terminal-drag-overlay-text">Drop file</span>
        </div>
      )}
      {active && dropMenu && (
        <>
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 99 }}
            onClick={() => setDropMenu(null)}
          />
          <div
            className="drop-action-menu"
            style={{ left: dropMenu.x, top: dropMenu.y }}
          >
            <button onClick={() => handleDropAction('path')}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 13V3h5l3 3v7" />
                <path d="M9 3v3h3" />
              </svg>
              Paste path
            </button>
            <button onClick={() => handleDropAction('content')}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 7h6M5 9h4M5 11h5" />
                <rect x="2" y="2" width="12" height="12" rx="2" />
              </svg>
              Paste content
            </button>
            <button onClick={() => handleDropAction('copy')}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2v8M5 7l3 3 3-3" />
                <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
              </svg>
              Copy to project
            </button>
          </div>
        </>
      )}
      {active && isScrolledUp && (
        <div className="terminal-scroll-controls">
          <button
            className="terminal-scroll-btn"
            onClick={handleScrollToTop}
            title="Scroll to top (Cmd+Up)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2.5L2.5 7.5M7 2.5L11.5 7.5M7 2.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="terminal-scroll-btn terminal-stick-btn"
            onClick={handleScrollToBottom}
            title="Follow output (Cmd+Down)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 10L3.5 6.5M7 10L10.5 6.5M7 10V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="3" y1="12.5" x2="11" y2="12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="stick-label">Follow</span>
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

export function selectAllTerminal(sessionId: string) {
  const entry = terminals.get(sessionId)
  if (entry) {
    entry.terminal.selectAll()
  }
}

export function toggleTerminalSearch(sessionId: string) {
  searchToggles.get(sessionId)?.()
}
