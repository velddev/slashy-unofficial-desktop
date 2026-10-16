// Compose pop-out windows: Slashy's floating composer fills the (frameless) window; the app behind it stays mounted
// but unpainted. The draft itself is opened by pop-out.page.ts.
import { webFrame } from 'electron'
import { PAGE } from '../slashy.ts'

export function setUpComposeWindow() {
  webFrame.insertCSS(`
    ${PAGE.appRoot} { visibility: hidden !important; }
    html, body { background: var(--compose-surface, var(--background)) !important; }
    ${PAGE.composeModal} { visibility: visible !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
      max-width: none !important; max-height: none !important; border-radius: 0 !important; transform: none !important; box-shadow: none !important; }
    ${PAGE.composeEditorBox} { border-radius: 0 !important; }
  `)
  // A transparent strip over the composer's title row drags the window (double-click maximizes). It stops short of
  // the composer's own minimize/close buttons on the right.
  window.addEventListener('DOMContentLoaded', () => {
    const strip = document.createElement('div')
    strip.style.cssText = 'position:fixed;top:0;left:0;right:96px;height:44px;z-index:2147483647;-webkit-app-region:drag'
    document.body.append(strip)
  })
}
