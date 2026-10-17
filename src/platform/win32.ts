// Windows: mailto: and .eml registration lives in the registry, and only the user may pick the default app.
import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Platform } from './index.ts'

const MAILTO_PROGID = 'Slashy.mailto'
const EML_PROGID = 'Slashy.eml'
const reg = (...args: string[]) => promisify(execFile)('reg', args)

export const win32: Platform = {
  async isMailDefault() {
    // Windows 11 keeps the choice in UserChoiceLatest; older builds in UserChoice.
    const key = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\mailto'
    const progId = async (k: string) => (await reg('query', k, '/v', 'ProgId').catch(() => ({ stdout: '' }))).stdout.match(/ProgId\s+REG_SZ\s+(\S+)/)?.[1]
    return ((await progId(`${key}\\UserChoiceLatest\\ProgId`)) ?? (await progId(`${key}\\UserChoice`))) === MAILTO_PROGID
  },

  // Registers Slashy as a handler for mailto: links and .eml files so it shows up in Settings > Default apps and in
  // the "Open with" picker. Only makes Slashy *available*; Windows leaves picking the default to the user.
  // Windows 11's picker skips ProgIDs without an app identity, hence the Application subkey and Applications\<exe>.
  async registerMailApp() {
    const exe = process.execPath
    const command = app.isPackaged ? `"${exe}" "%1"` : `"${exe}" "${path.resolve(process.argv[1])}" "%1"`
    const classes = 'HKCU\\Software\\Classes'
    const mailto = `${classes}\\${MAILTO_PROGID}`
    const eml = `${classes}\\${EML_PROGID}`
    const exeKey = `${classes}\\Applications\\${path.basename(exe)}`
    const caps = 'HKCU\\Software\\Slashy\\Capabilities'
    for (const args of [
      [mailto, '/ve', '/d', 'URL:MailTo Protocol'],
      [mailto, '/v', 'URL Protocol', '/d', ''],
      [`${mailto}\\DefaultIcon`, '/ve', '/d', `${exe},0`],
      [`${mailto}\\shell\\open\\command`, '/ve', '/d', command],
      [eml, '/ve', '/d', 'Email message'],
      [eml, '/v', 'FriendlyTypeName', '/d', 'Email message'],
      [`${eml}\\DefaultIcon`, '/ve', '/d', `${exe},0`],
      [`${eml}\\shell\\open\\command`, '/ve', '/d', command],
      [`${eml}\\Application`, '/v', 'ApplicationName', '/d', 'Slashy'],
      [`${eml}\\Application`, '/v', 'ApplicationIcon', '/d', `${exe},0`],
      [`${classes}\\.eml\\OpenWithProgids`, '/v', EML_PROGID, '/t', 'REG_NONE', '/d', ''],
      [exeKey, '/v', 'FriendlyAppName', '/d', 'Slashy'],
      [`${exeKey}\\shell\\open\\command`, '/ve', '/d', command],
      [`${exeKey}\\SupportedTypes`, '/v', '.eml', '/d', ''],
      [caps, '/v', 'ApplicationName', '/d', 'Slashy'],
      [caps, '/v', 'ApplicationDescription', '/d', 'Slashy email client'],
      [caps, '/v', 'ApplicationIcon', '/d', `${exe},0`],
      [`${caps}\\URLAssociations`, '/v', 'mailto', '/d', MAILTO_PROGID],
      [`${caps}\\FileAssociations`, '/v', '.eml', '/d', EML_PROGID],
      ['HKCU\\Software\\RegisteredApplications', '/v', 'Slashy', '/d', 'Software\\Slashy\\Capabilities'],
    ]) {
      await reg('add', ...args, '/f')
    }
  },

  // Windows only lets the user pick the default, so: register, then open Settings > Default apps on Slashy's page.
  async chooseMailDefault() {
    await win32.registerMailApp()
    await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Slashy')
  },

  // The exe's own icon (build/ isn't shipped).
  trayIcon: () => app.getFileIcon(process.execPath, { size: 'small' }),
}
