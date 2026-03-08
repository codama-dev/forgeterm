import { useState, useEffect, useCallback, useRef } from 'react'
import type { ForgeTermConfig, Workspace } from '../../shared/types'

interface SessionConfig {
  name: string
  command: string
  autoStart: boolean
}

interface ProjectSettingsProps {
  config: ForgeTermConfig | null
  accentColor: string
  projectName: string
  onSave: (config: ForgeTermConfig) => void
  onCancel: () => void
}

export function ProjectSettings({ config, accentColor, projectName, onSave, onCancel }: ProjectSettingsProps) {
  const [sessions, setSessions] = useState<SessionConfig[]>([])
  const [customName, setCustomName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [existingWorkspaces, setExistingWorkspaces] = useState<Workspace[]>([])
  const [showWorkspaceSuggestions, setShowWorkspaceSuggestions] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const wsInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCustomName(config?.projectName ?? '')
    const configSessions = config?.sessions || []
    setSessions(
      configSessions.map((s) => ({
        name: s.name,
        command: s.command || '',
        autoStart: s.autoStart ?? true,
      })),
    )
    // Load workspace info
    Promise.all([
      window.forgeterm.getProjectPath(),
      window.forgeterm.getWorkspaces(),
    ]).then(([projectPath, workspaces]) => {
      setExistingWorkspaces(workspaces)
      const current = projectPath ? workspaces.find((ws) => ws.projects.includes(projectPath)) : undefined
      if (current) setWorkspaceName(current.name)
    })
  }, [config])

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const addSession = useCallback(() => {
    setSessions((prev) => [...prev, { name: '', command: '', autoStart: true }])
  }, [])

  const removeSession = useCallback((index: number) => {
    setSessions((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateSession = useCallback((index: number, field: keyof SessionConfig, value: string | boolean) => {
    setSessions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    )
  }, [])

  const handleSave = useCallback(async () => {
    const validSessions = sessions.filter((s) => s.name.trim())
    const updated: ForgeTermConfig = {
      ...config,
      projectName: customName.trim() || undefined,
      sessions: validSessions.map((s) => ({
        name: s.name.trim(),
        command: s.command.trim() || undefined,
        autoStart: s.autoStart,
      })),
    }
    // Save workspace association
    const projectPath = await window.forgeterm.getProjectPath()
    const trimmedWs = workspaceName.trim()
    if (projectPath) {
      if (trimmedWs) {
        await window.forgeterm.setProjectWorkspace(projectPath, trimmedWs)
      } else {
        await window.forgeterm.removeProjectFromWorkspace(projectPath)
      }
    }
    onSave(updated)
  }, [config, customName, sessions, workspaceName, onSave])

  const filteredWorkspaces = existingWorkspaces.filter(
    (ws) => ws.name.toLowerCase().includes(workspaceName.toLowerCase()) && ws.name !== workspaceName,
  )

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal project-settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Project Settings</h3>

        <div className="form-field">
          <label>Project Name</label>
          <input
            ref={nameRef}
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={projectName}
          />
        </div>

        <div className="form-field" style={{ position: 'relative' }}>
          <label>Workspace</label>
          <div className="workspace-input-row">
            <input
              ref={wsInputRef}
              type="text"
              value={workspaceName}
              onChange={(e) => {
                setWorkspaceName(e.target.value)
                setShowWorkspaceSuggestions(true)
              }}
              onFocus={() => setShowWorkspaceSuggestions(true)}
              onBlur={() => setTimeout(() => setShowWorkspaceSuggestions(false), 150)}
              placeholder="Type to join or create a workspace..."
            />
            {workspaceName && (
              <button
                className="workspace-clear-btn"
                onClick={() => setWorkspaceName('')}
                title="Remove from workspace"
                type="button"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            )}
          </div>
          {showWorkspaceSuggestions && filteredWorkspaces.length > 0 && (
            <div className="workspace-suggestions">
              {filteredWorkspaces.map((ws) => (
                <div
                  key={ws.name}
                  className="workspace-suggestion"
                  onMouseDown={() => {
                    setWorkspaceName(ws.name)
                    setShowWorkspaceSuggestions(false)
                  }}
                >
                  <span className="workspace-suggestion-name">{ws.name}</span>
                  <span className="workspace-suggestion-count">
                    {ws.projects.length} project{ws.projects.length !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="settings-section-title">Startup Sessions</div>
        <div className="session-configs">
          {sessions.map((session, i) => (
            <div key={i} className="session-config-row">
              <div className="session-config-fields">
                <input
                  type="text"
                  value={session.name}
                  onChange={(e) => updateSession(i, 'name', e.target.value)}
                  placeholder="Name"
                  className="session-config-input"
                />
                <input
                  type="text"
                  value={session.command}
                  onChange={(e) => updateSession(i, 'command', e.target.value)}
                  placeholder="Command (optional)"
                  className="session-config-input"
                />
              </div>
              <div className="session-config-right">
                <label className="auto-start-toggle">
                  <input
                    type="checkbox"
                    checked={session.autoStart}
                    onChange={(e) => updateSession(i, 'autoStart', e.target.checked)}
                  />
                  <span>Auto</span>
                </label>
                <button
                  className="session-remove-btn"
                  onClick={() => removeSession(i)}
                  title="Remove"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          className="add-session-config-btn"
          onClick={addSession}
          style={{ color: accentColor }}
        >
          + Add Session
        </button>

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-create"
            style={{ backgroundColor: accentColor }}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
