import { useState, useEffect, useCallback } from 'react'
import type { ForgeTermConfig } from '../../shared/types'
import {
  PRESET_THEMES,
  PROJECT_EMOJIS,
  generateWindowTheme,
  getTerminalTheme,
  type PresetTheme,
  type WindowTheme,
} from '../themes'

interface ThemeEditorProps {
  config: ForgeTermConfig | null
  onSave: (config: ForgeTermConfig) => void
  onCancel: () => void
}

interface ColorFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  const safeValue = value.startsWith('#') && (value.length === 7 || value.length === 4) ? value : '#000000'
  return (
    <div className="theme-field">
      <label>{label}</label>
      <div className="color-input-row">
        <input
          type="color"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          className="color-picker"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="color-text"
          spellCheck={false}
        />
      </div>
    </div>
  )
}

function ThemeCard({
  theme,
  selected,
  onClick,
}: {
  theme: PresetTheme
  selected: boolean
  onClick: () => void
}) {
  const w = theme.window
  const gradient = `linear-gradient(to right, ${w.titlebarBackground}, ${w.titlebarBackgroundEnd})`
  return (
    <button
      className={`theme-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={selected ? { borderColor: w.accentColor } : undefined}
    >
      <div className="theme-card-preview">
        <div className="tc-titlebar" style={{ background: gradient }}>
          <span className="tc-dot" style={{ background: w.accentColor }} />
        </div>
        <div className="tc-body">
          <div className="tc-sidebar" style={{ background: w.sidebarBackground }}>
            <div className="tc-session" style={{ borderLeftColor: w.accentColor, background: w.buttonBackground }} />
            <div className="tc-session" />
          </div>
          <div className="tc-terminal" style={{ background: theme.terminal.background }} />
        </div>
      </div>
      <span className="theme-card-name">{theme.name}</span>
    </button>
  )
}

function MiniPreview({ windowTheme, terminalBg }: { windowTheme: WindowTheme; terminalBg: string }) {
  const gradient = `linear-gradient(to right, ${windowTheme.titlebarBackground}, ${windowTheme.titlebarBackgroundEnd})`
  return (
    <div className="theme-preview">
      <div className="preview-titlebar" style={{ background: gradient, color: windowTheme.titlebarForeground }}>
        Project Name
      </div>
      <div className="preview-body">
        <div className="preview-sidebar" style={{ background: windowTheme.sidebarBackground, color: windowTheme.sidebarForeground }}>
          <div className="preview-session">
            <span className="preview-dot" style={{ background: windowTheme.accentColor }} />
            shell
          </div>
          <div className="preview-session active" style={{ borderLeftColor: windowTheme.accentColor }}>
            <span className="preview-dot" style={{ background: windowTheme.accentColor }} />
            server
          </div>
          <div className="preview-btn" style={{ background: windowTheme.buttonBackground, color: windowTheme.sidebarForeground }}>
            + New
          </div>
        </div>
        <div className="preview-terminal" style={{ background: terminalBg }} />
      </div>
    </div>
  )
}

export function ThemeEditor({ config, onSave, onCancel }: ThemeEditorProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [terminalMode, setTerminalMode] = useState<'dark' | 'light'>('dark')
  const [emoji, setEmoji] = useState<string>('')
  const [generateColor, setGenerateColor] = useState('#38bdf8')
  const [showCustom, setShowCustom] = useState(false)

  // Custom color state
  const [custom, setCustom] = useState<WindowTheme>({
    accentColor: '#38bdf8',
    titlebarBackground: '#0b1120',
    titlebarBackgroundEnd: '#111d33',
    titlebarForeground: '#8faabe',
    sidebarBackground: '#0c1322',
    sidebarForeground: '#8faabe',
    buttonBackground: '#172541',
  })

  // Load from existing config
  useEffect(() => {
    const w = config?.window
    if (w?.themeName) {
      setSelectedPreset(w.themeName)
    }
    if (w?.emoji) setEmoji(w.emoji)
    if (config?.terminalTheme) setTerminalMode(config.terminalTheme)

    if (w) {
      setCustom({
        accentColor: w.accentColor ?? '#38bdf8',
        titlebarBackground: w.titlebarBackground ?? '#0b1120',
        titlebarBackgroundEnd: w.titlebarBackgroundEnd ?? '#111d33',
        titlebarForeground: w.titlebarForeground ?? '#8faabe',
        sidebarBackground: w.sidebarBackground ?? '#0c1322',
        sidebarForeground: w.sidebarForeground ?? '#8faabe',
        buttonBackground: w.buttonBackground ?? '#172541',
      })
    }
  }, [config])

  const activeTheme: WindowTheme = (() => {
    if (selectedPreset) {
      const preset = PRESET_THEMES.find((t) => t.id === selectedPreset)
      if (preset) return preset.window
    }
    return custom
  })()

  const terminalBg = terminalMode === 'light' ? '#f8fafc' : '#0f172a'

  const handleSelectPreset = useCallback((theme: PresetTheme) => {
    setSelectedPreset(theme.id)
    setCustom({ ...theme.window })
    setShowCustom(false)
  }, [])

  const handleGenerateFromColor = useCallback((color: string) => {
    setGenerateColor(color)
    const generated = generateWindowTheme(color)
    setCustom(generated)
    setSelectedPreset(null)
  }, [])

  const updateCustomField = useCallback((field: keyof WindowTheme, value: string) => {
    setCustom((prev) => ({ ...prev, [field]: value }))
    setSelectedPreset(null)
  }, [])

  const handleSave = useCallback(() => {
    const terminal = getTerminalTheme(terminalMode)
    // Override terminal cursor with accent color
    terminal.cursor = activeTheme.accentColor

    const updated: ForgeTermConfig = {
      ...config,
      theme: terminal,
      terminalTheme: terminalMode,
      window: {
        ...activeTheme,
        emoji: emoji || undefined,
        themeName: selectedPreset ?? undefined,
      },
    }
    onSave(updated)
  }, [config, activeTheme, terminalMode, emoji, selectedPreset, onSave])

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal theme-editor-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Customize Theme</h3>

        <MiniPreview windowTheme={activeTheme} terminalBg={terminalBg} />

        {/* Emoji */}
        <div className="theme-section">
          <div className="theme-section-title">Project Icon</div>
          <div className="emoji-grid">
            <button
              className={`emoji-btn ${emoji === '' ? 'selected' : ''}`}
              onClick={() => setEmoji('')}
              title="No icon"
            >
              <span className="emoji-none">-</span>
            </button>
            {PROJECT_EMOJIS.map((e) => (
              <button
                key={e}
                className={`emoji-btn ${emoji === e ? 'selected' : ''}`}
                onClick={() => setEmoji(e)}
                style={emoji === e ? { borderColor: activeTheme.accentColor } : undefined}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Preset Themes */}
        <div className="theme-section">
          <div className="theme-section-title">Themes</div>
          <div className="theme-grid">
            {PRESET_THEMES.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                selected={selectedPreset === theme.id}
                onClick={() => handleSelectPreset(theme)}
              />
            ))}
          </div>
        </div>

        {/* Generate from color */}
        <div className="theme-section">
          <div className="theme-section-title">Generate from Color</div>
          <div className="generate-row">
            <input
              type="color"
              value={generateColor}
              onChange={(e) => handleGenerateFromColor(e.target.value)}
              className="color-picker generate-picker"
            />
            <span className="generate-label">Pick a color to auto-generate a matching theme</span>
          </div>
        </div>

        {/* Terminal mode */}
        <div className="theme-section">
          <div className="theme-section-title">Terminal</div>
          <div className="terminal-mode-row">
            <button
              className={`terminal-mode-btn ${terminalMode === 'dark' ? 'active' : ''}`}
              onClick={() => setTerminalMode('dark')}
              style={terminalMode === 'dark' ? { borderColor: activeTheme.accentColor } : undefined}
            >
              <span className="mode-swatch" style={{ background: '#0f172a' }} />
              Dark
            </button>
            <button
              className={`terminal-mode-btn ${terminalMode === 'light' ? 'active' : ''}`}
              onClick={() => setTerminalMode('light')}
              style={terminalMode === 'light' ? { borderColor: activeTheme.accentColor } : undefined}
            >
              <span className="mode-swatch" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }} />
              Light
            </button>
          </div>
        </div>

        {/* Custom colors */}
        <div className="theme-section">
          <button
            className="custom-toggle"
            onClick={() => setShowCustom(!showCustom)}
          >
            <span className={`custom-arrow ${showCustom ? 'open' : ''}`}>&#9654;</span>
            <span className="theme-section-title" style={{ margin: 0 }}>Custom Colors</span>
          </button>
          {showCustom && (
            <div className="custom-fields">
              <ColorField label="Accent Color" value={custom.accentColor} onChange={(v) => updateCustomField('accentColor', v)} />
              <ColorField label="Titlebar Start" value={custom.titlebarBackground} onChange={(v) => updateCustomField('titlebarBackground', v)} />
              <ColorField label="Titlebar End" value={custom.titlebarBackgroundEnd} onChange={(v) => updateCustomField('titlebarBackgroundEnd', v)} />
              <ColorField label="Titlebar Text" value={custom.titlebarForeground} onChange={(v) => updateCustomField('titlebarForeground', v)} />
              <ColorField label="Sidebar Background" value={custom.sidebarBackground} onChange={(v) => updateCustomField('sidebarBackground', v)} />
              <ColorField label="Sidebar Text" value={custom.sidebarForeground} onChange={(v) => updateCustomField('sidebarForeground', v)} />
              <ColorField label="Button Background" value={custom.buttonBackground} onChange={(v) => updateCustomField('buttonBackground', v)} />
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-create"
            style={{ backgroundColor: activeTheme.accentColor }}
            onClick={handleSave}
          >
            Apply Theme
          </button>
        </div>
      </div>
    </div>
  )
}
