# ForgeTerm Remote Control - Implementation Plan

## Goal

Control ForgeTerm terminal sessions remotely from a phone (or any device with a browser). Send text commands, see output, optionally use voice input. Personal use only for now.

## Architecture Overview

```
Phone (browser)
  |
  | HTTPS / WSS
  |
Cloudflare Access (Zero Trust - email OTP auth)
  |
  | cloudflared tunnel
  |
ForgeTerm (local WebSocket + HTTP server)
  |
  | Internal IPC to node-pty sessions
  |
Terminal Sessions
```

Three layers of security sit between the phone and the terminal sessions:
1. Cloudflare Access (identity verification before traffic reaches the machine)
2. App-level auth (token issued during pairing)
3. TLS everywhere (handled by Cloudflare)

---

## Security Model

This is remote code execution on a personal machine. Security is non-negotiable.

### Layer 1: Cloudflare Access (Zero Trust)

- Cloudflare Access policy gates the tunnel endpoint
- Only a specific email (yours) can authenticate
- Auth method: one-time code sent to email
- Unauthorized requests never reach your machine - blocked at Cloudflare's edge
- Access token stored as a cookie, expires after configurable duration

### Layer 2: App-level Authentication

- On first connection, ForgeTerm generates a pairing token (displayed as QR code in the app)
- Phone scans QR code to receive the token
- Token is a signed JWT with expiry (e.g., 7 days)
- Token stored in browser localStorage
- Refreshable from the Mac app without re-pairing
- ForgeTerm can revoke all tokens instantly (kill switch in settings)

### Layer 3: Transport

- All traffic encrypted via TLS (Cloudflare handles cert)
- WebSocket connections upgraded from HTTPS
- No plaintext anywhere in the chain

### Additional Safeguards

- **Rate limiting** - Max N commands per minute from remote clients
- **Audit log** - Every remote command logged with timestamp, session target, and source IP
- **Read-only mode option** - View session output without ability to send input
- **Session allowlist** - Optionally restrict which sessions are remotely accessible
- **Auto-lock** - Remote access auto-disables after X hours of inactivity
- **Visual indicator** - ForgeTerm shows a persistent badge/icon when remote access is active so you always know it's on

---

## Implementation Phases

### Phase 1: WebSocket Server in ForgeTerm

Add a local server to the Electron main process that exposes terminal sessions over WebSocket.

**New file: `electron/remoteServer.ts`**

Responsibilities:
- Start an HTTP + WebSocket server on a configurable local port (default: random available port)
- Expose REST endpoints:
  - `GET /api/status` - server health check, app version
  - `GET /api/sessions` - list all open windows, their projects, and sessions (id, name, running status)
  - `POST /api/sessions/:id/command` - send a command string to a session
- Expose WebSocket endpoint:
  - `WS /api/sessions/:id/stream` - bidirectional: send input, receive output stream
- Auth middleware: validate JWT on every request/connection
- Rate limiter middleware

**Changes to `electron/main.ts`**

- Import and start the remote server on app ready
- Pass references to open windows / PtyManager instances so the server can route commands
- Add IPC handlers for:
  - `remote:get-status` - is the server running, what port, tunnel status
  - `remote:toggle` - enable/disable the remote server
  - `remote:generate-token` - create a new pairing JWT
  - `remote:revoke-tokens` - invalidate all issued tokens
  - `remote:get-audit-log` - return recent remote commands

**Changes to `electron/ptyManager.ts`**

- Expose a method to subscribe to session output (for streaming to remote clients)
- Currently output goes to renderer via IPC; add an EventEmitter or callback mechanism so the remote server can also listen

### Phase 2: Cloudflare Tunnel Integration

Automate tunnel setup from within ForgeTerm.

**Tunnel management in `electron/remoteServer.ts` (or separate `electron/tunnel.ts`)**

- Check if `cloudflared` is installed (prompt to install via Homebrew if not)
- Start a named tunnel pointing to the local server port
- Use a subdomain on your existing Cloudflare domain (e.g., `ft.yourdomain.com`)
- Store tunnel config in ForgeTerm's userData directory
- Monitor tunnel process health, auto-restart if it drops
- Expose tunnel URL to the renderer so it can show it / generate QR code

**Cloudflare Access setup (one-time, manual)**

- Create an Access Application in Cloudflare dashboard for the tunnel hostname
- Policy: allow only your email, require email OTP
- This is a one-time manual step, documented in a setup guide

### Phase 3: Web Client (Phone UI)

A lightweight web page served by the ForgeTerm server itself. Open it in your phone browser - no app install needed.

**Served from: `electron/remote-client/` (static files bundled with the app)**

Pages/views:
1. **Login** - Enter pairing token (or scan QR code via phone camera)
2. **Dashboard** - List of open projects and their sessions, with status indicators
3. **Session view** - Terminal-like view showing recent output (last ~100 lines), text input field at bottom, send button
4. **Voice input** - Button that uses the browser's Web Speech API (`SpeechRecognition`) for voice-to-text, then sends as a command

Design considerations:
- Mobile-first, minimal UI
- Dark theme matching ForgeTerm's aesthetic
- Works as a PWA (add to home screen for app-like experience)
- Minimal JS, no heavy framework needed - vanilla or Preact
- Output display doesn't need to be a full terminal emulator - just a scrollable monospace log of recent lines

### Phase 4: Polish and Quality of Life

- **Push notifications** - When a long-running command finishes, send a browser push notification to the phone (Web Push API, no native app needed)
- **Quick commands** - Configurable buttons on the phone UI for common commands (git status, pnpm dev, etc.) per project
- **Voice command interpretation** - Optional: pipe transcribed voice through a local LLM to convert natural language to shell commands before sending
- **Multi-window support** - Phone UI shows all open ForgeTerm windows/projects, navigate between them
- **Connection status** - Phone UI shows real-time connection quality, auto-reconnects on drop

---

## File Structure (new files)

```
electron/
  remoteServer.ts       # HTTP + WS server, auth, rate limiting
  tunnel.ts             # Cloudflare tunnel lifecycle management
  remoteAuth.ts         # JWT generation, validation, revocation
  remote-client/        # Static web client files
    index.html
    app.js
    style.css
    manifest.json       # PWA manifest
shared/
  types.ts              # Add RemoteSession, RemoteCommand types
```

## Config Additions

New fields in ForgeTerm's app-level settings (stored in userData, not per-project):

```json
{
  "remote": {
    "enabled": false,
    "port": 0,
    "tunnelHostname": "ft.yourdomain.com",
    "tokenSecret": "...",
    "autoLockMinutes": 120,
    "rateLimitPerMinute": 30,
    "readOnlyDefault": false
  }
}
```

## Dependencies (new)

- `ws` - WebSocket server (lightweight, no socket.io bloat)
- `jsonwebtoken` - JWT signing/verification
- No new dependencies for Cloudflare tunnel (uses `cloudflared` CLI binary)
- Web Speech API is built into browsers, no dependency needed

---

## Open Questions

- [ ] Should remote clients see full terminal output stream or just last N lines on connect?
- [ ] Do we need per-session access control (some sessions remotely accessible, others not)?
- [ ] Should the web client support sending Ctrl+C / Ctrl+D / other control sequences?
- [ ] Store audit log in a file or SQLite?
- [ ] Should tunnel auto-start when ForgeTerm opens, or require manual activation each time?
