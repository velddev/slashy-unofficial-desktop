// Slashy for Windows: a desktop shell around slashy.com. This file is the app's lifecycle; each feature lives in
// its own module (windows, mail, eml, desktop, bundle), Slashy-specific details are in slashy.ts and every message
// between the app and its pages is in contracts.ts.
import { settings } from './settings.ts' // first: pins the profile folder before anything reads it
import { Menu, Notification, Tray, app, dialog, session } from 'electron'
import path from 'node:path'
import { createBundle } from './bundle.ts'
import { noteWindowShown, startUpdates } from './desktop.ts'
import { openEml } from './eml.ts'
import { handle, send } from './ipc.ts'
import { deepLinkTarget, isDeepLink, isMailto } from './links.ts'
import { maybePromptDefault, openMailto } from './mail.ts'
import { platform } from './platform/index.ts'
import { DEEP_LINK_PROTOCOL, STARTUP_HOSTS } from './slashy.ts'
import { createMainWindow, focus, kinds, main, scheduleSpareCompose } from './windows.ts'

const PROMPT_AFTER_LOAD_MS = 4000 // let signed-out users get bounced to /login first

if (!app.requestSingleInstanceLock()) app.exit()

app.setAppUserModelId(app.isPackaged ? 'com.slashy.windows' : process.execPath)
if (app.isPackaged) app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL)
else app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [path.resolve(process.argv[1])])

let quitting = false
let tray: Tray | null = null // held so the icon isn't garbage-collected

// mailto: links, slashyemail:// deep links and .eml files, from this launch or a second one.
function handleArgs(argv: string[]) {
  for (const arg of argv) {
    try {
      if (isDeepLink(arg)) {
        const url = deepLinkTarget(arg)
        if (url) main.loadURL(url)
        focus(main)
      } else if (isMailto(arg)) openMailto(arg)
      else if (arg.toLowerCase().endsWith('.eml')) openEml(arg).catch((err) => dialog.showErrorBox('Could not open email', String(err)))
    } catch {} // malformed link: ignore
  }
}

// --- Notifications (window.electronAPI.showNotification) ---

const notifications = new Map<string | symbol, Notification>() // tag -> Notification; holding the ref keeps click handlers alive

handle('notify', (e, { title, body, tag, silent, navigation }) => {
  // Every window runs the full app; only the main one notifies, or pop-outs would double every toast.
  if (!Notification.isSupported() || kinds.get(e.sender.id) !== 'main') return false
  const key = tag ?? Symbol()
  notifications.get(key)?.close()
  const n = new Notification({ title, body: body ?? undefined, silent: silent ?? undefined })
  n.on('click', () => {
    notifications.delete(key)
    focus(main)
    if (navigation) send(main.webContents, 'notify:navigate', navigation)
  })
  notifications.set(key, n)
  n.show()
  return true
})

handle('notify:clear', (_e, tag) => {
  notifications.get(tag)?.close()
  notifications.delete(tag)
})

// --- Tray ---

async function createTray() {
  // Packaged: wherever the OS keeps the app's icon (build/ isn't shipped). Dev: the source icon.
  tray = new Tray(app.isPackaged ? await platform.trayIcon() : path.join(import.meta.dirname, '..', 'build', 'icon.png'))
  tray.setToolTip('Slashy')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Slashy', click: () => focus(main) },
      { label: 'Desktop settings', click: () => (focus(main), send(main.webContents, 'open-settings', 'desktop')) },
      { type: 'separator' },
      { label: 'Quit Slashy', click: () => app.quit() },
    ]),
  )
  tray.on('click', () => focus(main))
}

// --- Lifecycle ---

app.on('second-instance', (_e, argv) => {
  focus(main)
  handleArgs(argv)
})

app.on('before-quit', () => (quitting = true))

app.whenReady().then(async () => {
  // Open the connections Slashy blocks on while the page is still loading.
  for (const url of STARTUP_HOSTS) session.defaultSession.preconnect({ url, numSockets: 2 })

  const bundle = createBundle(session.defaultSession, path.join(app.getPath('userData'), 'bundle'))
  await bundle.init()
  if (process.argv.includes('--simulate-offline')) {
    // QA: every request fails as if unplugged, so the app must come up from the bundle on disk. (Slashy's OFFLINE
    // footer follows navigator.onLine, which only a real disconnect flips.)
    bundle.setSimulateOffline(true)
  }

  createMainWindow({ hidden: process.argv.includes('--hidden') })
  main.once('show', noteWindowShown)
  // Closing hides to the tray so reopening is instant and notifications keep coming; Quit is in the tray menu.
  main.on('close', (e) => {
    if (quitting || settings.keepRunning === false) return
    e.preventDefault()
    main.hide()
  })
  main.on('closed', () => app.quit())
  main.webContents.on('did-navigate-in-page', maybePromptDefault)
  main.webContents.on('did-finish-load', () => setTimeout(maybePromptDefault, PROMPT_AFTER_LOAD_MS))

  createTray().catch(() => {})
  handleArgs(process.argv)
  scheduleSpareCompose()
  startUpdates(bundle)
  if (app.isPackaged) platform.registerMailApp().catch(() => {}) // keeps the exe path fresh across updates
})
