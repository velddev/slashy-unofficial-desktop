// .eml files open in a local viewer window (eml.html): files from disk, and .eml attachments Slashy hands over from
// memory (never written to disk). Remote content is blocked there; "Reply in Slashy" hands the sender and subject to
// Slashy's composer, "Save…" stores the original if you want it.
import { dialog } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import PostalMime from 'postal-mime'
import type { Email } from 'postal-mime'
import { handle } from './ipc.ts'
import { compose } from './mail.ts'
import { PAGE } from './slashy.ts'
import { createWindow, kinds, main } from './windows.ts'

interface OpenEmail {
  email: Email
  raw: Uint8Array
  filename: string
  theme: Record<string, string>
}

const emails = new Map<number, OpenEmail>() // webContents.id -> the email its viewer shows

export const openEml = async (file: string) => openEmlBytes(await fs.readFile(file), path.basename(file))

// Slashy's current theme tokens, read from the main window, so the viewer matches dark or light (empty if unavailable).
async function slashyTheme(): Promise<Record<string, string>> {
  const read = `(() => { const cs = getComputedStyle(document.documentElement); return Object.fromEntries(${JSON.stringify(PAGE.themeVars)}.map((n) => [n, cs.getPropertyValue(n).trim()]).filter(([, v]) => v)) })()`
  return main.webContents.executeJavaScript(read).catch(() => ({}))
}

async function openEmlBytes(raw: Uint8Array, filename: string) {
  const [email, theme] = await Promise.all([PostalMime.parse(raw), slashyTheme()])
  const win = createWindow(pathToFileURL(path.join(import.meta.dirname, 'eml.html')).href, 'eml', {
    width: 880,
    height: 800,
    title: email.subject || filename,
    backgroundColor: theme['--background'] ?? '#191919',
  })
  const id = win.webContents.id
  emails.set(id, { email, raw, filename, theme })
  win.on('closed', () => emails.delete(id))
}

// From Slashy's attachment download (window.electronAPI.saveToDownloads, see preload/attachments.ts).
handle('eml:open', async (_e, filename, raw) => {
  await openEmlBytes(raw, filename)
  return true
})

// The viewer is a local file, not slashy.com: only the viewer window that owns an email may ask about it.
const ownsEmail = (e: Electron.IpcMainInvokeEvent) => emails.has(e.sender.id) && kinds.get(e.sender.id) === 'eml'
const emailOf = (e: Electron.IpcMainInvokeEvent) => emails.get(e.sender.id)!.email

handle(
  'eml:save-original',
  async (e) => {
    const { raw, filename } = emails.get(e.sender.id)!
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: filename.replace(/[\\/:*?"<>|]/g, '-') })
    if (!canceled && filePath) await fs.writeFile(filePath, raw)
  },
  ownsEmail,
)

handle(
  'eml:get',
  (e) => {
    const { email, theme } = emails.get(e.sender.id)!
    const inline: Record<string, string> = {}
    for (const a of email.attachments) {
      if (a.contentId) inline[a.contentId.replace(/^<|>$/g, '')] = `data:${a.mimeType};base64,${Buffer.from(a.content as ArrayBuffer).toString('base64')}`
    }
    return {
      from: email.from,
      to: email.to,
      cc: email.cc,
      date: email.date,
      subject: email.subject,
      text: email.text,
      html: email.html?.replace(/cid:([^"'\s)>]+)/gi, (m, id) => inline[id] ?? m),
      attachments: email.attachments.map((a) => ({ filename: a.filename, size: (a.content as ArrayBuffer).byteLength, mimeType: a.mimeType })),
      theme,
    }
  },
  ownsEmail,
)

handle(
  'eml:save',
  async (e, index) => {
    const a = emailOf(e).attachments[index]
    if (!a) return
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: a.filename ?? 'attachment' })
    if (!canceled && filePath) await fs.writeFile(filePath, Buffer.from(a.content as ArrayBuffer))
  },
  ownsEmail,
)

handle(
  'eml:reply',
  (e) => {
    const email = emailOf(e)
    const subject = email.subject ?? ''
    compose({ to: email.replyTo?.[0]?.address ?? email.from?.address, subject: /^re:/i.test(subject) ? subject : `Re: ${subject}` })
  },
  ownsEmail,
)
