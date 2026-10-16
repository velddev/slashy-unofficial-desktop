// Everything this app depends on from slashy.com, in one place. Slashy can change any of it with a deploy, so when
// something stops working after one, start here. Only things that survive Slashy's minifier are used: URLs, routes,
// DOM attributes, store action names and storage keys, never minified identifiers. The types below describe only the
// parts of Slashy's data we touch; everything else passes through untouched.

export const APP_HOST = 'www.slashy.com'
export const ORIGIN = `https://${APP_HOST}`

export function isSlashyUrl(url: string | undefined): boolean {
  try {
    const { protocol, hostname } = new URL(url ?? '')
    return protocol === 'https:' && (hostname === 'slashy.com' || hostname === APP_HOST)
  } catch {
    return false
  }
}

// Desktop sign-in: slashy.com/desktop-redirect sends the browser to slashyemail://auth-callback?<token params>;
// slashyemail://open?path=<route> opens a route.
export const DEEP_LINK_PROTOCOL = 'slashyemail'

// Routes where you aren't in the app yet (signed out, onboarding): no prompts there.
export const PRE_APP_ROUTES = /^\/(login|onboarding|initial-sync|desktop-redirect)/

// --- The web app on disk (bundle.ts) ---

// Hosts whose files make up the web app: the app itself and the Google Fonts it uses.
export const BUNDLE_HOSTS = [APP_HOST, 'fonts.googleapis.com', 'fonts.gstatic.com']
// The app page's security headers, kept with the cached copy.
export const PAGE_HEADERS = ['content-security-policy', 'referrer-policy', 'x-frame-options']
// Deploy id on every asset URL in index.html (?dpl=dpl_...): a different id means a new deploy.
export const DEPLOY_ID = /dpl=(dpl_[A-Za-z0-9]+)/
// Connections Slashy blocks on before it shows the inbox (Firebase session check, its API): opened at launch.
export const STARTUP_HOSTS = ['https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://slashy.ctrlcenter.ai']

// --- Page internals (used by the preload, and by the pop-out hook inside the page) ---

export const PAGE = {
  appRoot: '#root',
  // A row of the mail list: the inbox has rendered.
  inboxRow: '[data-virtual-index]',
  // Slashy's floating composer, portalled under <body>, and its editor.
  composeModal: '[data-compose-modal]',
  composeEditor: '[data-compose-modal] .ProseMirror',
  composeEditorBox: '[data-compose-modal] .email-editor',
  // A received attachment's card: div[draggable] with the file name in a [title] and its Download button.
  attachmentCard: '[draggable="true"]',
  attachmentName: '[title]',
  attachmentDownload: 'button[title="Download"]',
  // Slashy's theme tokens (CSS custom properties on <html>), copied into our own pages (the .eml viewer) so they match
  // whichever theme Slashy is in.
  themeVars: ['--background', '--foreground', '--foreground-strong', '--foreground-secondary', '--foreground-muted', '--surface', '--surface-hover', '--border', '--border-default', '--border-strong', '--accent', '--bg-hover'],
  // The toast Slashy shows after saveToDownloads succeeds, and its text when we return no folder.
  toast: '[role="status"]',
  savedToast: 'Saved to Downloads',
  // Slashy's desktop markup: these classes are -webkit-app-region drag / no-drag in its own CSS, so with our title bar
  // hidden its tab row, sidebar top and inbox headers move the window.
  dragRegion: '.electron-drag-region',
  // The tab row (our title bar) and the sidebar's top row, which pads 60px on the left for macOS window buttons.
  tabStrip: '[role="tablist"][aria-label="Open views"]',
  sidebarTopRow: '[class*="bg-[var(--sidebar-bg)]"] > .electron-drag-region:first-child',
  // Settings modal: nav items are div[data-perf="settings_section_<id>"] inside the open modal's <nav>.
  settingsModal: '[data-modal-open]',
  settingsSectionPrefix: 'settings_section_',
  // Compose store (zustand): found through React's fiber tree by these action/state names (see ComposeStore).
  composeStore: { open: 'openComposeWindow', minimize: 'setWindowMinimized', windows: 'windowsById', order: 'windowOrder' },
  // Open tabs, saved in localStorage (shared by every window).
  tabsStorageKey: 'slashyTabs',
  // Firebase keeps the signed-in session here (IndexedDB, localStorage as fallback).
  firebaseSession: { db: 'firebaseLocalStorageDb', store: 'firebaseLocalStorage', keyPrefix: 'firebase:authUser:' },
} as const

export type PageContract = typeof PAGE

// A thread as Slashy keeps it in its query cache and passes to openComposeWindow.
export interface SlashyThread {
  thread_id: string
  inbox_id?: string
  messages?: unknown[]
  [key: string]: unknown
}

// A composer's live state (to, cc, subject, content, draftId, ...), handed over on Pop Out.
export type DraftData = Record<string, unknown>

// What the compose store looks like through the names in PAGE.composeStore.
export interface ComposeStoreState {
  openComposeWindow(thread: SlashyThread, options?: { preferExistingThread?: boolean; fullscreenDraftData?: DraftData; [key: string]: unknown }): string
  setWindowMinimized(windowId: string, minimized: boolean): void
  windowsById: Record<string, { isMinimized?: boolean }>
  windowOrder: string[]
}

export interface ZustandStore<S> {
  getState(): S
  setState(partial: Partial<S>): void
  subscribe(listener: (state: S) => void): () => void
}

// Where a notification click should take you (Slashy's own shape; we just hand it back).
export interface NotificationTarget {
  view?: string | null
  threadId?: string | null
  inboxId?: string | null
  [key: string]: unknown
}

// A draft for onMailtoCompose: comma-separated address lists.
export interface MailtoDraft {
  to?: string
  subject?: string
  body?: string
  cc?: string
  bcc?: string
}

// The part of window.electronAPI that slashy.com calls when it runs in its desktop shell (all of it optional on the
// web side). Method names and payloads are Slashy's; preload/index.ts implements this.
export interface SlashyBridge {
  isSecondaryWindow: boolean
  showNotification(options: { title: string; body?: string; tag?: string; silent?: boolean; navigation?: NotificationTarget }): Promise<boolean>
  clearNotificationByTag(tag: string): Promise<void>
  clearNotificationCount(): Promise<void>
  onNotificationNavigate(cb: (target: NotificationTarget) => void): () => void
  openRouteInNewWindow(options: { route?: string; screenX?: number; screenY?: number }): Promise<{ opened: boolean }>
  openExternal(url: string): Promise<boolean>
  onMailtoCompose(cb: (draft: MailtoDraft) => void): () => void
  getPendingMailto(): Promise<MailtoDraft | null>
  getMailtoDefault(): Promise<{ isDefault: boolean; userOptedOut: boolean }>
  setMailtoDefault(enabled: boolean): Promise<{ success: boolean }>
  onOpenSettings(cb: (section: 'desktop') => void): () => void
  // Slashy's attachment download hands the file here instead of starting a browser download. It then shows its
  // "Saved to ..." toast; a path in the result adds a "Show" button (only if showItemInFolder exists, which we don't
  // provide).
  saveToDownloads(filename: string, data: ArrayBuffer): Promise<string | { filePath?: string; folderName?: string; usedFallback?: boolean } | undefined>
}
