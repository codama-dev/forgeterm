#!/usr/bin/env node

const { execSync } = require('child_process')
const path = require('path')

const folder = process.argv[2] || '.'
const absPath = path.resolve(folder)

const electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron')
const mainPath = path.join(__dirname, '..', 'dist-electron', 'main.js')

try {
  execSync(`"${electronPath}" "${mainPath}" "${absPath}"`, { stdio: 'inherit' })
} catch {
  process.exit(1)
}
