import { create } from 'zustand'
import type { SessionActivityStatus, SessionContext } from '../../shared/types'

export interface Session {
  id: string
  name: string
  command?: string
  running: boolean
  activityStatus: SessionActivityStatus
  info?: SessionContext
  contextPercent?: number
}

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  addSession: (session: Omit<Session, 'activityStatus'>) => void
  removeSession: (id: string) => void
  setActive: (id: string) => void
  setRunning: (id: string, running: boolean) => void
  renameSession: (id: string, name: string) => void
  setSessionInfo: (id: string, info: SessionContext) => void
  setContextPercent: (id: string, percent: number) => void
  setActivityStatus: (id: string, status: SessionActivityStatus) => void
  markSessionWorking: (id: string) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  activeSessionId: null,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, { ...session, activityStatus: 'idle' }],
      activeSessionId: state.activeSessionId ?? session.id,
    })),

  removeSession: (id) =>
    set((state) => {
      const idx = state.sessions.findIndex((s) => s.id === id)
      const sessions = state.sessions.filter((s) => s.id !== id)
      let activeSessionId = state.activeSessionId
      if (activeSessionId === id) {
        // Pick adjacent session: prefer next, fall back to previous
        const nextIdx = Math.min(idx, sessions.length - 1)
        activeSessionId = nextIdx >= 0 ? sessions[nextIdx].id : null
      }
      return { sessions, activeSessionId }
    }),

  setActive: (id) =>
    set((state) => ({
      activeSessionId: id,
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, activityStatus: 'idle' as const } : s,
      ),
    })),

  setRunning: (id, running) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, running } : s,
      ),
    })),

  renameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name } : s,
      ),
    })),

  setSessionInfo: (id, info) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, info, contextPercent: info.contextPercent ?? s.contextPercent } : s,
      ),
    })),

  setContextPercent: (id, percent) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, contextPercent: percent } : s,
      ),
    })),

  setActivityStatus: (id, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, activityStatus: status } : s,
      ),
    })),

  markSessionWorking: (id) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === id)
      if (!session || session.activityStatus === 'working') return state
      return {
        sessions: state.sessions.map((s) =>
          s.id === id ? { ...s, activityStatus: 'working' as const } : s,
        ),
      }
    }),
}))
