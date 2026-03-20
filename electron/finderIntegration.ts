import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const SERVICES_DIR = path.join(process.env.HOME || '~', 'Library', 'Services')
const WORKFLOW_OPEN = 'Open in ForgeTerm.workflow'
const WORKFLOW_WORKSPACE = 'Open as Workspace in ForgeTerm.workflow'

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function generateWorkflow(shellScript: string): string {
  const escaped = xmlEscape(shellScript)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>AMApplicationBuild</key>
\t<string>523</string>
\t<key>AMApplicationVersion</key>
\t<string>2.10</string>
\t<key>AMDocumentVersion</key>
\t<string>2</string>
\t<key>actions</key>
\t<array>
\t\t<dict>
\t\t\t<key>action</key>
\t\t\t<dict>
\t\t\t\t<key>AMAccepts</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>Container</key>
\t\t\t\t\t<string>List</string>
\t\t\t\t\t<key>Optional</key>
\t\t\t\t\t<false/>
\t\t\t\t\t<key>Types</key>
\t\t\t\t\t<array>
\t\t\t\t\t\t<string>com.apple.cocoa.string</string>
\t\t\t\t\t</array>
\t\t\t\t</dict>
\t\t\t\t<key>AMActionVersion</key>
\t\t\t\t<string>2.0.3</string>
\t\t\t\t<key>AMApplication</key>
\t\t\t\t<array>
\t\t\t\t\t<string>Automator</string>
\t\t\t\t</array>
\t\t\t\t<key>AMParameterProperties</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>COMMAND_STRING</key>
\t\t\t\t\t<dict/>
\t\t\t\t\t<key>inputMethod</key>
\t\t\t\t\t<dict/>
\t\t\t\t\t<key>shell</key>
\t\t\t\t\t<dict/>
\t\t\t\t\t<key>source</key>
\t\t\t\t\t<dict/>
\t\t\t\t</dict>
\t\t\t\t<key>AMProvides</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>Container</key>
\t\t\t\t\t<string>List</string>
\t\t\t\t\t<key>Types</key>
\t\t\t\t\t<array>
\t\t\t\t\t\t<string>com.apple.cocoa.string</string>
\t\t\t\t\t</array>
\t\t\t\t</dict>
\t\t\t\t<key>ActionBundlePath</key>
\t\t\t\t<string>/System/Library/Automator/Run Shell Script.action</string>
\t\t\t\t<key>ActionName</key>
\t\t\t\t<string>Run Shell Script</string>
\t\t\t\t<key>ActionParameters</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>COMMAND_STRING</key>
\t\t\t\t\t<string>${escaped}</string>
\t\t\t\t\t<key>CheckedForUserDefaultShell</key>
\t\t\t\t\t<true/>
\t\t\t\t\t<key>inputMethod</key>
\t\t\t\t\t<integer>1</integer>
\t\t\t\t\t<key>shell</key>
\t\t\t\t\t<string>/bin/bash</string>
\t\t\t\t\t<key>source</key>
\t\t\t\t\t<string></string>
\t\t\t\t</dict>
\t\t\t\t<key>BundleIdentifier</key>
\t\t\t\t<string>com.apple.RunShellScript</string>
\t\t\t\t<key>CFBundleVersion</key>
\t\t\t\t<string>2.0.3</string>
\t\t\t\t<key>CanShowSelectedItemsWhenRun</key>
\t\t\t\t<false/>
\t\t\t\t<key>CanShowWhenRun</key>
\t\t\t\t<true/>
\t\t\t\t<key>Category</key>
\t\t\t\t<array>
\t\t\t\t\t<string>AMCategoryUtilities</string>
\t\t\t\t</array>
\t\t\t\t<key>Class Name</key>
\t\t\t\t<string>RunShellScriptAction</string>
\t\t\t\t<key>InputUUID</key>
\t\t\t\t<string>F47AC10B-58CC-4372-A567-0E02B2C3D479</string>
\t\t\t\t<key>Keywords</key>
\t\t\t\t<array>
\t\t\t\t\t<string>Shell</string>
\t\t\t\t\t<string>Script</string>
\t\t\t\t\t<string>Command</string>
\t\t\t\t\t<string>Run</string>
\t\t\t\t\t<string>Unix</string>
\t\t\t\t</array>
\t\t\t\t<key>OutputUUID</key>
\t\t\t\t<string>A1234567-B890-CDEF-1234-567890ABCDEF</string>
\t\t\t\t<key>UUID</key>
\t\t\t\t<string>D4E5F6A7-B8C9-0123-4567-89ABCDEF0123</string>
\t\t\t\t<key>UnlocalizedApplications</key>
\t\t\t\t<array>
\t\t\t\t\t<string>Automator</string>
\t\t\t\t</array>
\t\t\t\t<key>arguments</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>0</key>
\t\t\t\t\t<dict>
\t\t\t\t\t\t<key>default value</key>
\t\t\t\t\t\t<integer>0</integer>
\t\t\t\t\t\t<key>name</key>
\t\t\t\t\t\t<string>inputMethod</string>
\t\t\t\t\t\t<key>required</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>type</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>uuid</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t</dict>
\t\t\t\t\t<key>1</key>
\t\t\t\t\t<dict>
\t\t\t\t\t\t<key>default value</key>
\t\t\t\t\t\t<string></string>
\t\t\t\t\t\t<key>name</key>
\t\t\t\t\t\t<string>source</string>
\t\t\t\t\t\t<key>required</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>type</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>uuid</key>
\t\t\t\t\t\t<string>1</string>
\t\t\t\t\t</dict>
\t\t\t\t\t<key>2</key>
\t\t\t\t\t<dict>
\t\t\t\t\t\t<key>default value</key>
\t\t\t\t\t\t<false/>
\t\t\t\t\t\t<key>name</key>
\t\t\t\t\t\t<string>CheckedForUserDefaultShell</string>
\t\t\t\t\t\t<key>required</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>type</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>uuid</key>
\t\t\t\t\t\t<string>2</string>
\t\t\t\t\t</dict>
\t\t\t\t\t<key>3</key>
\t\t\t\t\t<dict>
\t\t\t\t\t\t<key>default value</key>
\t\t\t\t\t\t<string></string>
\t\t\t\t\t\t<key>name</key>
\t\t\t\t\t\t<string>COMMAND_STRING</string>
\t\t\t\t\t\t<key>required</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>type</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>uuid</key>
\t\t\t\t\t\t<string>3</string>
\t\t\t\t\t</dict>
\t\t\t\t\t<key>4</key>
\t\t\t\t\t<dict>
\t\t\t\t\t\t<key>default value</key>
\t\t\t\t\t\t<string>/bin/bash</string>
\t\t\t\t\t\t<key>name</key>
\t\t\t\t\t\t<string>shell</string>
\t\t\t\t\t\t<key>required</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>type</key>
\t\t\t\t\t\t<string>0</string>
\t\t\t\t\t\t<key>uuid</key>
\t\t\t\t\t\t<string>4</string>
\t\t\t\t\t</dict>
\t\t\t\t</dict>
\t\t\t\t<key>isViewVisible</key>
\t\t\t\t<true/>
\t\t\t\t<key>location</key>
\t\t\t\t<string>449.000000:253.000000</string>
\t\t\t\t<key>nibPath</key>
\t\t\t\t<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
\t\t\t</dict>
\t\t\t<key>isViewVisible</key>
\t\t\t<true/>
\t\t</dict>
\t</array>
\t<key>connectors</key>
\t<dict/>
\t<key>workflowMetaData</key>
\t<dict>
\t\t<key>serviceInputTypeIdentifier</key>
\t\t<string>com.apple.Automator.fileSystemObject.folder</string>
\t\t<key>serviceOutputTypeIdentifier</key>
\t\t<string>com.apple.Automator.nothing</string>
\t\t<key>serviceProcessesInput</key>
\t\t<integer>0</integer>
\t\t<key>workflowTypeIdentifier</key>
\t\t<string>com.apple.Automator.servicesMenu</string>
\t</dict>
</dict>
</plist>`
}

function writeWorkflowBundle(bundlePath: string, shellScript: string) {
  const contentsDir = path.join(bundlePath, 'Contents')
  fs.mkdirSync(contentsDir, { recursive: true })
  fs.writeFileSync(path.join(contentsDir, 'document.wflow'), generateWorkflow(shellScript), 'utf-8')
  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict/>
</plist>
`, 'utf-8')
}

export function isFinderIntegrationInstalled(): boolean {
  return (
    fs.existsSync(path.join(SERVICES_DIR, WORKFLOW_OPEN)) &&
    fs.existsSync(path.join(SERVICES_DIR, WORKFLOW_WORKSPACE))
  )
}

export function installFinderIntegration(): { success: boolean; error?: string } {
  try {
    fs.mkdirSync(SERVICES_DIR, { recursive: true })

    const openScript = `for f in "$@"; do
  /usr/local/bin/forgeterm open "$f" 2>/dev/null
done`

    const workspaceScript = `for f in "$@"; do
  /usr/local/bin/forgeterm open-workspace "$f" 2>/dev/null
done`

    writeWorkflowBundle(path.join(SERVICES_DIR, WORKFLOW_OPEN), openScript)
    writeWorkflowBundle(path.join(SERVICES_DIR, WORKFLOW_WORKSPACE), workspaceScript)

    // Refresh macOS services cache
    try {
      execSync('/System/Library/CoreServices/pbs -update', { timeout: 5000 })
    } catch {
      // Not critical if this fails
    }

    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
}

export function uninstallFinderIntegration(): { success: boolean; error?: string } {
  try {
    const openPath = path.join(SERVICES_DIR, WORKFLOW_OPEN)
    const workspacePath = path.join(SERVICES_DIR, WORKFLOW_WORKSPACE)
    if (fs.existsSync(openPath)) fs.rmSync(openPath, { recursive: true })
    if (fs.existsSync(workspacePath)) fs.rmSync(workspacePath, { recursive: true })

    try {
      execSync('/System/Library/CoreServices/pbs -update', { timeout: 5000 })
    } catch {
      // Not critical
    }

    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
}
