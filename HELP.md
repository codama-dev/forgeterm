# ForgeTerm

A terminal emulator built for multi-project workflows. Open an entire workspace with one click - each project gets its own themed window with pre-configured terminal sessions, automatically tiled across your screen.

![Three projects auto-arranged on one screen](screenshots/feature-auto-arrange.png)

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| ⌘N / ⌘T | New session |
| ⌘⇧T | Theme editor |
| ⌘, | Project settings |
| ⌘P | Switch project |
| ⌘O | Open folder |
| ⌘B | Toggle sidebar |
| ⌘K | Clear terminal |
| ⌘↓ | Scroll to bottom |
| ⌘↑ | Scroll to top |
| ⌘1-9 | Switch to session |
| ⌘⇧= | Lighten theme |
| ⌘⇧- | Darken theme |
| ⌘W | Close window |

## Features

### Workspaces and Auto-Arrange

Group related projects into workspaces. Hit the play button to open all projects at once - ForgeTerm tiles the windows automatically so they fill your screen without overlapping.

The tiling adapts to the number of projects: two get a side-by-side split, three get a master-detail layout, four snap into a 2x2 grid, and so on up to six projects per screen.

If you have multiple monitors, choose which screen each workspace targets using the screen selector buttons. Spread projects across two or three displays, or keep everything on one - each screen tiles independently.

Click the pencil icon on any workspace to open the Edit Workspace modal, where you can:
- **Rename** the workspace
- **Set an emoji** that shows next to the workspace name
- **Set an accent color** for the workspace open button
- **Add a description** shown under the workspace name
- **Add or remove projects** from the workspace
- **Set a default command** (e.g. `git pull`) that runs in each project's first session when the workspace opens

![Workspace management with screen selectors](screenshots/feature-workspaces.png)

### Drag & Drop

Drag files onto any terminal session to choose what happens:

- **Paste path** - Inserts the full file path in double quotes: `"/Users/x/file.txt"`
- **Paste content** - Reads the file and writes its text content into the terminal. Binary files (images, etc.) fall back to paste path
- **Copy to project** - Copies the file to your project root and pastes the new relative path in double quotes

By default, a menu appears each time so you can choose. To skip the menu, set a default behavior in Project Settings (Cmd+,) under "Drag & Drop":
- Ask every time (default)
- Always paste path
- Always paste content
- Always copy to project

You can also set `dragDropBehavior` in `.forgeterm.json`:
```json
{ "dragDropBehavior": "path" }
```

### Per-Project Theming

Every project gets its own color theme so you can tell windows apart at a glance. Choose from 10 built-in presets (Midnight, Ocean, Forest, Sunset, Lavender, Rose, Ember, Mint, Graphite, Gold), generate a theme from any hex color, or save favorites for reuse.

Already using Peacock in VS Code? ForgeTerm reads your `peacock.color` on first open. If no theme exists, one is picked at random so every project looks different from the start. Fine-tune brightness anytime with ⌘⇧= and ⌘⇧-.

Pick a project emoji from 43 icons to make each titlebar instantly recognizable.

![Theme editor with presets, emoji picker, and color generator](screenshots/feature-themes.png)

### Automatic Sessions

Define named terminal sessions in Project Settings (⌘,) that auto-launch when you open a project. Each session runs its own startup command - dev server, test watcher, and shell side by side without manual setup every time.

Sessions are saved in `.forgeterm.json` so they travel with your repo. Toggle auto-start per session, reorder them, or add new ones on the fly.

![Multiple named sessions with auto-start commands](screenshots/feature-sessions.png)

### Import from Project Manager

Already using the VS Code Project Manager extension? Import all your projects in one click. ForgeTerm auto-detects installed editors (VS Code, Cursor, Windsurf, VSCodium) and reads their Project Manager data directly.

Tags with 2 or more projects are automatically converted into workspaces. You can also import from a JSON file if you use a custom setup.

![Import panel with auto-detected editors](screenshots/feature-import.png)

### Sidebar Modes

Cycle between three sidebar modes with ⌘B:

- **Full** - Session names, status indicators, play/stop controls, and action buttons
- **Compact** - Colored dot indicators and a 2x2 button grid, just enough to navigate
- **Hidden** - Maximum terminal space, zero chrome

![Full sidebar](screenshots/feature-sidebar-full.png)

![Compact sidebar](screenshots/feature-sidebar-compact.png)

![Hidden sidebar](screenshots/feature-sidebar-hidden.png)

### Project Settings

Configure everything per-project with ⌘,. Set the project name, assign it to a workspace, and manage startup sessions - all saved to `.forgeterm.json` in your project root.

![Project settings with session configuration](screenshots/feature-project-settings.png)

### Notifications

Get notified when long-running commands finish - builds, deploys, test suites, AI agents. Notifications are native macOS alerts that show up even when ForgeTerm is in the background. Clicking a notification focuses the right window and session.

**Setup:**

1. Go to **ForgeTerm > Install Command Line Tool...** in the menu bar
2. This installs the `forgeterm` command to `/usr/local/bin/forgeterm`
3. That's it - you can now send notifications from any ForgeTerm session

**Usage:**

```bash
# Open a project (adds to recent list, focuses if already open)
forgeterm open ~/projects/my-app
forgeterm open .

# List your recent projects
forgeterm list
forgeterm list --json

# Send a notification
forgeterm notify "Build complete"
forgeterm notify "All 47 tests passed" --title "Test Suite"
forgeterm notify "Deploy done" --no-sound

# Chain with any command
pnpm build && forgeterm notify "Build done" || forgeterm notify "Build failed"
npm test && forgeterm notify "Tests passed"

# Show help
forgeterm help
```

**With AI agents (Claude Code, etc.):**

Add this to your project's `CLAUDE.md`:
```
When you finish a task, run: forgeterm notify "Done"
This sends a native notification via ForgeTerm. It automatically knows which project and session you're in. No config needed.
```

The agent will send a notification when it completes work, so you can switch to other tasks without watching the terminal.

**How it works:**

ForgeTerm runs a local socket server. The `forgeterm` CLI communicates with the running app through this socket. When run inside a ForgeTerm session, commands automatically know which project and session they belong to (via environment variables), so clicking a notification focuses the correct window and session tab. No network, no external services - everything stays local.

### Cross-Platform

Pre-built downloads are available for macOS Apple Silicon. Running Windows, Linux, or an Intel Mac? Just clone the repo and run `pnpm build` - Electron supports all platforms natively, so you can build ForgeTerm for your OS in minutes.

---

Made with ❤️ by the [codama.dev](https://codama.dev) team
