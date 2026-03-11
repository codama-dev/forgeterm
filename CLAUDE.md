# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ForgeTerm

ForgeTerm is an Electron-based terminal emulator built with React, TypeScript, and xterm.js. It opens per-project windows with multiple terminal sessions, configurable themes, and per-project config files (`.forgeterm.json`).

## Commands

- `pnpm dev` - Start dev server with HMR (Vite + Electron)
- `pnpm build` - TypeScript check, Vite build, and electron-builder package
- `pnpm rebuild` - Rebuild native node-pty module for Electron

No test runner or linter is configured.

## Architecture

Three-layer Electron app: main process, preload bridge, renderer (React).

### Main process (`electron/`)
- `main.ts` - App lifecycle, window management, IPC handlers, config file loading/watching. Each window gets its own `PtyManager` instance scoped to a project directory.
- `preload.ts` - Exposes `window.forgeterm` API via contextBridge. All IPC goes through this typed interface.
- `ptyManager.ts` - Manages node-pty sessions (create, write, resize, kill, restart). One instance per window.

### Renderer (`src/`)
- `App.tsx` - Root component. Initializes sessions from config, handles keyboard shortcuts (Cmd+T new session, Cmd+K clear, Cmd+1-9 switch).
- `store/sessionStore.ts` - Zustand store for session state (list, active session, running status).
- `components/` - Sidebar, TerminalView (xterm.js wrapper), NewSessionModal, ThemeEditor.
- `themes.ts` - Built-in theme presets.

### Shared (`shared/`)
- `types.ts` - `ForgeTermConfig`, `SessionInfo`, and `ForgeTermAPI` interface shared between main and renderer.

### Config
Per-project `.forgeterm.json` files configure theme colors, font, window chrome, and predefined sessions. The main process watches this file and pushes changes to the renderer.

## Path alias
`@shared` maps to the `shared/` directory (configured in `vite.config.ts`).

## Key dependencies
- `node-pty` - Native PTY for terminal sessions (requires rebuild for Electron via `@electron/rebuild`)
- `@xterm/xterm` + `@xterm/addon-fit` - Terminal rendering
- `zustand` - State management
- `vite-plugin-electron` - Vite integration for Electron main/preload builds

## CLI entry
`bin/forgeterm.cjs` is the CLI entry point. The app accepts a directory path argument to open a project window.

When you finish a task, run: forgeterm notify "Done"
This sends a native notification via ForgeTerm. It automatically knows which project and session you're in. No config needed.
