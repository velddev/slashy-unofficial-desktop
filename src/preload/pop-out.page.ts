// Runs inside the page's main world (React's DOM expandos aren't visible from the preload's isolated world): the
// preload stringifies hookPopOut and runs it there. So it must stay self-contained: no imports at runtime (types are
// fine, they're erased), no outside references, only its argument and window.slashyDesktop.
//
// Slashy's "Pop Out" (button / Ctrl+Shift+P) hands the draft to its compose store's
// openComposeWindow(thread, { fullscreenDraftData }), which floats it inside the page. In the main window that one
// case becomes a small native window instead. In that window (isComposeWindow), the same call opens the thread + live
// draft in Slashy's floating composer (compose-window.ts makes it fill the window), and the window closes when the
// composer does (sent, discarded or popped back in).
// The store isn't exported, so it's found through React's fiber tree: zustand keeps the store API in hook deps. If
// Slashy renames the action, this never attaches and their in-page pop-out still works.
import type { ComposeTarget } from '../contracts.ts'
import type { ComposeStoreState, PageContract, SlashyThread, ZustandStore } from '../slashy.ts'

// window.slashyDesktop, exposed by the preload for this hook.
export interface DesktopBridge {
  popOutCompose(target: ComposeTarget): Promise<boolean>
  composeTarget(): Promise<ComposeTarget | null>
  minimize(): Promise<void>
  composeReady(): Promise<void>
}

type Store = ZustandStore<ComposeStoreState>
type OpenComposeWindow = ComposeStoreState['openComposeWindow'] & { slashyDesktop?: true }

export function hookPopOut({ isComposeWindow, page }: { isComposeWindow: boolean; page: PageContract }) {
  const { open, minimize, windows, order } = page.composeStore
  const desktop = (window as unknown as { slashyDesktop: DesktopBridge }).slashyDesktop
  let store: Store | null = null
  let composeState: 'waiting' | 'loading' | 'open' | 'shown' = 'waiting' // compose windows only

  if (isComposeWindow) {
    // localStorage is shared with the main window; don't let this window's throwaway tab list overwrite the real one.
    // ponytail: only the tabs key is blocked; add keys here if other per-window state starts leaking.
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && key === page.tabsStorageKey) return
      return setItem.call(this, key, value)
    }
  }

  // React internals are untyped by nature: walk fibers looking for a store whose state has the compose action.
  const findStore = (): Store | null => {
    const root = document.querySelector(page.appRoot) || document.body?.firstElementChild
    const key = root && Object.keys(root).find((k) => k.startsWith('__reactContainer$'))
    const stack: any[] = key ? [(root as any)[key]] : []
    while (stack.length) {
      const f = stack.pop()
      for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
        for (const v of Array.isArray(h.memoizedState) ? h.memoizedState.flat() : [h.memoizedState]) {
          if (typeof v?.getState === 'function' && typeof v.setState === 'function' && typeof v.getState()?.[open] === 'function') return v
        }
      }
      if (f.child) stack.push(f.child)
      if (f.sibling) stack.push(f.sibling)
    }
    return null
  }

  // A compose pop-out window: open the draft it was given, report when the editor shows, follow the composer.
  const runComposeWindow = (store: Store) => {
    if (composeState === 'waiting') {
      composeState = 'loading'
      desktop.composeTarget().then((target) => {
        if (!target) return (composeState = 'waiting') // a warm spare: wait until Pop Out assigns a draft
        store.getState()[open](target.thread, { preferExistingThread: true, fullscreenDraftData: target.draft ?? undefined })
        composeState = 'open'
      })
      return
    }
    if (composeState === 'loading') return
    const s = store.getState()
    if (!s[order].length) return window.close()
    if (composeState === 'open' && document.querySelector(page.composeEditor)) {
      composeState = 'shown'
      desktop.composeReady()
    }
    // The composer's "—" minimizes it inside the page; in a frameless window it should minimize the window.
    for (const id of s[order]) {
      if (s[windows][id]?.isMinimized) {
        s[minimize](id, false)
        desktop.minimize()
      }
    }
  }

  // The main window: route Pop Out to a native window.
  const patchPopOut = (store: Store) => {
    const original = store.getState()[open] as OpenComposeWindow
    if (original.slashyDesktop) return
    const openComposeWindow: OpenComposeWindow = (thread: SlashyThread, options) => {
      if (!options?.fullscreenDraftData || !thread?.thread_id) return original(thread, options)
      // Plain JSON over IPC; File objects in `attachments` don't survive, uploaded_attachments_metadata carries them.
      const { attachments, ...draft } = options.fullscreenDraftData
      desktop.popOutCompose(JSON.parse(JSON.stringify({ thread, draft })))
      return thread.thread_id
    }
    openComposeWindow.slashyDesktop = true
    store.setState({ [open]: openComposeWindow })
  }

  setInterval(() => {
    store ??= findStore()
    if (!store?.getState()) return
    if (isComposeWindow) runComposeWindow(store)
    else patchPopOut(store)
  }, 500)
}
