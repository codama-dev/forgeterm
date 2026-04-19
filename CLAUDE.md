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


<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **forgeterm** (519 symbols, 1312 relationships, 43 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/forgeterm/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/forgeterm/context` | Codebase overview, check index freshness |
| `gitnexus://repo/forgeterm/clusters` | All functional areas |
| `gitnexus://repo/forgeterm/processes` | All execution flows |
| `gitnexus://repo/forgeterm/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
