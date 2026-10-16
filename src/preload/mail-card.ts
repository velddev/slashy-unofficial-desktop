// One-time "set Slashy as default" card, drawn over the bottom of the sidebar when the main process asks
// (mail.ts maybePromptDefault). Shadow DOM keeps it out of Slashy's markup and styles; colours come from Slashy's
// own theme vars.
import { invoke, on } from './ipc.ts'
import { PAGE } from '../slashy.ts'

// Signed in = Firebase has a stored session (IndexedDB, localStorage as fallback).
function signedIn(): Promise<boolean> {
  const { db: dbName, store, keyPrefix } = PAGE.firebaseSession
  return new Promise((resolve) => {
    if (Object.keys(localStorage).some((k) => k.startsWith(keyPrefix))) return resolve(true)
    const req = indexedDB.open(dbName)
    req.onupgradeneeded = () => req.transaction?.abort() // db didn't exist: don't create it
    req.onerror = () => resolve(false)
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(store)) return db.close(), resolve(false)
      const keys = db.transaction(store).objectStore(store).getAllKeys()
      keys.onsuccess = () => (db.close(), resolve(keys.result.some((k) => String(k).startsWith(keyPrefix))))
      keys.onerror = () => (db.close(), resolve(false))
    }
  })
}

const CARD = `
  <style>
    .card { all: initial; display: block; font-family: inherit; white-space: normal;
      position: fixed; left: 6px; bottom: 6px; z-index: 2147483647; width: 228px; box-sizing: border-box;
      padding: 12px; border-radius: 10px; font-size: 13px; line-height: 1.4; color: var(--foreground, #d3d3d3);
      background: var(--sidebar-bg, #202020); border: 1px solid var(--border-default, #444); box-shadow: 0 8px 24px #0000004d; }
    b { display: block; font-size: 14px; color: var(--foreground-strong, #ebebeb); margin: 0 24px 2px 0; }
    p { margin: 0 0 10px; color: var(--foreground-muted, #a8a8a8); }
    button { font: inherit; cursor: pointer; border-radius: 8px; color: var(--foreground-strong, #ebebeb); }
    /* Filled grey from Slashy's border scale (#444 dark / #e0e0e0 light), no outline, so it doesn't echo the card's border */
    .primary { display: block; width: 100%; padding: 7px 12px; border: 0; font-weight: 500;
      background: var(--border-default, #444); }
    .primary:hover { background: var(--border-strong, #555); }
    .close { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; padding: 0; border: 0; background: transparent;
      color: var(--foreground-muted, #a8a8a8); font-size: 16px; line-height: 24px; }
    .close:hover { background: var(--bg-hover, #ffffff0f); color: var(--foreground-strong, #ebebeb); }
    button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--accent, #5b5bf6); }
  </style>
  <div class="card" role="dialog" aria-label="Set Slashy as default">
    <button class="close" aria-label="Dismiss">✕</button>
    <b>Set Slashy as default</b>
    <p>Every email link you click opens right here, ready to write.</p>
    <button class="primary">Set as default</button>
  </div>`

export function mailDefaultCard() {
  on('mailto-prompt', async () => {
    if (!(await signedIn())) return invoke('mailto:not-yet') // ask again on a later navigation
    const host = document.createElement('div')
    const root = host.attachShadow({ mode: 'closed' })
    root.innerHTML = CARD
    const answer = (enabled: boolean) => {
      host.remove()
      invoke('mailto:set', enabled)
    }
    root.querySelector<HTMLButtonElement>('.primary')!.onclick = () => answer(true)
    root.querySelector<HTMLButtonElement>('.close')!.onclick = () => answer(false)
    document.body.append(host)
  })
}
