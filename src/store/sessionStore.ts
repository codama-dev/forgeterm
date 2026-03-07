import { create } from 'zustand'

export interface Session {
  id: string
  name: string
  command?: string
  running: boolean
}

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  setActive: (id: string) => void
  setRunning: (id: string, running: boolean) => void
  renameSession: (id: string, name: string) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  activeSessionId: null,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: state.activeSessionId ?? session.id,
    })),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      const activeSessionId =
        state.activeSessionId === id
          ? sessions[0]?.id ?? null
          : state.activeSessionId
      return { sessions, activeSessionId }
    }),

  setActive: (id) => set({ activeSessionId: id }),

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
}))
