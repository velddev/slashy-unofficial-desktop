// Preload for every window, bundled into out/preload.cjs (sandboxed preloads can't require local files). It gives each
// kind of window its bridge and adds this app's features to Slashy's pages.
import { contextBridge, ipcRenderer, webFrame } from 'electron'
// Type-only: importing contracts.ts as a value would pull zod and every schema into each page.
import type { WINDOW_KIND, WindowKind } from '../contracts.ts'
import { PAGE } from '../slashy.ts'
import type { SlashyBridge } from '../slashy.ts'
import { openEmlCardsOnClick, saveToDownloads } from './attachments.ts'
import { setUpComposeWindow } from './compose-window.ts'
import { desktopTab } from './desktop-tab.ts'
import { invoke, on } from './ipc.ts'
import { mailDefaultCard } from './mail-card.ts'
import { hookPopOut } from './pop-out.page.ts'
import { setUpTitleBar } from './title-bar.ts'
import type { DesktopBridge } from './pop-out.page.ts'

const kind: WindowKind = ipcRenderer.sendSync('window-kind' satisfies typeof WINDOW_KIND)

if (kind === 'eml') {
  // The local .eml viewer (eml.html).
  contextBridge.exposeInMainWorld('eml', {
    get: () => invoke('eml:get'),
    save: (index: number) => invoke('eml:save', index),
    saveOriginal: () => invoke('eml:save-original'),
    reply: () => invoke('eml:reply'),
  })
} else {
  // What slashy.com calls when it runs inside its desktop shell (see SlashyBridge in slashy.ts).
  const bridge = {
    isSecondaryWindow: kind !== 'main',
    showNotification: (options) => invoke('notify', options),
    clearNotificationByTag: (tag) => invoke('notify:clear', tag),
    clearNotificationCount: async () => {},
    onNotificationNavigate: (cb) => on('notify:navigate', cb),
    openRouteInNewWindow: (options) => invoke('popout', options),
    openExternal: (url) => invoke('open-external', url),
    onMailtoCompose: (cb) => on('compose', cb),
    getPendingMailto: () => invoke('mailto:pending'),
    getMailtoDefault: () => invoke('mailto:get'),
    setMailtoDefault: (enabled) => invoke('mailto:set', enabled),
    onOpenSettings: (cb) => on('open-settings', cb), // tray "Desktop settings" (Slashy opens its settings modal)
    saveToDownloads, // .eml attachments open in the viewer (preload/attachments.ts)
  } satisfies SlashyBridge
  contextBridge.exposeInMainWorld('electronAPI', bridge)

  // This app's own bridge, used by the pop-out hook running inside the page.
  const desktop = {
    popOutCompose: (target) => invoke('compose:popout', target),
    composeTarget: () => invoke('compose:target'),
    minimize: () => invoke('window:minimize'),
    composeReady: () => invoke('compose:ready'),
  } satisfies DesktopBridge
  contextBridge.exposeInMainWorld('slashyDesktop', desktop)
  // Serialized into the page's main world, so it only gets plain data (see pop-out.page.ts).
  webFrame.executeJavaScript(`(${hookPopOut})(${JSON.stringify({ isComposeWindow: kind === 'compose', page: PAGE })})`)

  if (kind === 'main') {
    // Startup timer: process start -> the inbox list has rows. Shown in Settings > Desktop.
    const poll = setInterval(() => {
      if (!document.querySelector(PAGE.inboxRow)) return
      clearInterval(poll)
      invoke('startup:ready')
    }, 50)
    setTimeout(() => clearInterval(poll), 60000)
  }
  if (kind === 'main' || kind === 'secondary') {
    desktopTab()
    openEmlCardsOnClick()
    setUpTitleBar()
  }
  if (kind === 'compose') setUpComposeWindow()
  mailDefaultCard()
}
