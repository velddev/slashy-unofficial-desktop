// Slashy as a Windows mail app: registering for mailto: and .eml, mailto: links into Slashy's composer, and the
// one-time "set Slashy as default" card (drawn by preload/mail-card.ts).
import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { handle, send } from './ipc.ts'
import { parseMailto } from './links.ts'
import { settings, saveSettings } from './settings.ts'
import { PRE_APP_ROUTES } from './slashy.ts'
import type { MailtoDraft } from './slashy.ts'
import { focus, main } from './windows.ts'

const MAILTO_PROGID = 'Slashy.mailto'
const EML_PROGID = 'Slashy.eml'
const reg = (...args: string[]) => promisify(execFile)('reg', args)

let pendingMailto: MailtoDraft | null = null // picked up by the web app via getPendingMailto once its inboxes load
let promptSent = false

export async function isMailDefault() {
  // Windows 11 keeps the choice in UserChoiceLatest; older builds in UserChoice.
  const key = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\mailto'
  const progId = async (k: string) => (await reg('query', k, '/v', 'ProgId').catch(() => ({ stdout: '' }))).stdout.match(/ProgId\s+REG_SZ\s+(\S+)/)?.[1]
  return ((await progId(`${key}\\UserChoiceLatest\\ProgId`)) ?? (await progId(`${key}\\UserChoice`))) === MAILTO_PROGID
}

// Registers Slashy as a handler for mailto: links and .eml files so it shows up in Settings > Default apps and in
// the "Open with" picker. Only makes Slashy *available*; Windows leaves picking the default to the user. Idempotent.
// Windows 11's picker skips ProgIDs without an app identity, hence the Application subkey and Applications\<exe>.
export async function registerApp() {
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
}

// Windows only lets the user pick the default, so: register, then open Settings > Default apps on Slashy's page.
export async function chooseAsDefault() {
  await registerApp()
  await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Slashy')
}

// Opens a draft in Slashy's composer (window.electronAPI.onMailtoCompose), from a mailto: link or the .eml viewer.
export function compose(draft: MailtoDraft) {
  pendingMailto = draft
  send(main.webContents, 'compose', draft)
  focus(main)
}

export const openMailto = (link: string) => compose(parseMailto(link))

// The card shows once, in the signed-in app, if Slashy isn't the default yet. The preload re-asks via mailto:not-yet
// when the page turns out to be signed out.
export async function maybePromptDefault() {
  const { pathname } = new URL(main.webContents.getURL())
  if (promptSent || settings.mailtoPromptSeen || PRE_APP_ROUTES.test(pathname)) return
  promptSent = true
  if (!(await isMailDefault())) send(main.webContents, 'mailto-prompt')
}

handle('mailto:get', async () => ({ isDefault: await isMailDefault(), userOptedOut: !!settings.mailtoOptOut }))

handle('mailto:set', async (_e, enabled) => {
  saveSettings({ mailtoOptOut: !enabled, mailtoPromptSeen: true })
  if (enabled) await chooseAsDefault()
  return { success: true }
})

handle('mailto:not-yet', () => {
  promptSent = false
})

handle('mailto:pending', () => {
  const draft = pendingMailto
  pendingMailto = null
  return draft
})
