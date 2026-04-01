# Claude Code + ForgeTerm Integration

This file contains the setup prompt for connecting Claude Code to ForgeTerm.

## How it works

1. ForgeTerm checks `~/.claude/CLAUDE.md` for a version marker: `<!-- forgeterm:v:X.Y.Z -->`
2. If missing or outdated, a banner appears in the terminal area
3. Clicking the banner copies a setup prompt to clipboard
4. User pastes the prompt to Claude Code, which updates `~/.claude/CLAUDE.md`
5. The marker confirms the connection and version sync

## Manual setup

If you prefer to set it up manually, copy the prompt below and paste it to Claude Code:

---

I use ForgeTerm as my terminal for Claude Code. Please update my global Claude Code instructions (~/.claude/CLAUDE.md) to include the ForgeTerm integration section below.

IMPORTANT: If there's already a "ForgeTerm Integration" section in ~/.claude/CLAUDE.md, replace it entirely with the new version below. If not, add it.

The section MUST end with this exact comment (it's how ForgeTerm detects the connection):
`<!-- forgeterm:v:VERSION -->`

(Replace VERSION with the ForgeTerm version shown in the banner or from `ft --version`)

Here is the section to add/replace:

```markdown
## ForgeTerm Integration

Nadav uses ForgeTerm as his only terminal for Claude Code. ForgeTerm exposes a CLI (`ft`, also available as `forgeterm`) that communicates with the running app over a Unix socket. Use these commands proactively to keep the ForgeTerm UI informative.

### Session Rename
When the user gives their first real task in a conversation, rename the session to reflect the work:
```bash
ft rename "Refactoring auth middleware"
```
- Keep it short (2-5 words), descriptive of the task
- Update it if the task changes significantly mid-conversation

### Session Info Card
Update the sidebar info card at key milestones:
```bash
ft info \
  --title "Refactoring auth middleware" \
  --summary "Splitting auth.ts into JWT and session modules." \
  --last "Extracted JWT validation into jwt.ts"
```

### Notifications
```bash
ft notify "Done"
ft notify "Build failed" --title "CI"
```

### Full CLI Reference
```
ft notify "msg"                        # Send notification
ft rename "name"                       # Rename current session
ft info --title ... --summary ...      # Update session info card
ft open <path>                         # Open a project
ft list                                # List recent projects

ft project list|open|remove            # Manage projects
ft session list|add|remove             # Manage sessions
ft workspace list|create|delete|rename # Manage workspaces
ft config get [key] [--project <path>] # Read project config
ft config set <key> <value>            # Write project config
ft theme list|set|terminal|favorites   # Manage themes
```

### Typical Flow
1. User gives a task -> `ft rename "Fix login bug"`
2. Start working -> `ft info --title "Fix login bug" --summary "Investigating" --last "Reading code"`
3. Make progress -> update info
4. Finish -> `ft info ... --last "Done"` then `ft notify "Done"`

<!-- forgeterm:v:VERSION -->
```

After updating CLAUDE.md, confirm the change was made.
