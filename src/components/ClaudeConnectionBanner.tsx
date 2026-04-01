import { useState, useEffect, useCallback } from 'react'
import type { ClaudeConnectionStatus } from '../../shared/types'

interface ClaudeConnectionBannerProps {
  accentColor: string
}

export function ClaudeConnectionBanner({ accentColor }: ClaudeConnectionBannerProps) {
  const [status, setStatus] = useState<ClaudeConnectionStatus | null>(null)
  const [copied, setCopied] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.forgeterm.checkClaudeConnection().then(setStatus)
  }, [])

  const handleCopy = useCallback(async () => {
    const prompt = await window.forgeterm.getClaudeSetupPrompt()
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // fallback
    }
  }, [])

  if (dismissed || !status || (status.connected && !status.needsUpdate)) return null

  const isUpdate = status.connected && status.needsUpdate
  const label = isUpdate
    ? `ForgeTerm updated to v${status.currentVersion} - re-sync Claude`
    : 'Connect Claude Code to ForgeTerm'

  return (
    <button
      className="claude-connection-banner"
      onClick={handleCopy}
      style={{ '--banner-color': accentColor } as React.CSSProperties}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isUpdate ? (
          <>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </>
        ) : (
          <>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </>
        )}
      </svg>
      <span>{copied ? 'Prompt copied! Paste it to Claude Code.' : label}</span>
      {!copied && (
        <span className="claude-banner-action">Click to copy prompt</span>
      )}
      <button
        className="claude-banner-dismiss"
        onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
        title="Dismiss"
      >
        x
      </button>
    </button>
  )
}
