// Desktop-only behaviour behind Settings > Desktop (drawn by preload/desktop-tab.ts): app updates, keeping the web
// bundle current, the startup timer, open at sign-in.
import { app, powerMonitor } from 'electron'
import electronUpdater from 'electron-updater'
import path from 'node:path'
import type { Bundle } from './bundle.ts'
import type { DesktopAction, UpdateState } from './contracts.ts'
import { handle } from './ipc.ts'
import { platform } from './platform/index.ts'
import { settings, saveSettings } from './settings.ts'
import { isComposing, kinds, reloadAll, resetZoom } from './windows.ts'

const { autoUpdater } = electronUpdater

const APP_UPDATE_EVERY_MS = 4 * 60 * 60 * 1000
const BUNDLE_CHECK_AFTER_LAUNCH_MS = 30000 // downloads in the background; used from the next start
const IDLE_CHECK_EVERY_MS = 5 * 60 * 1000
const IDLE_AFTER_S = 300 // "the PC is idle": no input for 5 minutes

export const processStart = Date.now() - process.uptime() * 1000

// Windows matches login items by exact path + args, so set and read with the same ones (dev runs electron.exe <dir>).
const loginItem = { path: process.execPath, args: [...(app.isPackaged ? [] : [path.resolve(process.argv[1])]), '--hidden'] }

let bundle!: Bundle // set by startUpdates() before the page can ask
let updateState: UpdateState = { status: app.isPackaged ? 'idle' : 'dev' }
let windowShownMs: number | null = null
let startupRecorded = false

export const noteWindowShown = () => (windowShownMs = Date.now() - processStart)

// Starts the background updaters: the app (packaged builds) and the web bundle (at launch, then whenever idle).
export function startUpdates(webBundle: Bundle) {
  bundle = webBundle
  setTimeout(() => bundle.check(), BUNDLE_CHECK_AFTER_LAUNCH_MS)
  setInterval(idleBundleUpdate, IDLE_CHECK_EVERY_MS)
  if (app.isPackaged) {
    // Downloads in the background, shows a toast when ready, installs on next quit.
    const check = () => autoUpdater.checkForUpdatesAndNotify().catch(() => {}) // offline is fine
    check()
    setInterval(check, APP_UPDATE_EVERY_MS)
  }
}

// While the PC is idle: fetch a newer web bundle and switch to it, unless a pop-out composer is open.
async function idleBundleUpdate() {
  if (powerMonitor.getSystemIdleTime() < IDLE_AFTER_S) return
  await bundle.check()
  if (bundle.hasUpdate() && !isComposing() && powerMonitor.getSystemIdleTime() >= IDLE_AFTER_S && (await bundle.apply())) reloadAll()
}

const updateEvents = [
  ['checking-for-update', 'checking'],
  ['update-available', 'downloading'],
  ['update-not-available', 'up-to-date'],
  ['update-downloaded', 'ready'],
  ['error', 'error'],
] as const
for (const [event, status] of updateEvents) {
  autoUpdater.on(event, (info: { version?: string; message?: string } | undefined) => {
    updateState = { status, version: info?.version ?? updateState.version, error: status === 'error' ? String(info?.message ?? info) : null }
  })
}
autoUpdater.on('download-progress', (p) => (updateState = { ...updateState, status: 'downloading', percent: Math.round(p.percent) }))

// The main window reports when the inbox list has rendered: process start -> usable inbox.
handle('startup:ready', (e) => {
  if (startupRecorded || kinds.get(e.sender.id) !== 'main') return
  startupRecorded = true
  saveSettings({ lastStartup: { ms: Date.now() - processStart, shownMs: windowShownMs, at: Date.now(), fromDisk: !!bundle.info().current?.files } })
})

handle('desktop:info', async () => ({
  version: app.getVersion(),
  update: updateState,
  bundle: bundle.info(),
  startup: settings.lastStartup ?? null,
  openAtLogin: app.getLoginItemSettings(loginItem).openAtLogin,
  keepRunning: settings.keepRunning !== false,
  mailDefault: await platform.isMailDefault(),
  zoom: Math.round(100 * 1.2 ** (settings.zoom ?? 0)),
}))

// Checks run in the background (the tab polls for progress); the rest finish before the tab re-renders.
const actions: Record<DesktopAction, (value: boolean) => unknown> = {
  'check-app-update': () => void (app.isPackaged && autoUpdater.checkForUpdates().catch(() => {})),
  'install-app-update': () => autoUpdater.quitAndInstall(),
  'check-bundle': () => void bundle.check(),
  'apply-bundle': async () => (await bundle.apply()) && reloadAll(),
  'open-at-login': (value) => app.setLoginItemSettings({ ...loginItem, openAtLogin: value }),
  'keep-running': (value) => saveSettings({ keepRunning: value }),
  'set-mail-default': () => platform.chooseMailDefault(),
  'reset-zoom': () => resetZoom(),
}

handle('desktop:action', async (_e, action, value) => {
  await actions[action](value)
})
