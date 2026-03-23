import { useState, useCallback, useEffect } from 'react'
import QRCode from 'qrcode'
import type { RemoteStatus } from '../../shared/types'

interface RemoteAccessModalProps {
  accentColor: string
  onClose: () => void
}

export function RemoteAccessModal({ accentColor, onClose }: RemoteAccessModalProps) {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(false)

  useEffect(() => {
    window.forgeterm.getRemoteStatus().then(setStatus)
    const unsub = window.forgeterm.onRemoteStatusChanged(setStatus)
    return unsub
  }, [])

  const tunnelUrl = status?.tunnelUrl
  const pin = status?.pin
  const sessionPath = status?.sessionPath
  const accessUrl = tunnelUrl && sessionPath ? `${tunnelUrl}/s/${sessionPath}/` : null

  useEffect(() => {
    if (!accessUrl) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(accessUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#e2e8f0', light: '#00000000' },
      errorCorrectionLevel: 'M',
    }).then(setQrDataUrl).catch(() => setQrDataUrl(null))
  }, [accessUrl])

  const handleStart = useCallback(async () => {
    setStarting(true)
    setError(null)
    setShowLogs(false)
    try {
      const s = await window.forgeterm.startRemoteAccess()
      setStatus(s)
      if (!s.tunnelUrl) {
        setError(s.tunnelError || 'Tunnel failed to start')
        setShowLogs(true)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start')
    }
    setStarting(false)
  }, [])

  const handleStop = useCallback(async () => {
    setStopping(true)
    try {
      const s = await window.forgeterm.stopRemoteAccess()
      setStatus(s)
    } catch {
      // ignore
    }
    setStopping(false)
  }, [])

  const handleCopy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // fallback
    }
  }, [])

  const isRunning = status?.running ?? false

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div style={{ padding: '24px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: isRunning ? '#4ade8020' : accentColor + '20',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isRunning ? '#4ade80' : accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>
                Remote Access
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                {isRunning ? 'Control your sessions from any device' : 'Access your terminal from your phone'}
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 24px 20px' }}>
          {!isRunning && (
            <>
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                  <p style={{ margin: '0 0 12px' }}>
                    <strong style={{ color: '#e2e8f0' }}>How it works</strong>
                  </p>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 16, width: 24, textAlign: 'center', flexShrink: 0 }}>1</span>
                      <span>Starts a local web server with your terminal sessions</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 16, width: 24, textAlign: 'center', flexShrink: 0 }}>2</span>
                      <span>Creates a secure tunnel via Cloudflare (requires <code style={{ color: accentColor, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>cloudflared</code>)</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 16, width: 24, textAlign: 'center', flexShrink: 0 }}>3</span>
                      <span>Scan the QR code or enter the 4-digit PIN on your phone</span>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div style={{
                  background: 'rgba(248,113,113,0.1)',
                  border: '1px solid rgba(248,113,113,0.2)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 11,
                  color: '#f87171',
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '7px 14px',
                    color: '#94a3b8',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleStart}
                  disabled={starting}
                  style={{
                    background: accentColor,
                    border: 'none',
                    borderRadius: 6,
                    padding: '7px 18px',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: starting ? 'default' : 'pointer',
                    opacity: starting ? 0.7 : 1,
                  }}
                >
                  {starting ? 'Starting...' : 'Start Remote Access'}
                </button>
              </div>
            </>
          )}

          {isRunning && (
            <>
              {/* Status chips */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: 'rgba(74,222,128,0.1)',
                  border: '1px solid rgba(74,222,128,0.2)',
                  fontSize: 11,
                  color: '#4ade80',
                  fontWeight: 500,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 4px #4ade80' }} />
                  Server running
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: tunnelUrl ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)',
                  border: `1px solid ${tunnelUrl ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}`,
                  fontSize: 11,
                  color: tunnelUrl ? '#4ade80' : '#fbbf24',
                  fontWeight: 500,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: tunnelUrl ? '#4ade80' : '#fbbf24', boxShadow: `0 0 4px ${tunnelUrl ? '#4ade80' : '#fbbf24'}` }} />
                  {tunnelUrl ? 'Tunnel active' : 'Tunnel failed'}
                </div>
                {status?.port && (
                  <div style={{
                    padding: '4px 10px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 11,
                    color: '#64748b',
                  }}>
                    Port {status.port}
                  </div>
                )}
              </div>

              {/* PIN display */}
              {pin && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  marginBottom: 12,
                }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                    Access PIN
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    cursor: 'pointer',
                  }} onClick={() => handleCopy(pin, 'pin')}>
                    {pin.split('').map((digit, i) => (
                      <div key={i} style={{
                        width: 40,
                        height: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#0f172a',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: 24,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: '#e2e8f0',
                        letterSpacing: 0,
                      }}>
                        {digit}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: copied === 'pin' ? '#4ade80' : '#475569', marginTop: 6 }}>
                    {copied === 'pin' ? 'Copied!' : 'Click to copy'}
                  </div>
                </div>
              )}

              {/* QR Code */}
              {qrDataUrl && accessUrl && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '20px 16px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  marginBottom: 12,
                }}>
                  <div style={{
                    background: '#1e293b',
                    borderRadius: 8,
                    padding: 8,
                    marginBottom: 12,
                  }}>
                    <img
                      src={qrDataUrl}
                      alt="QR Code"
                      width={180}
                      height={180}
                      style={{ display: 'block' }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>
                    Scan to open, then enter PIN
                  </div>
                </div>
              )}

              {/* URL display */}
              {accessUrl && (
                <div
                  onClick={() => handleCopy(accessUrl, 'url')}
                  style={{
                    background: '#0f172a',
                    borderRadius: 6,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    border: copied === 'url' ? '1px solid #4ade8055' : '1px solid rgba(255,255,255,0.06)',
                    position: 'relative',
                    marginBottom: 12,
                  }}
                >
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: '#e2e8f0',
                    wordBreak: 'break-all',
                  }}>
                    {accessUrl}
                  </div>
                  <span style={{
                    position: 'absolute',
                    top: 6,
                    right: 8,
                    fontSize: 9,
                    color: copied === 'url' ? '#4ade80' : '#475569',
                  }}>
                    {copied === 'url' ? 'Copied!' : 'Click to copy full URL'}
                  </span>
                </div>
              )}

              {!tunnelUrl && (
                <div style={{
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.2)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 11,
                  color: '#fbbf24',
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}>
                  {status?.tunnelError || 'Tunnel failed to start'}
                </div>
              )}

              {error && !status?.tunnelError && (
                <div style={{
                  background: 'rgba(248,113,113,0.1)',
                  border: '1px solid rgba(248,113,113,0.2)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 11,
                  color: '#f87171',
                  marginBottom: 12,
                }}>
                  {error}
                </div>
              )}

              {/* Tunnel logs */}
              {status?.tunnelLogs && status.tunnelLogs.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <button
                    onClick={() => setShowLogs((v) => !v)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: 11,
                      color: '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      marginBottom: showLogs ? 6 : 0,
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      transform: showLogs ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s',
                      fontSize: 9,
                    }}>
                      &#9654;
                    </span>
                    Tunnel logs ({status.tunnelLogs.length})
                  </button>
                  {showLogs && (
                    <div style={{
                      background: '#0f172a',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      maxHeight: 160,
                      overflowY: 'auto',
                      fontFamily: 'monospace',
                      fontSize: 10,
                      lineHeight: 1.6,
                      color: '#94a3b8',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}>
                      {status.tunnelLogs.map((line, i) => (
                        <div key={i} style={{
                          color: line.includes('ERROR') ? '#f87171' :
                                 line.includes('Tunnel established') ? '#4ade80' :
                                 '#94a3b8',
                        }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {accessUrl && (
                  <button
                    onClick={() => handleCopy(accessUrl, 'url')}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      padding: '7px 14px',
                      color: copied === 'url' ? '#4ade80' : '#94a3b8',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {copied === 'url' ? 'Copied!' : 'Copy URL'}
                  </button>
                )}
                <button
                  onClick={handleStop}
                  disabled={stopping}
                  style={{
                    background: '#f87171',
                    border: 'none',
                    borderRadius: 6,
                    padding: '7px 18px',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: stopping ? 'default' : 'pointer',
                    opacity: stopping ? 0.7 : 1,
                  }}
                >
                  {stopping ? 'Stopping...' : 'Stop Remote Access'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
