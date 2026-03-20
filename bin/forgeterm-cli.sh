#!/bin/bash
# ForgeTerm CLI - lightweight command-line tool
# Installed to /usr/local/bin/forgeterm by ForgeTerm app

FORGETERM_VERSION="CLI 1.1"

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
  notify "message"        Send a native notification via ForgeTerm
  open [path]             Open a project in the running ForgeTerm app
  open-workspace [path]   Open a folder's children as a workspace
  list [--json]           List recent projects
  help                    Show this help

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

# Minimal JSON string escaping
json_string() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\t'/\\t}"
  echo "\"$s\""
}

# Send JSON payload to the ForgeTerm socket, return response
send_to_socket() {
  local json="$1"

  if [ ! -S "$SOCKET_PATH" ]; then
    echo "Could not connect to ForgeTerm. Is it running?" >&2
    return 1
  fi

  local response
  if command -v nc &>/dev/null; then
    response=$(echo "$json" | nc -U -w 5 "$SOCKET_PATH" 2>/dev/null)
  elif command -v socat &>/dev/null; then
    response=$(echo "$json" | socat - UNIX-CONNECT:"$SOCKET_PATH" 2>/dev/null)
  else
    if command -v python3 &>/dev/null; then
      response=$(python3 -c "
import socket, sys
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.settimeout(5)
s.connect('$SOCKET_PATH')
s.sendall(b'$json\n')
data = s.recv(65536)
s.close()
print(data.decode())
" 2>/dev/null)
    else
      echo "No suitable socket client found (need nc, socat, or python3)" >&2
      return 1
    fi
  fi

  if [ -z "$response" ]; then
    echo "No response from ForgeTerm (timed out)" >&2
    return 1
  fi

  echo "$response"
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

  # Build JSON payload
  local json="{"
  json+="\"command\":\"notify\""
  json+=",\"message\":$(json_string "$message")"
  [ -n "$title" ] && json+=",\"title\":$(json_string "$title")"
  [ "$sound" = "false" ] && json+=",\"sound\":false"
  [ -n "$FORGETERM_PROJECT_PATH" ] && json+=",\"projectPath\":$(json_string "$FORGETERM_PROJECT_PATH")"
  [ -n "$FORGETERM_SESSION_ID" ] && json+=",\"sessionId\":$(json_string "$FORGETERM_SESSION_ID")"
  [ -n "$FORGETERM_SESSION_NAME" ] && json+=",\"sessionName\":$(json_string "$FORGETERM_SESSION_NAME")"
  json+="}"

  local response
  response=$(send_to_socket "$json") || exit 1

  if echo "$response" | grep -q '"ok":true'; then
    exit 0
  else
    echo "Notification failed: $response" >&2
    exit 1
  fi
}

cmd_open() {
  if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    cat <<'USAGE'
Usage: forgeterm open <path>

Open a directory in ForgeTerm. If the project is already open, it focuses
the existing window. Otherwise it creates a new window and adds the project
to your recent projects list.

Examples:
  forgeterm open .
  forgeterm open ~/projects/my-app
  forgeterm open /absolute/path/to/project
USAGE
    exit 0
  fi

  local target="${1:-.}"
  local abs_path
  abs_path=$(cd "$target" 2>/dev/null && pwd)
  if [ -z "$abs_path" ]; then
    echo "Not a directory: $target" >&2
    exit 1
  fi

  local json="{\"command\":\"open\",\"path\":$(json_string "$abs_path")}"
  local response
  response=$(send_to_socket "$json") || exit 1

  if echo "$response" | grep -q '"ok":true'; then
    echo "Opened $abs_path"
  else
    echo "Failed to open project: $response" >&2
    exit 1
  fi
}

cmd_list() {
  local json_output=false

  while [ $# -gt 0 ]; do
    case "$1" in
      --json)
        json_output=true
        ;;
      -h|--help)
        cat <<'USAGE'
Usage: forgeterm list [options]

List your recent ForgeTerm projects.

Options:
  --json      Output as JSON
  -h, --help  Show this help
USAGE
        exit 0
        ;;
    esac
    shift
  done

  local json='{"command":"list"}'
  local response
  response=$(send_to_socket "$json") || exit 1

  if ! echo "$response" | grep -q '"ok":true'; then
    echo "Failed to list projects: $response" >&2
    exit 1
  fi

  if [ "$json_output" = true ]; then
    # Extract data array from response
    if command -v python3 &>/dev/null; then
      echo "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(json.dumps(data.get('data', []), indent=2))
"
    else
      echo "$response"
    fi
  else
    if command -v python3 &>/dev/null; then
      echo "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
projects = data.get('data', [])
if not projects:
    print('No recent projects.')
else:
    for p in projects:
        ws = f' [{p[\"workspace\"]}]' if p.get('workspace') else ''
        print(f'  {p[\"name\"]}{ws}')
        print(f'    {p[\"path\"]}')
"
    else
      echo "$response"
    fi
  fi
}

cmd_open_workspace() {
  if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    cat <<'USAGE'
Usage: forgeterm open-workspace <path>

Open a folder as a workspace. All immediate child directories become
projects in the workspace. The workspace is named after the folder.

Examples:
  forgeterm open-workspace ~/projects
  forgeterm open-workspace .
USAGE
    exit 0
  fi

  local target="${1:-.}"
  local abs_path
  abs_path=$(cd "$target" 2>/dev/null && pwd)
  if [ -z "$abs_path" ]; then
    echo "Not a directory: $target" >&2
    exit 1
  fi

  local json="{\"command\":\"open-workspace\",\"path\":$(json_string "$abs_path")}"
  local response
  response=$(send_to_socket "$json") || exit 1

  if echo "$response" | grep -q '"ok":true'; then
    echo "Opened workspace from $abs_path"
  else
    echo "Failed to open workspace: $response" >&2
    exit 1
  fi
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
  list)
    shift
    cmd_list "$@"
    ;;
  open-workspace)
    shift
    cmd_open_workspace "$@"
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
