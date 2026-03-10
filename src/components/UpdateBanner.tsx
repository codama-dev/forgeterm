import { useEffect, useState, useCallback } from 'react'
import type { UpdateInfo } from '../../shared/types'

interface UpdateBannerProps {
  accentColor: string
}

export function UpdateBanner({ accentColor }: UpdateBannerProps) {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    window.forgeterm.getLastUpdateCheck().then((info) => {
      if (info?.available) setUpdate(info)
    })
    return window.forgeterm.onUpdateAvailable((info) => {
      if (info.available) {
        setUpdate(info)
        setDismissed(false)
      }
    })
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return
    const handler = () => setShowMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showMenu])

  const handleInstall = useCallback(() => {
    setInstalling(true)
    window.forgeterm.installUpdate()
  }, [])

  const handleCopyCommand = useCallback(async () => {
    const cmd = await window.forgeterm.getUpdateCommand()
    if (cmd) {
      await navigator.clipboard.writeText(cmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    setShowMenu(false)
  }, [])

  const handleDownload = useCallback(() => {
    if (update?.releaseUrl) {
      window.forgeterm.openExternal(update.releaseUrl)
    }
    setShowMenu(false)
  }, [update])

  if (!update?.available || dismissed) return null

  const hasDmg = !!update.dmgUrl

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

      {installing ? (
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
          Updating... app will restart
        </span>
      ) : (
        <div style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Primary button */}
          <button
            onClick={hasDmg ? handleInstall : handleDownload}
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
            {hasDmg ? 'Update now' : 'Download'}
          </button>

          {/* Dropdown arrow for extra options */}
          {hasDmg && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.5)',
                border: 'none',
                borderRadius: 4,
                padding: '3px 5px',
                fontSize: 10,
                cursor: 'pointer',
                lineHeight: 1,
              }}
              title="More options"
            >
              ▾
            </button>
          )}

          {/* Dropdown menu */}
          {showMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: '#2a2a2a',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                padding: 4,
                zIndex: 100,
                minWidth: 160,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              <button
                onClick={handleCopyCommand}
                style={{
                  display: 'block',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.8)',
                  padding: '6px 10px',
                  fontSize: 11,
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {copied ? 'Copied!' : 'Copy update command'}
              </button>
              <button
                onClick={handleDownload}
                style={{
                  display: 'block',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.8)',
                  padding: '6px 10px',
                  fontSize: 11,
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                View release on GitHub
              </button>
            </div>
          )}
        </div>
      )}

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
