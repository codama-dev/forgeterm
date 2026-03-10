#!/bin/bash
# ForgeTerm CLI - lightweight command-line tool
# Installed to /usr/local/bin/forgeterm by ForgeTerm app

FORGETERM_VERSION="CLI 1.0"

# Determine socket path
if [ -n "$FORGETERM_SOCKET" ]; then
  SOCKET_PATH="$FORGETERM_SOCKET"
elif [ "$(uname)" = "Darwin" ]; then
  SOCKET_PATH="$HOME/Library/Application Support/ForgeTerm/forgeterm.sock"
else
  SOCKET_PATH="$HOME/.config/ForgeTerm/forgeterm.sock"
fi

usage() {
  cat <<'USAGE'
Usage: forgeterm <command> [options]

Commands:
  notify "message"    Send a native notification via ForgeTerm
  open [path]         Open a folder in ForgeTerm
  help                Show this help

Run 'forgeterm <command> --help' for command-specific help.
USAGE
}

notify_usage() {
  cat <<'USAGE'
Usage: forgeterm notify "message" [options]

Send a macOS notification through the running ForgeTerm app.
When run inside a ForgeTerm session, the notification automatically
includes project and session context. Clicking it focuses that window.

Options:
  --title "title"   Custom notification title (defaults to project name)
  --no-sound        Suppress notification sound
  -h, --help        Show this help

Examples:
  forgeterm notify "Build complete"
  forgeterm notify "Tests passed" --title "CI"
  forgeterm notify "Deploy done" --no-sound

  # Chain with any command:
  pnpm build && forgeterm notify "Build done" || forgeterm notify "Build failed"

  # Add to your project's CLAUDE.md so AI agents notify you:
  #   When you finish a task, run: forgeterm notify "Done"
USAGE
}

cmd_notify() {
  local message=""
  local title=""
  local sound="true"

  while [ $# -gt 0 ]; do
    case "$1" in
      --title)
        shift
        title="$1"
        ;;
      --no-sound)
        sound="false"
        ;;
      -h|--help)
        notify_usage
        exit 0
        ;;
      -*)
        echo "Unknown option: $1" >&2
        exit 1
        ;;
      *)
        message="$1"
        ;;
    esac
    shift
  done

  if [ -z "$message" ]; then
    notify_usage
    exit 1
  fi

  if [ ! -S "$SOCKET_PATH" ]; then
    echo "Could not connect to ForgeTerm. Is it running?" >&2
    exit 1
  fi

  # Build JSON payload
  local json="{"
  json+="\"message\":$(json_string "$message")"
  [ -n "$title" ] && json+=",\"title\":$(json_string "$title")"
  [ "$sound" = "false" ] && json+=",\"sound\":false"
  [ -n "$FORGETERM_PROJECT_PATH" ] && json+=",\"projectPath\":$(json_string "$FORGETERM_PROJECT_PATH")"
  [ -n "$FORGETERM_SESSION_ID" ] && json+=",\"sessionId\":$(json_string "$FORGETERM_SESSION_ID")"
  [ -n "$FORGETERM_SESSION_NAME" ] && json+=",\"sessionName\":$(json_string "$FORGETERM_SESSION_NAME")"
  json+="}"

  # Send via Unix socket (use nc or socat)
  local response
  if command -v nc &>/dev/null; then
    response=$(echo "$json" | nc -U -w 5 "$SOCKET_PATH" 2>/dev/null)
  elif command -v socat &>/dev/null; then
    response=$(echo "$json" | socat - UNIX-CONNECT:"$SOCKET_PATH" 2>/dev/null)
  else
    # Fallback: use bash /dev/tcp won't work for Unix sockets, try python
    if command -v python3 &>/dev/null; then
      response=$(python3 -c "
import socket, sys, json
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.settimeout(5)
s.connect('$SOCKET_PATH')
s.sendall(b'$json\n')
data = s.recv(4096)
s.close()
print(data.decode())
" 2>/dev/null)
    else
      echo "No suitable socket client found (need nc, socat, or python3)" >&2
      exit 1
    fi
  fi

  if echo "$response" | grep -q '"ok":true'; then
    exit 0
  elif [ -z "$response" ]; then
    echo "No response from ForgeTerm (timed out)" >&2
    exit 1
  else
    echo "Notification failed: $response" >&2
    exit 1
  fi
}

cmd_open() {
  local target="${1:-.}"
  local abs_path
  abs_path=$(cd "$target" 2>/dev/null && pwd)
  if [ -z "$abs_path" ]; then
    echo "Not a directory: $target" >&2
    exit 1
  fi

  if [ "$(uname)" = "Darwin" ]; then
    open -a ForgeTerm "$abs_path" 2>/dev/null || open "$abs_path" --args "$abs_path"
  else
    echo "Opening via CLI is only supported on macOS currently" >&2
    exit 1
  fi
}

# Minimal JSON string escaping
json_string() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\t'/\\t}"
  echo "\"$s\""
}

# Main dispatch
case "${1:-}" in
  notify)
    shift
    cmd_notify "$@"
    ;;
  open)
    shift
    cmd_open "$@"
    ;;
  help|--help|-h)
    usage
    ;;
  --version|-v)
    echo "forgeterm $FORGETERM_VERSION"
    ;;
  "")
    usage
    ;;
  *)
    echo "Unknown command: $1" >&2
    echo "Run 'forgeterm help' for usage." >&2
    exit 1
    ;;
esac
