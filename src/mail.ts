// Slashy as a mail app: mailto: links into Slashy's composer, and the one-time "set Slashy as default" card (drawn by
// preload/mail-card.ts). Registering for mailto: and .eml is per OS, in platform/.
import { handle, send } from './ipc.ts'
import { parseMailto } from './links.ts'
import { platform } from './platform/index.ts'
import { settings, saveSettings } from './settings.ts'
import { PRE_APP_ROUTES } from './slashy.ts'
import type { MailtoDraft } from './slashy.ts'
import { focus, main } from './windows.ts'

let pendingMailto: MailtoDraft | null = null // picked up by the web app via getPendingMailto once its inboxes load
let promptSent = false

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
  if (!(await platform.isMailDefault())) send(main.webContents, 'mailto-prompt')
}

handle('mailto:get', async () => ({ isDefault: await platform.isMailDefault(), userOptedOut: !!settings.mailtoOptOut }))

handle('mailto:set', async (_e, enabled) => {
  saveSettings({ mailtoOptOut: !enabled, mailtoPromptSeen: true })
  if (enabled) await platform.chooseMailDefault()
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
