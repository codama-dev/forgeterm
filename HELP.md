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
| ⌘1-9 | Switch to session |
| ⌘⇧= | Lighten theme |
| ⌘⇧- | Darken theme |
| ⌘W | Close window |

## Features

### Workspaces and Auto-Arrange

Group related projects into workspaces. Hit the play button to open all projects at once - ForgeTerm tiles the windows automatically so they fill your screen without overlapping.

The tiling adapts to the number of projects: two get a side-by-side split, three get a master-detail layout, four snap into a 2x2 grid, and so on up to six projects per screen.

If you have multiple monitors, choose which screen each workspace targets using the screen selector buttons. Spread projects across two or three displays, or keep everything on one - each screen tiles independently.

![Workspace management with screen selectors](screenshots/feature-workspaces.png)

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

---

Made with ❤️ by the [codama.dev](https://codama.dev) team
