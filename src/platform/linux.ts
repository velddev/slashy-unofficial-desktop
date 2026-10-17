// Linux: apps, their URL schemes and file types are found through the installed slashy.desktop (its MimeType line is
// the registration), and xdg-mime reads and sets the defaults. See DEVELOPMENT.md > Linux.
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Platform } from './index.ts'

const DESKTOP_FILE = 'slashy.desktop' // matches package.json desktopName
const xdgMime = (...args: string[]) => promisify(execFile)('xdg-mime', args)
const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
const quoteExec = (arg: string) => `"${arg.replace(/["`$\\]/g, '\\$&')}"` // desktop entry spec quoting

export const linux: Platform = {
  async isMailDefault() {
    return (await xdgMime('query', 'default', 'x-scheme-handler/mailto').catch(() => ({ stdout: '' }))).stdout.trim() === DESKTOP_FILE
  },

  // A folder install brings its own slashy.desktop (DEVELOPMENT.md > Linux). An AppImage is just a file, so it writes
  // one pointing at wherever it is now, rewritten every start like the Windows registry entries.
  async registerMailApp() {
    const appImage = process.env.APPIMAGE
    if (!appImage) return
    const icon = path.join(dataHome, 'icons', 'hicolor', '512x512', 'apps', 'slashy.png') // the AppImage's own mount is temporary
    const apps = path.join(dataHome, 'applications')
    await fs.mkdir(path.dirname(icon), { recursive: true })
    await fs.copyFile(path.join(process.resourcesPath, 'icon.png'), icon)
    await fs.mkdir(apps, { recursive: true })
    await fs.writeFile(
      path.join(apps, DESKTOP_FILE),
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Slashy',
        'Comment=Unofficial desktop wrapper for the Slashy email client',
        `Exec=${quoteExec(appImage)} %U`,
        `Icon=${icon}`,
        'Terminal=false',
        'Categories=Network;Email;',
        'MimeType=x-scheme-handler/slashyemail;x-scheme-handler/mailto;message/rfc822;',
        'StartupWMClass=slashy',
        '',
      ].join('\n'),
    )
    await promisify(execFile)('update-desktop-database', [apps]).catch(() => {})
    // slashyemail: is Slashy's own scheme (the browser sign-in comes back through it), so claim it outright.
    await xdgMime('default', DESKTOP_FILE, 'x-scheme-handler/slashyemail').catch(() => {})
  },

  async chooseMailDefault() {
    await xdgMime('default', DESKTOP_FILE, 'x-scheme-handler/mailto', 'message/rfc822')
  },

  // A plain binary has no embedded icon, so package.json copies build/icon.png into resources/.
  trayIcon: async () => path.join(process.resourcesPath, 'icon.png'),
}
