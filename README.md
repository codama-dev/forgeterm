# ForgeTerm

A terminal emulator built for developers who work with multiple terminal sessions, LLMs, and project-based workflows.

ForgeTerm opens per-project windows with preconfigured terminal sessions, custom themes, and a sidebar for quick navigation - so you can stop juggling tabs and start shipping.

## Features

- **Per-project config** - Drop a `.forgeterm.json` in any project to define startup sessions, themes, and window settings
- **Multiple sessions** - Run several terminal sessions side by side in a single window with instant switching (Cmd+1-9)
- **Auto-start commands** - Define commands that run automatically when you open a project (dev server, watchers, builds)
- **Themeable** - 10 built-in themes with a visual theme editor, or define custom colors per project
- **Project switcher** - Jump between recent projects with Cmd+P
- **CLI entry** - Run `forgeterm .` or `forgeterm /path/to/project` to open any directory

## Why ForgeTerm?

When working with LLMs like Claude Code, you often have multiple terminals open - one for the AI, one for your dev server, one for git, one for tests. ForgeTerm lets you predefine all of those per project so opening a project means everything is ready to go.

## Download

**[Download ForgeTerm v0.1.0 for macOS (Apple Silicon)](https://github.com/codama-dev/forgeterm/releases/download/v0.1.0/ForgeTerm-Mac-0.1.0.dmg)**

See all releases on the [Releases page](https://github.com/codama-dev/forgeterm/releases).

## Build from Source

```bash
git clone https://github.com/codama-dev/forgeterm.git
cd forgeterm
pnpm install

# Dev mode
pnpm dev

# Package
pnpm build
```

## Project Config

Create a `.forgeterm.json` in your project root:

```json
{
  "projectName": "My App",
  "sessions": [
    { "name": "Dev Server", "command": "pnpm dev", "autoStart": true },
    { "name": "Tests", "command": "pnpm test --watch" },
    { "name": "Shell" }
  ],
  "window": {
    "emoji": "🚀",
    "themeName": "Tokyo Night"
  },
  "font": {
    "family": "JetBrains Mono",
    "size": 14
  }
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+N / Cmd+T | New session |
| Cmd+1-9 | Switch to session |
| Cmd+K | Clear terminal |
| Cmd+P | Project switcher |
| Cmd+, | Project settings |
| Cmd+Shift+T | Theme editor |

## Architecture

Three-layer Electron app:

- **Main process** (`electron/`) - App lifecycle, window management, PTY sessions via node-pty
- **Preload bridge** (`electron/preload.ts`) - Typed IPC interface exposed as `window.forgeterm`
- **Renderer** (`src/`) - React + Zustand + xterm.js

## Tech Stack

- Electron
- React 18
- TypeScript
- xterm.js + node-pty
- Zustand
- Vite

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## License

[MIT](LICENSE)
