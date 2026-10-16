// Slashy's tab row is the window's title bar (windows.ts hides the native one and draws Windows' minimize/maximize/
// close over the row's right end). Here: colour those buttons from Slashy's theme, keep the tabs clear of them, use
// the sidebar's macOS window-button space for our logo (the app icon), and give pages without Slashy's drag regions
// (sign-in) a strip to move the window by.
import { webFrame } from 'electron'
import { PAGE } from '../slashy.ts'
import { invoke } from './ipc.ts'
import logoUrl from './logo.svg'

const CHECK_EVERY_MS = 1000 // theme switches and Slashy re-rendering the sidebar are picked up this fast
const FALLBACK_DRAG_HEIGHT = 32
// Width of the window buttons, from the Window Controls Overlay env vars Chromium sets for the overlay.
const BUTTONS_WIDTH = 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))'

export function setUpTitleBar() {
  webFrame.insertCSS(`
    ${PAGE.tabStrip} { padding-right: ${BUTTONS_WIDTH} !important; }
    /* The 24px logo is centred over the account's 20px avatar below it (avatar at x=18). */
    ${PAGE.sidebarTopRow} { padding-left: 16px !important; }
    .slashy-desktop-logo { width: 24px; height: 24px; display: block; pointer-events: none; user-select: none; }
    .slashy-desktop-drag { position: fixed; top: 0; left: 0; right: ${BUTTONS_WIDTH}; height: ${FALLBACK_DRAG_HEIGHT}px;
      z-index: 2147483647; -webkit-app-region: drag; }
  `)

  let reported = ''
  const reportTheme = () => {
    const css = getComputedStyle(document.documentElement)
    const colors = { color: css.getPropertyValue('--sidebar-bg').trim(), symbolColor: css.getPropertyValue('--foreground-secondary').trim() }
    if (!colors.color || !colors.symbolColor || reported === colors.color + colors.symbolColor) return
    reported = colors.color + colors.symbolColor
    invoke('window:title-bar', colors)
  }

  window.addEventListener('DOMContentLoaded', () => {
    const strip = document.createElement('div')
    strip.className = 'slashy-desktop-drag'
    document.body.append(strip)

    const check = () => {
      reportTheme()
      strip.hidden = !!document.querySelector(PAGE.dragRegion)
      const row = document.querySelector(PAGE.sidebarTopRow)
      if (row && !row.querySelector('.slashy-desktop-logo')) {
        const logo = document.createElement('img')
        logo.src = logoUrl
        logo.alt = 'Slashy'
        logo.className = 'slashy-desktop-logo'
        row.prepend(logo)
      }
    }
    check()
    setInterval(check, CHECK_EVERY_MS)
  })
}
