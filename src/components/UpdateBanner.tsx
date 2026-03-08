import { useEffect, useState, useCallback } from 'react'
import type { UpdateInfo } from '../../shared/types'

interface UpdateBannerProps {
  accentColor: string
}

export function UpdateBanner({ accentColor }: UpdateBannerProps) {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check if there's already a cached result
    window.forgeterm.getLastUpdateCheck().then((info) => {
      if (info?.available) setUpdate(info)
    })
    // Listen for new update notifications from main process
    return window.forgeterm.onUpdateAvailable((info) => {
      if (info.available) {
        setUpdate(info)
        setDismissed(false)
      }
    })
  }, [])

  const handleAction = useCallback(() => {
    if (!update) return
    if (update.supportsAutoInstall) {
      window.forgeterm.applyUpdate()
    } else if (update.releaseUrl) {
      window.forgeterm.openExternal(update.releaseUrl)
    }
  }, [update])

  if (!update?.available || dismissed) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '5px 14px',
        background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      <span style={{ color: 'rgba(255,255,255,0.7)', flex: 1 }}>
        ForgeTerm <strong>v{update.latestVersion}</strong> is available
        {' '}
        <span style={{ opacity: 0.5 }}>(current: v{update.currentVersion})</span>
      </span>
      <button
        onClick={handleAction}
        style={{
          background: accentColor,
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '3px 10px',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {update.supportsAutoInstall ? 'Update now' : 'Download'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.35)',
          cursor: 'pointer',
          fontSize: 14,
          padding: '0 2px',
          lineHeight: 1,
        }}
        title="Dismiss"
      >
        x
      </button>
    </div>
  )
}
