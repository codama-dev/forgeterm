import { useEffect, useState } from 'react'
import type { DashboardState, DashboardWorkspace, DashboardProject, DashboardSession } from '../../shared/types'
import { SessionSearch } from './SessionSearch'

function StatusDot({ status, size = 8 }: { status: string; size?: number }) {
  const color = status === 'working' ? '#4ade80' : status === 'unread' ? '#facc15' : '#475569'
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

function ProjectCard({ project }: { project: DashboardProject }) {
  return (
    <div
      className="dashboard-project"
      onClick={() => window.forgeterm.openProject(project.path)}
      style={{ cursor: 'pointer' }}
    >
      <div className="dashboard-project-header">
        {project.emoji && <span className="dashboard-project-emoji">{project.emoji}</span>}
        <span className="dashboard-project-name">{project.name}</span>
        {project.isOpen && <span className="dashboard-project-badge">open</span>}
      </div>
      {project.isOpen && project.sessions.length > 0 && (
        <div className="dashboard-project-sessions">
          {project.sessions.map((s: DashboardSession) => (
            <div key={s.id} className="dashboard-session-row">
              <StatusDot status={s.activityStatus} />
              <span className="dashboard-session-name">{s.name}</span>
              {s.contextPercent != null && (
                <span className="dashboard-session-context">{s.contextPercent}%</span>
              )}
            </div>
          ))}
        </div>
      )}
      {!project.isOpen && (
        <div className="dashboard-project-closed">Click to open</div>
      )}
    </div>
  )
}

function WorkspaceCard({ workspace }: { workspace: DashboardWorkspace }) {
  const openProjects = workspace.projects.filter(p => p.isOpen)
  const totalSessions = workspace.projects.reduce((sum, p) => sum + p.sessions.length, 0)
  const workingSessions = workspace.projects.reduce(
    (sum, p) => sum + p.sessions.filter(s => s.activityStatus === 'working').length, 0
  )

  const handleOpen = () => {
    window.forgeterm.openWorkspace(workspace.name, true)
  }

  return (
    <div className="dashboard-card" style={workspace.accentColor ? { borderColor: workspace.accentColor + '40' } : undefined}>
      <div className="dashboard-card-header">
        <div className="dashboard-card-title">
          {workspace.emoji && <span className="dashboard-card-emoji">{workspace.emoji}</span>}
          <span>{workspace.name}</span>
        </div>
        <div className="dashboard-card-stats">
          {openProjects.length > 0 && (
            <span className="dashboard-stat">
              {openProjects.length}/{workspace.projects.length} open
            </span>
          )}
          {totalSessions > 0 && (
            <span className="dashboard-stat">
              {totalSessions} sessions
            </span>
          )}
          {workingSessions > 0 && (
            <span className="dashboard-stat working">
              {workingSessions} active
            </span>
          )}
        </div>
      </div>
      {workspace.description && (
        <div className="dashboard-card-description">{workspace.description}</div>
      )}
      <div className="dashboard-card-projects">
        {workspace.projects.map((p: DashboardProject) => (
          <ProjectCard key={p.path} project={p} />
        ))}
      </div>
      {openProjects.length === 0 && (
        <button className="dashboard-card-open-btn" onClick={handleOpen}>
          Open Workspace
        </button>
      )}
    </div>
  )
}

export function Dashboard() {
  const [state, setState] = useState<DashboardState | null>(null)
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    window.forgeterm.getDashboardState().then(setState)
    return window.forgeterm.onDashboardStateChanged(setState)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
      }
      if (e.key === 'Escape') {
        setShowSearch(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!state) return null

  const hasContent = state.workspaces.length > 0 || state.standaloneProjects.length > 0

  return (
    <div className="dashboard">
      <div className="dashboard-titlebar">
        <span className="dashboard-titlebar-text">ForgeTerm Command Center</span>
        <button
          className="dashboard-search-btn"
          onClick={() => setShowSearch(true)}
          title="Search Sessions (Cmd+F)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M10.5 10.5L15 15" />
          </svg>
        </button>
      </div>
      <div className="dashboard-content">
        {!hasContent && (
          <div className="dashboard-empty">
            <div className="dashboard-empty-title">No workspaces or projects</div>
            <div className="dashboard-empty-hint">Open a project to get started</div>
          </div>
        )}

        {state.workspaces.length > 0 && (
          <div className="dashboard-section">
            <div className="dashboard-section-title">Workspaces</div>
            <div className="dashboard-grid">
              {state.workspaces.map((ws: DashboardWorkspace) => (
                <WorkspaceCard key={ws.name} workspace={ws} />
              ))}
            </div>
          </div>
        )}

        {state.standaloneProjects.length > 0 && (
          <div className="dashboard-section">
            <div className="dashboard-section-title">Projects</div>
            <div className="dashboard-grid">
              {state.standaloneProjects.map((p: DashboardProject) => (
                <div key={p.path} className="dashboard-card">
                  <ProjectCard project={p} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showSearch && (
        <SessionSearch
          workspaces={state.workspaces}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  )
}
