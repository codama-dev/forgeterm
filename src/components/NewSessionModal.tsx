import { useState, useRef, useEffect, useCallback } from 'react'

interface SessionPreset {
  name: string
  command?: string
}

interface NewSessionModalProps {
  accentColor: string
  presets: SessionPreset[]
  onSubmit: (name: string, command?: string) => void
  onCancel: () => void
}

export function NewSessionModal({ accentColor, presets, onSubmit, onCancel }: NewSessionModalProps) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const sessionName = name.trim() || 'shell'
    onSubmit(sessionName, command.trim() || undefined)
  }

  const handlePresetClick = useCallback((preset: SessionPreset) => {
    onSubmit(preset.name, preset.command)
  }, [onSubmit])

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New Session</h3>

        {presets.length > 0 && (
          <div className="session-presets">
            <div className="presets-label">From project config</div>
            <div className="presets-list">
              {presets.map((preset, i) => (
                <button
                  key={i}
                  className="preset-btn"
                  onClick={() => handlePresetClick(preset)}
                  style={{ borderColor: accentColor + '44' }}
                >
                  <span className="preset-name">{preset.name}</span>
                  {preset.command && (
                    <span className="preset-command">{preset.command}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="presets-divider">
              <span>or create custom</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="shell"
            />
          </div>
          <div className="form-field">
            <label>Command (optional)</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. npm run dev"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-create"
              style={{ backgroundColor: accentColor }}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
