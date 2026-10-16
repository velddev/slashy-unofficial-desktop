// Every message between the main process and its pages (Slashy's windows and the .eml viewer), in one place.
//
//  - requests: page -> main (ipcRenderer.invoke / ipcMain.handle). `args` is a zod schema, and the main process
//    validates every call against it: the bridge is exposed to remote web content. Schemas are loose: they check the
//    fields we use and let anything else Slashy sends pass through. `returns` is the type the page gets back.
//  - events: main -> page (webContents.send / ipcRenderer.on). Typed only; the main process is trusted.
//
// Both sides are typed against this file (ipc.ts, preload/ipc.ts), so a renamed channel or a changed payload fails
// `npm run typecheck` instead of failing silently at runtime.
import { z } from 'zod'
import type { DraftData, MailtoDraft, NotificationTarget, SlashyThread } from './slashy.ts'

const request = <A extends z.ZodTuple, R = void>(args: A, returns?: R) => ({ args, returns: returns as R })
const returns = <T>() => undefined as T // type-only marker for what a request resolves to
const none = z.tuple([])

const notificationTarget = z.looseObject({ view: z.string().nullish(), threadId: z.string().nullish(), inboxId: z.string().nullish() })
const thread = z.looseObject({ thread_id: z.string(), inbox_id: z.string().nullish() })
const cssColor = z.string().regex(/^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\))$/i)

export const EML_MAX_BYTES = 50 * 1024 * 1024

export const DESKTOP_ACTIONS = ['check-app-update', 'install-app-update', 'check-bundle', 'apply-bundle', 'open-at-login', 'keep-running', 'set-mail-default', 'reset-zoom'] as const

export const requests = {
  // Slashy's bridge (window.electronAPI, see SlashyBridge in slashy.ts)
  'notify': request(
    z.tuple([z.looseObject({ title: z.string(), body: z.string().nullish(), tag: z.string().nullish(), silent: z.boolean().nullish(), navigation: notificationTarget.nullish() })]),
    returns<boolean>(),
  ),
  'notify:clear': request(z.tuple([z.string()])),
  'popout': request(z.tuple([z.looseObject({ route: z.string().nullish(), screenX: z.number().nullish(), screenY: z.number().nullish() })]), returns<{ opened: boolean }>()),
  'open-external': request(z.tuple([z.string()]), returns<boolean>()),
  'mailto:pending': request(none, returns<MailtoDraft | null>()),
  'mailto:get': request(none, returns<{ isDefault: boolean; userOptedOut: boolean }>()),
  'mailto:set': request(z.tuple([z.boolean()]), returns<{ success: boolean }>()),

  // Compose pop-out windows (preload/pop-out.page.ts)
  'compose:popout': request(z.tuple([z.object({ thread, draft: z.record(z.string(), z.unknown()) })]), returns<boolean>()),
  'compose:target': request(none, returns<ComposeTarget | null>()),
  'compose:ready': request(none),
  'window:minimize': request(none),

  // Main and tab windows: colour the native window buttons drawn over the tab row (preload/title-bar.ts)
  'window:title-bar': request(z.tuple([z.object({ color: cssColor, symbolColor: cssColor })])),

  // One-time "set Slashy as default" card: the page was signed out, ask again later
  'mailto:not-yet': request(none),

  // An .eml attachment from Slashy, opened in the viewer straight from memory (never written to disk)
  'eml:open': request(z.tuple([z.string().min(1).max(255), z.instanceof(Uint8Array).refine((b) => b.byteLength <= EML_MAX_BYTES, 'email too large')]), returns<boolean>()),

  // .eml viewer (eml.html)
  'eml:get': request(none, returns<EmlView>()),
  'eml:save': request(z.tuple([z.number().int().nonnegative()])),
  'eml:save-original': request(none),
  'eml:reply': request(none),

  // Settings > Desktop
  'desktop:info': request(none, returns<DesktopInfo>()),
  'desktop:action': request(z.tuple([z.enum(DESKTOP_ACTIONS), z.boolean()])),
  'startup:ready': request(none),
}

export interface Events {
  'notify:navigate': NotificationTarget // a notification was clicked
  'compose': MailtoDraft // open this draft (mailto: link, .eml reply)
  'open-settings': 'desktop' // tray "Desktop settings"
  'mailto-prompt': undefined // show the one-time "set Slashy as default" card
}

// Asked synchronously by every preload before anything else.
export const WINDOW_KIND = 'window-kind'
export type WindowKind = 'main' | 'secondary' | 'compose' | 'eml'

export type Requests = typeof requests
export type Channel = keyof Requests
export type Args<C extends Channel> = z.infer<Requests[C]['args']>
export type Result<C extends Channel> = Requests[C]['returns']
export type DesktopAction = (typeof DESKTOP_ACTIONS)[number]

// --- Payloads the main process sends back ---

export interface ComposeTarget {
  thread: SlashyThread
  draft: DraftData
}

export interface EmlView {
  from?: unknown
  to?: unknown
  cc?: unknown
  date?: string
  subject?: string
  text?: string
  html?: string
  attachments: { filename: string | null; size: number; mimeType: string }[]
  theme: Record<string, string> // Slashy's CSS custom properties at the time the viewer opened
}

export interface BundleInfo {
  current: { dpl: string; fetchedAt: number; bytes: number; files: number } | null
  next: { dpl: string; fetchedAt: number } | null
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error'
  error: string | null
  lastCheck: number | null
  progress: { done: number; total: number } | null
}

export interface UpdateState {
  status: 'dev' | 'idle' | 'checking' | 'downloading' | 'up-to-date' | 'ready' | 'error'
  version?: string
  percent?: number
  error?: string | null
}

export interface LastStartup {
  ms: number
  shownMs: number | null
  at: number
  fromDisk: boolean
}

export interface DesktopInfo {
  version: string
  update: UpdateState
  bundle: BundleInfo
  startup: LastStartup | null
  openAtLogin: boolean
  keepRunning: boolean
  mailDefault: boolean
  zoom: number
}
