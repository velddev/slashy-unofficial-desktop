// Every window the app opens: the main window, Slashy links popped out, compose pop-outs (and their warm spare),
// plus the bits all of them share (zoom keys, context menu).
import { BrowserWindow, Menu, clipboard, ipcMain, nativeTheme, screen, shell } from 'electron'
import type { BrowserWindowConstructorOptions, ContextMenuParams, Input, WebContents } from 'electron'
import path from 'node:path'
import { WINDOW_KIND } from './contracts.ts'
import type { ComposeTarget, WindowKind } from './contracts.ts'
import { handle } from './ipc.ts'
import { settings, saveSettings } from './settings.ts'
import { ORIGIN, isSlashyUrl } from './slashy.ts'

// A spare compose window boots after launch (and after each pop-out / bundle switch), once the main window has had
// its turn; a popped-out composer is shown at the latest after the fallback, even if its editor never reports in.
const SPARE_AFTER_LAUNCH_MS = 10000
const SPARE_AFTER_POPOUT_MS = 3000
const COMPOSE_SHOW_FALLBACK_MS = 15000

// Slashy's tab row is the title bar: Windows' own minimize/maximize/close are drawn over its right end, and Slashy's
// drag-region markup moves the window (see preload/title-bar.ts). The buttons fill the row's full height.
const TAB_ROW_HEIGHT = 40
const tabRowTitleBar: BrowserWindowConstructorOptions = {
  titleBarStyle: 'hidden',
  titleBarOverlay: { color: '#202020', symbolColor: '#a8a8a8', height: TAB_ROW_HEIGHT }, // Slashy's dark theme until the page reports its own
}

export const kinds = new Map<number, WindowKind>() // webContents.id -> kind
export let main!: BrowserWindow // set by createMainWindow() before anything uses it

// The tab row is in CSS pixels, so it grows with page zoom; the buttons are drawn by Windows and don't. Size them to
// match after every zoom change (zoom is per site, so one change zooms every Slashy window), stopping 1px short so the
// row's bottom border shows under them too.
function fitTitleBar(win: BrowserWindow) {
  const kind = kinds.get(win.webContents.id)
  if (kind === 'main' || kind === 'secondary') win.setTitleBarOverlay({ height: Math.round(TAB_ROW_HEIGHT * win.webContents.getZoomFactor()) - 1 })
}
const fitAllTitleBars = () => BrowserWindow.getAllWindows().forEach(fitTitleBar)

export function focus(win: BrowserWindow) {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function createWindow(url: string, kind: WindowKind, options: BrowserWindowConstructorOptions = {}) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    ...options,
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.cjs'), spellcheck: true },
  })
  const id = win.webContents.id
  kinds.set(id, kind)
  win.on('closed', () => kinds.delete(id))
  win.webContents.setWindowOpenHandler(({ url }) => {
    openUrl(url)
    return { action: 'deny' }
  })
  win.webContents.on('context-menu', (_e, params) => contextMenu(win, params))
  win.webContents.on('before-input-event', (e, input) => zoomKeys(win.webContents, e, input))
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomLevel(settings.zoom ?? 0)
    fitTitleBar(win)
  })
  win.loadURL(url)
  return win
}

ipcMain.on(WINDOW_KIND, (e) => {
  e.returnValue = kinds.get(e.sender.id) ?? 'secondary'
})

// Slashy links pop out into their own app window; everything else goes to the browser.
export function openUrl(url: string) {
  if (isSlashyUrl(url)) createWindow(url, 'secondary', tabRowTitleBar)
  else if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
}

// Electron's built-in zoom-in needs Ctrl+Shift+=; make plain Ctrl+= / Ctrl++ work and remember the level.
function zoomKeys(wc: WebContents, e: Electron.Event, input: Input) {
  if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return
  const level = wc.getZoomLevel()
  const next = ({ '=': level + 0.5, '+': level + 0.5, '-': level - 0.5, _: level - 0.5, 0: 0 } as Record<string, number>)[input.key]
  if (next === undefined) return
  e.preventDefault()
  wc.setZoomLevel(Math.max(-3, Math.min(5, next)))
  saveSettings({ zoom: wc.getZoomLevel() })
  fitAllTitleBars()
}

export function resetZoom() {
  saveSettings({ zoom: 0 })
  for (const w of BrowserWindow.getAllWindows()) w.webContents.setZoomLevel(0)
  fitAllTitleBars()
}

function contextMenu(win: BrowserWindow, p: ContextMenuParams) {
  const items: Electron.MenuItemConstructorOptions[] = []
  if (p.linkURL) {
    items.push(
      { label: isSlashyUrl(p.linkURL) ? 'Open in new window' : 'Open in browser', click: () => openUrl(p.linkURL) },
      { label: 'Copy link', click: () => clipboard.writeText(p.linkURL) },
    )
  }
  for (const word of p.dictionarySuggestions ?? []) {
    items.push({ label: word, click: () => win.webContents.replaceMisspelling(word) })
  }
  if (p.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' })
  else if (p.selectionText) items.push({ role: 'copy' })
  if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
}

// --- Main window ---

// Opens where it was last left (if that spot is still on a connected screen), without taking focus.
export function createMainWindow({ hidden }: { hidden: boolean }) {
  const background = nativeTheme.shouldUseDarkColors ? '#191919' : '#ffffff'
  main = createWindow(ORIGIN, 'main', { ...tabRowTitleBar, show: false, backgroundColor: background, ...savedBounds() })
  trackBounds(main)
  // Launching again, the tray or a notification still bring it forward (focus()).
  if (!hidden) main.once('ready-to-show', () => (settings.mainMaximized ? main.maximize() : main.showInactive()))
  return main
}

function savedBounds(): BrowserWindowConstructorOptions {
  const b = settings.mainBounds
  if (!b) return {}
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y)
  return onScreen ? b : { width: b.width, height: b.height }
}

function trackBounds(win: BrowserWindow) {
  let timer: NodeJS.Timeout | undefined
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => !win.isDestroyed() && saveSettings({ mainBounds: win.getNormalBounds(), mainMaximized: win.isMaximized() }), 500)
  }
  win.on('move', save)
  win.on('resize', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
}

// Slashy's tab tear-off (window.electronAPI.openRouteInNewWindow), and links it opens in the browser.
handle('popout', (_e, { route, screenX, screenY }) => {
  const url = new URL(route ?? '/', ORIGIN)
  if (url.origin !== ORIGIN) return { opened: false }
  const at = Number.isFinite(screenX) && Number.isFinite(screenY) ? { x: Math.round(screenX!) - 120, y: Math.round(screenY!) - 20 } : {}
  createWindow(url.href, 'secondary', { ...tabRowTitleBar, ...at })
  return { opened: true }
})

handle('open-external', (_e, url) => {
  if (!/^(https?|mailto):/i.test(url)) return false
  shell.openExternal(url)
  return true
})

// --- Compose pop-out windows ---

// A small window showing only Slashy's floating composer for one draft (see preload/pop-out.page.ts).
// Slashy has no compose-only page, so the window has to boot the whole app (~8s). One is kept booted and hidden as a
// spare; Pop Out hands it the draft and it shows as soon as the composer renders, then the next spare boots.
// ponytail: one spare costs a hidden app instance's memory; drop to on-demand if that matters.
const composeTargets = new Map<number, ComposeTarget>() // webContents.id -> the draft it shows
let spareCompose: BrowserWindow | null = null

function createComposeWindow() {
  // Frameless: Slashy's composer header is the window chrome (drag strip + its own minimize/close, see preload).
  const win = createWindow(`${ORIGIN}/`, 'compose', { width: 600, height: 680, minWidth: 420, minHeight: 360, frame: false, show: false })
  const id = win.webContents.id
  win.on('closed', () => {
    composeTargets.delete(id)
    if (spareCompose === win) spareCompose = null
  })
  return win
}

export function scheduleSpareCompose(delay = SPARE_AFTER_LAUNCH_MS) {
  setTimeout(() => (spareCompose ??= createComposeWindow()), delay)
}

export const isComposing = () => BrowserWindow.getAllWindows().some((w) => kinds.get(w.webContents.id) === 'compose' && w.isVisible())

handle('compose:popout', (_e, target) => {
  const win = spareCompose ?? createComposeWindow()
  spareCompose = null
  composeTargets.set(win.webContents.id, target as ComposeTarget)
  setTimeout(() => !win.isDestroyed() && win.show(), COMPOSE_SHOW_FALLBACK_MS)
  scheduleSpareCompose(SPARE_AFTER_POPOUT_MS)
  return true
})

handle('compose:ready', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.show()
})

handle('compose:target', (e) => composeTargets.get(e.sender.id) ?? null)

handle('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize()
})

// The page reports its theme colours so the window buttons match the tab row (only windows that have the overlay).
handle('window:title-bar', (e, colors) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const kind = kinds.get(e.sender.id)
  if (win && (kind === 'main' || kind === 'secondary')) win.setTitleBarOverlay(colors)
})

// Reload every Slashy window onto the web bundle now in use (the spare compose window is recreated instead).
export function reloadAll() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w === spareCompose) w.destroy()
    else if (kinds.get(w.webContents.id) === 'main' || kinds.get(w.webContents.id) === 'secondary') w.webContents.reload()
  }
  scheduleSpareCompose()
}
