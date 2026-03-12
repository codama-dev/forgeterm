import { useState, useCallback } from 'react'

interface CliInstallModalProps {
  accentColor: string
  onClose: () => void
  onInstalled: () => void
}

const AI_PROMPT = `When you finish a task, run: forgeterm notify "Done"
This sends a native notification via ForgeTerm. It automatically knows which project and session you're in. No config needed.

For long-running tasks (builds, deploys, test suites), notify on both success and failure:
  command && forgeterm notify "Success" || forgeterm notify "Failed"`

const CLI_COMMANDS = [
  {
    cmd: 'forgeterm open <path>',
    desc: 'Open a project in ForgeTerm (adds to recent list)',
    example: 'forgeterm open ~/projects/my-app',
  },
  {
    cmd: 'forgeterm list',
    desc: 'List your recent projects',
    example: 'forgeterm list --json',
  },
  {
    cmd: 'forgeterm notify "message"',
    desc: 'Send a native notification',
    example: 'pnpm build && forgeterm notify "Build done"',
  },
]

export function CliInstallModal({ accentColor, onClose, onInstalled }: CliInstallModalProps) {
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installed, setInstalled] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const handleInstall = useCallback(async () => {
    setInstalling(true)
    setError(null)
    const result = await window.forgeterm.installCli()
    setInstalling(false)
    if (result.success) {
      setInstalled(true)
    } else if (result.error !== 'cancelled') {
      setError(result.error || 'Unknown error')
    }
  }, [])

  const handleDismiss = useCallback(async () => {
    await window.forgeterm.dismissCliPrompt()
    onClose()
  }, [onClose])

  const handleDone = useCallback(() => {
    onInstalled()
  }, [onInstalled])

  const handleCopy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Fallback
    }
  }, [])

  const codeStyle: React.CSSProperties = {
    color: accentColor,
    background: 'rgba(255,255,255,0.06)',
    padding: '1px 5px',
    borderRadius: 3,
    fontSize: 11,
  }

  return (
    <div className="modal-overlay" onClick={installed ? handleDone : onClose}>
      <div className="modal cli-install-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '24px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: (installed ? '#4ade80' : accentColor) + '20',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {installed ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              )}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>
                {installed ? 'CLI Installed' : 'Command Line Tool'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                {installed ? (
                  <>You can now use <code style={{ ...codeStyle, color: '#4ade80' }}>forgeterm</code> from any terminal</>
                ) : (
                  <>Control ForgeTerm from your terminal with the <code style={codeStyle}>forgeterm</code> command</>
                )}
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 24px 20px' }}>
          {installed ? (
            <>
              {/* Commands reference */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                  <strong style={{ color: '#e2e8f0' }}>Commands</strong>
                </div>
                {CLI_COMMANDS.map((c) => (
                  <div
                    key={c.cmd}
                    onClick={() => handleCopy(c.example, c.cmd)}
                    style={{
                      background: '#0f172a',
                      borderRadius: 6,
                      padding: '8px 12px',
                      marginBottom: 8,
                      cursor: 'pointer',
                      border: copied === c.cmd ? '1px solid #4ade8055' : '1px solid transparent',
                      position: 'relative',
                    }}
                  >
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0' }}>
                      {c.cmd}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {c.desc}
                    </div>
                    <span style={{
                      position: 'absolute',
                      top: 6,
                      right: 8,
                      fontSize: 9,
                      color: copied === c.cmd ? '#4ade80' : '#475569',
                    }}>
                      {copied === c.cmd ? 'Copied!' : 'Click to copy'}
                    </span>
                  </div>
                ))}
              </div>

              {/* AI agent prompt */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                  <p style={{ margin: '0 0 10px' }}>
                    <strong style={{ color: '#e2e8f0' }}>Make AI agents notify you</strong><br />
                    Copy this and add it to your AI tool's instructions (e.g. CLAUDE.md):
                  </p>
                  <div
                    onClick={() => handleCopy(AI_PROMPT, 'ai')}
                    style={{
                      background: '#0f172a',
                      borderRadius: 6,
                      padding: '10px 12px',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: '#e2e8f0',
                      lineHeight: 1.7,
                      cursor: 'pointer',
                      border: copied === 'ai' ? '1px solid #4ade8055' : '1px solid transparent',
                      position: 'relative',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {AI_PROMPT}
                    <span style={{
                      position: 'absolute',
                      top: 6,
                      right: 8,
                      fontSize: 10,
                      color: copied === 'ai' ? '#4ade80' : '#64748b',
                      background: '#0f172a',
                      padding: '0 4px',
                    }}>
                      {copied === 'ai' ? 'Copied!' : 'Click to copy'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleCopy(AI_PROMPT, 'ai')}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '7px 14px',
                    color: copied === 'ai' ? '#4ade80' : '#94a3b8',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {copied === 'ai' ? 'Copied!' : 'Copy AI Prompt'}
                </button>
                <button
                  onClick={handleDone}
                  style={{
                    background: accentColor,
                    border: 'none',
                    borderRadius: 6,
                    padding: '7px 18px',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Commands preview */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                  <p style={{ margin: '0 0 12px' }}>
                    <strong style={{ color: '#e2e8f0' }}>What you can do</strong>
                  </p>
                  <div style={{
                    background: '#0f172a',
                    borderRadius: 6,
                    padding: '10px 12px',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: '#94a3b8',
                    lineHeight: 1.8,
                  }}>
                    <div><span style={{ color: '#64748b'}}># Open a project</span></div>
                    <div><span style={{ color: accentColor }}>forgeterm open</span> ~/projects/my-app</div>
                    <div style={{ marginTop: 4 }}><span style={{ color: '#64748b'}}># List your recent projects</span></div>
                    <div><span style={{ color: accentColor }}>forgeterm list</span></div>
                    <div style={{ marginTop: 4 }}><span style={{ color: '#64748b'}}># Get notified when tasks finish</span></div>
                    <div>pnpm build && <span style={{ color: accentColor }}>forgeterm notify</span> "Build done"</div>
                    <div style={{ marginTop: 4 }}><span style={{ color: '#64748b'}}># Make AI agents notify you</span></div>
                    <div><span style={{ color: '#64748b'}}># Add to CLAUDE.md:</span> When done, run: <span style={{ color: accentColor }}>forgeterm notify</span> "Done"</div>
                  </div>
                  <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: 11 }}>
                    Install the CLI to use these commands from any terminal.
                  </p>
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
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={handleDismiss}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '7px 14px',
                    color: '#64748b',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Don't show again
                </button>
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
                  Later
                </button>
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  style={{
                    background: accentColor,
                    border: 'none',
                    borderRadius: 6,
                    padding: '7px 18px',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: installing ? 'default' : 'pointer',
                    opacity: installing ? 0.7 : 1,
                  }}
                >
                  {installing ? 'Installing...' : 'Install CLI'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
