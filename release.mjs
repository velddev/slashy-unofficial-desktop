// Checks the build, then pushes the version tag. GitHub Actions (.github/workflows/release.yml) builds the Windows
// installer and the Linux AppImage from that tag and publishes them as one release.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })

run('npm', ['run', 'typecheck'])
run('npm', ['test'])
run('git', ['push', '--follow-tags'])
console.log(`\nv${version} is building: https://github.com/velddev/slashy-unofficial-desktop/actions/workflows/release.yml`)
