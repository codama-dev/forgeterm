interface HelpModalProps {
  accentColor: string
  onClose: () => void
}

const SHORTCUTS = [
  { keys: 'Cmd+N', desc: 'New session' },
  { keys: 'Cmd+T', desc: 'New session' },
  { keys: 'Cmd+Shift+T', desc: 'Theme editor' },
  { keys: 'Cmd+,', desc: 'Project settings' },
  { keys: 'Cmd+P', desc: 'Switch project' },
  { keys: 'Cmd+O', desc: 'Open folder' },
  { keys: 'Cmd+K', desc: 'Clear terminal' },
  { keys: 'Cmd+1-9', desc: 'Switch to session' },
  { keys: 'Cmd+W', desc: 'Close window' },
]

const TIPS = [
  'Right-click a session for restart, kill, and rename options.',
  'Configure startup sessions in Project Settings to auto-launch commands when you open a project.',
  'Use the play/stop buttons on sessions to start or stop them without removing them.',
  'Set a custom project name in Project Settings - it shows in the titlebar instead of the folder name.',
  'Theme, font, and session config are saved per-project in .forgeterm.json.',
]

export function HelpModal({ accentColor, onClose }: HelpModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard Shortcuts</h3>
        <div className="help-shortcuts">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="help-shortcut-row">
              <kbd className="help-kbd" style={{ borderColor: accentColor + '44' }}>{s.keys}</kbd>
              <span className="help-desc">{s.desc}</span>
            </div>
          ))}
        </div>

        <h3 className="help-section-title">Tips</h3>
        <ul className="help-tips">
          {TIPS.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>

        <div className="modal-actions">
          <button
            type="button"
            className="btn-create"
            style={{ backgroundColor: accentColor }}
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
