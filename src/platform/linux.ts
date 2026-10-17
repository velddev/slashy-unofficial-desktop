// Linux: apps, their URL schemes and file types are found through the installed slashy.desktop (its MimeType line is
// the registration), and xdg-mime reads and sets the defaults. See DEVELOPMENT.md > Linux.
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Platform } from './index.ts'

const DESKTOP_FILE = 'slashy.desktop' // matches package.json desktopName
const xdgMime = (...args: string[]) => promisify(execFile)('xdg-mime', args)

export const linux: Platform = {
  async isMailDefault() {
    return (await xdgMime('query', 'default', 'x-scheme-handler/mailto').catch(() => ({ stdout: '' }))).stdout.trim() === DESKTOP_FILE
  },

  async registerMailApp() {}, // the .desktop file already is the registration

  async chooseMailDefault() {
    await xdgMime('default', DESKTOP_FILE, 'x-scheme-handler/mailto', 'message/rfc822')
  },

  // A plain binary has no embedded icon, so package.json copies build/icon.png into resources/.
  trayIcon: async () => path.join(process.resourcesPath, 'icon.png'),
}
