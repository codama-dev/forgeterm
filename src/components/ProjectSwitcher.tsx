import { useState, useEffect, useRef, useCallback } from 'react'
import type { RecentProject } from '../../shared/types'

interface ProjectSwitcherProps {
  accentColor: string
  onCancel: () => void
}

export function ProjectSwitcher({ accentColor, onCancel }: ProjectSwitcherProps) {
  const [projects, setProjects] = useState<RecentProject[]>([])
  const [filter, setFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.forgeterm.getRecentProjects().then(setProjects)
    inputRef.current?.focus()
  }, [])

  const filtered = projects.filter((p) => {
    const q = filter.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
  })

  useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

  const openSelected = useCallback(() => {
    const project = filtered[selectedIndex]
    if (project) {
      window.forgeterm.openProject(project.path)
      onCancel()
    }
  }, [filtered, selectedIndex, onCancel])

  const handleOpenFolder = useCallback(async () => {
    await window.forgeterm.openFolder()
    onCancel()
  }, [onCancel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        openSelected()
      }
    },
    [filtered.length, openSelected],
  )

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal project-switcher-modal" onClick={(e) => e.stopPropagation()}>
        <div className="switcher-search">
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects..."
            className="switcher-input"
          />
        </div>
        <div className="switcher-list">
          {filtered.length === 0 && (
            <div className="switcher-empty">No recent projects found</div>
          )}
          {filtered.map((project, i) => (
            <div
              key={project.path}
              className={`switcher-item ${i === selectedIndex ? 'selected' : ''}`}
              style={i === selectedIndex ? { background: accentColor + '22', borderLeftColor: accentColor } : undefined}
              onClick={() => {
                window.forgeterm.openProject(project.path)
                onCancel()
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="switcher-name">{project.name}</span>
              <span className="switcher-path">{project.path}</span>
            </div>
          ))}
        </div>
        <div className="switcher-footer">
          <button className="switcher-open-btn" onClick={handleOpenFolder}>
            Open Folder...
          </button>
        </div>
      </div>
    </div>
  )
}
