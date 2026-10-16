// Builds the installer and publishes it as a GitHub release (needs `gh auth login`).
// electron-builder's own GitHub publisher races itself (two publishers per run) and drops assets, so gh uploads instead.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
const exe = `dist/Slashy-Setup-${version}.exe`

run('git', ['push', '--follow-tags'])
run('npm', ['run', 'typecheck'])
run('npm', ['run', 'build'])
run('npx', ['electron-builder', '--win', '--publish', 'never'])
run('gh', ['release', 'create', `v${version}`, exe, `${exe}.blockmap`, 'dist/latest.yml', '--verify-tag', '--title', version, '--generate-notes'])
