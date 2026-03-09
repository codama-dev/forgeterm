#!/usr/bin/env node

const { execSync } = require('child_process')
const path = require('path')
const net = require('net')
const os = require('os')

const subcommand = process.argv[2]

if (subcommand === 'notify') {
  handleNotify()
} else {
  // Default: launch Electron with folder path
  const folder = process.argv[2] || '.'
  const absPath = path.resolve(folder)

  const electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron')
  const mainPath = path.join(__dirname, '..', 'dist-electron', 'main.js')

  try {
    execSync(`"${electronPath}" "${mainPath}" "${absPath}"`, { stdio: 'inherit' })
  } catch {
    process.exit(1)
  }
}

function handleNotify() {
  const args = process.argv.slice(3)

  let message = ''
  let title = undefined
  let sound = true

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      title = args[++i]
    } else if (args[i] === '--no-sound') {
      sound = false
    } else if (args[i] === '--help' || args[i] === '-h') {
      printNotifyHelp()
      process.exit(0)
    } else if (!args[i].startsWith('-')) {
      message = args[i]
    }
  }

  if (!message) {
    printNotifyHelp()
    process.exit(1)
  }

  // Read context from environment (set automatically by ForgeTerm PTY)
  const projectPath = process.env.FORGETERM_PROJECT_PATH
  const sessionId = process.env.FORGETERM_SESSION_ID
  const sessionName = process.env.FORGETERM_SESSION_NAME

  // Determine socket path: env var first, then default
  let socketPath = process.env.FORGETERM_SOCKET
  if (!socketPath) {
    // Default: ~/Library/Application Support/ForgeTerm/forgeterm.sock (macOS)
    if (process.platform === 'darwin') {
      socketPath = path.join(os.homedir(), 'Library/Application Support/ForgeTerm/forgeterm.sock')
    } else {
      socketPath = path.join(os.homedir(), '.config/ForgeTerm/forgeterm.sock')
    }
  }

  const payload = { message, title, sound, projectPath, sessionId, sessionName }

  const client = net.createConnection(socketPath, () => {
    client.write(JSON.stringify(payload) + '\n')
  })

  let response = ''
  client.on('data', (data) => {
    response += data.toString()
    if (response.includes('\n')) {
      try {
        const result = JSON.parse(response.trim())
        if (!result.ok) {
          console.error('Notification failed:', result.error)
          process.exit(1)
        }
      } catch {
        // ignore parse errors
      }
      client.end()
      process.exit(0)
    }
  })

  client.on('error', (err) => {
    if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
      console.error('Could not connect to ForgeTerm. Is it running?')
    } else {
      console.error('Error:', err.message)
    }
    process.exit(1)
  })

  // Timeout after 5s
  const timeout = setTimeout(() => {
    client.destroy()
    console.error('Timed out waiting for ForgeTerm response')
    process.exit(1)
  }, 5000)
  timeout.unref()
}

function printNotifyHelp() {
  console.log(`
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

Tip: Add this to your project's CLAUDE.md:
  When you finish a task, run: forgeterm notify "Done"
`.trim())
}
