// Local copy of slashy.com's web app (HTML, JS chunks, CSS, fonts), served from disk under the real
// https://www.slashy.com origin. The app starts without waiting on the network and still opens offline, while login,
// cookies and Slashy's own IndexedDB mail cache are untouched (same origin). Everything else goes to the network.
//
// Layout in <dir>: files/<sha1> + files/<sha1>.json (body + content type), index-<dpl>.html + .json (page + its
// headers), meta.json (the bundle in use) and next.json (a newer bundle, fully downloaded, applied on next start
// or when the PC is idle).
import type { Session } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { BundleInfo } from './contracts.ts'
import { APP_HOST, BUNDLE_HOSTS, DEPLOY_ID, ORIGIN, PAGE_HEADERS } from './slashy.ts'

const CACHED_HOSTS = new Set(BUNDLE_HOSTS)
const DOWNLOADS_AT_ONCE = 8
const FIRST_RUN_CHECK_AFTER_MS = 5000
// Chunk/asset references inside JS and CSS: "./name-hash.js", "assets/name-hash.css", url(/assets/font.woff2), …
const ASSET_REF = /(?:\.\/|\/?assets\/)([\w-]+(?:\.[\w-]+)*\.(?:js|css|woff2?|svg|png|webp|wasm))/g
const FONT_REF = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/g

// --- Rules (pure, tested in test.ts) ---

// An app route (/, /all-mail, /t/<inbox>/<thread>, ...) gets the app page; files have an extension.
export const isPage = (url: URL) => url.hostname === APP_HOST && !/\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.startsWith('/api/')

// Files a JS/CSS file pulls in: its chunk imports and its fonts.
export function assetRefs(text: string): string[] {
  return [...[...text.matchAll(ASSET_REF)].map(([, name]) => `/assets/${name}`), ...[...text.matchAll(FONT_REF)].map(([, font]) => font)]
}

type ForwardInit = Omit<RequestInit, 'headers'> & { headers: Headers; duplex: 'half' }

// How to re-send a renderer request from the main process as the browser would have. protocol.handle hands us
// requests without Origin/Referer, and Google refuses Slashy's Firebase key without an origin (403 -> Firebase signs
// you out).
// ponytail: Electron's net.fetch refuses an explicit Origin together with cookies, and fails redirects that carry
// one. So cross-origin calls go cookie-less (Slashy authenticates with Bearer tokens; its only credentials:'include'
// is Firebase's local emulator), and a GET that fails with Origin is retried once without it (redirecting images).
// Redirects are followed by net.fetch and the page gets the final response at the original URL (it can't hand a 3xx
// back); fine for API/images/attachments, and the app page itself comes from disk.
export function forwardPlan(req: Request): { first: ForwardInit; retry: ForwardInit | null } {
  const referrer = req.referrer && req.referrer !== 'about:client' ? req.referrer : null
  const initiator = referrer ? new URL(referrer).origin : ORIGIN
  const bodyless = ['GET', 'HEAD'].includes(req.method)
  const crossOrigin = new URL(req.url).origin !== initiator
  const init = (withOrigin: boolean): ForwardInit => {
    const headers = new Headers(req.headers)
    if (referrer) headers.set('referer', referrer)
    if (withOrigin) headers.set('origin', initiator)
    return {
      method: req.method,
      headers,
      body: bodyless ? undefined : req.body,
      duplex: 'half',
      credentials: withOrigin || req.credentials === 'omit' ? 'omit' : 'include',
    }
  }
  return { first: init(crossOrigin), retry: crossOrigin && bodyless ? init(false) : null }
}

// --- The bundle on disk ---

interface BundleMeta {
  dpl: string
  index: string // index-<dpl>.html
  fetchedAt: number
  bytes: number
  keys: string[] // every file this bundle uses
  files?: number // set once fully downloaded
}

interface CachedFile {
  body: Buffer
  type: string
}

export type Bundle = ReturnType<typeof createBundle>

export function createBundle(ses: Session, dir: string) {
  const files = path.join(dir, 'files')
  const state: Omit<BundleInfo, 'current' | 'next'> = { status: 'idle', error: null, lastCheck: null, progress: null }
  let meta: BundleMeta | null = null
  let next: BundleMeta | null = null
  let simulateOffline = false

  const readJson = <T>(f: string): Promise<T | null> => fs.readFile(path.join(dir, f), 'utf8').then(JSON.parse).catch(() => null)
  const writeJson = (f: string, v: unknown) => fs.writeFile(path.join(dir, f), JSON.stringify(v))
  const keyFor = (url: URL) => crypto.createHash('sha1').update(url.hostname + url.pathname + (url.hostname === APP_HOST ? '' : url.search)).digest('hex')
  const net = async (input: string, init: RequestInit | ForwardInit = {}) => {
    if (simulateOffline) throw new Error('offline (simulated)')
    return ses.fetch(input, { ...(init as RequestInit), bypassCustomProtocolHandlers: true })
  }
  const forward = (req: Request) => {
    const { first, retry } = forwardPlan(req)
    return retry ? net(req.url, first).catch(() => net(req.url, retry)) : net(req.url, first)
  }
  const dplOf = (html: string) => html.match(DEPLOY_ID)?.[1]

  async function readFile(url: URL): Promise<CachedFile | null> {
    const key = keyFor(url)
    try {
      const [body, head] = await Promise.all([fs.readFile(path.join(files, key)), fs.readFile(path.join(files, `${key}.json`), 'utf8')])
      return { body, type: JSON.parse(head).type }
    } catch {
      return null
    }
  }

  async function saveFile(url: URL, body: Buffer, type: string) {
    const key = keyFor(url)
    await fs.writeFile(path.join(files, key), body)
    await fs.writeFile(path.join(files, `${key}.json`), JSON.stringify({ url: url.href, type }))
    return key
  }

  const fileResponse = ({ body, type }: CachedFile) => new Response(new Uint8Array(body), { headers: { 'content-type': type, 'access-control-allow-origin': '*' } })

  async function pageResponse() {
    if (!meta) return null
    try {
      const [html, headers] = await Promise.all([fs.readFile(path.join(dir, meta.index)), readJson<Record<string, string>>(`${meta.index}.json`)])
      return new Response(new Uint8Array(html), { headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
    } catch {
      return null
    }
  }

  // Stores a page (and its security headers) as a bundle; returns its meta. Assets are fetched by download().
  async function savePage(html: string, res: Response): Promise<BundleMeta> {
    const dpl = dplOf(html) ?? `dpl_unknown_${Date.now()}`
    const index = `index-${dpl}.html`
    await fs.writeFile(path.join(dir, index), html)
    await writeJson(`${index}.json`, Object.fromEntries(PAGE_HEADERS.filter((h) => res.headers.has(h)).map((h) => [h, res.headers.get(h)])))
    return { dpl, index, fetchedAt: Date.now(), bytes: Buffer.byteLength(html), keys: [] }
  }

  // Downloads every file the page needs, following chunk imports in JS and font/url() refs in CSS.
  async function download(html: string, bundleMeta: BundleMeta) {
    const seen = new Set<string>()
    const queue: URL[] = []
    const add = (href: string) => {
      try {
        const url = new URL(href, `${ORIGIN}/`)
        if (!CACHED_HOSTS.has(url.hostname) || isPage(url)) return
        const k = keyFor(url)
        if (!seen.has(k)) seen.add(k), queue.push(url)
      } catch {}
    }
    for (const [, href] of html.matchAll(/(?:src|href)="([^"]+)"/g)) add(href.replace(/\?dpl=.*$/, ''))
    let done = 0
    let bytes = bundleMeta.bytes
    const worker = async () => {
      while (queue.length) {
        const url = queue.shift()!
        let hit = await readFile(url)
        if (!hit) {
          const res = await net(url.href).catch(() => null)
          if (!res?.ok) continue // stray string that looked like a chunk name, or a file the CDN no longer has
          const type = res.headers.get('content-type') ?? 'application/octet-stream'
          hit = { body: Buffer.from(await res.arrayBuffer()), type }
          await saveFile(url, hit.body, type)
        }
        bytes += hit.body.length
        bundleMeta.keys.push(keyFor(url))
        if (/javascript|css/.test(hit.type)) for (const ref of assetRefs(hit.body.toString('utf8'))) add(ref)
        state.progress = { done: ++done, total: seen.size }
      }
    }
    await Promise.all(Array.from({ length: DOWNLOADS_AT_ONCE }, worker))
    bundleMeta.bytes = bytes
    bundleMeta.files = bundleMeta.keys.length
  }

  // Makes `next` the bundle in use and deletes files no bundle references any more.
  async function apply() {
    if (!next) return false
    const current = (meta = next)
    next = null
    await writeJson('meta.json', current)
    await fs.rm(path.join(dir, 'next.json'), { force: true })
    const keep = new Set(current.keys)
    for (const f of await fs.readdir(files)) if (!keep.has(f.replace(/\.json$/, ''))) await fs.rm(path.join(files, f), { force: true })
    for (const f of await fs.readdir(dir)) if (/^index-.*\.html(\.json)?$/.test(f) && !f.startsWith(current.index)) await fs.rm(path.join(dir, f), { force: true })
    return true
  }

  // Fetches the live page; if it's a different deploy, downloads the whole bundle in the background as `next`.
  async function check() {
    if (state.status === 'checking' || state.status === 'downloading') return state.status
    state.status = 'checking'
    state.error = null
    try {
      const res = await net(`${ORIGIN}/`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`slashy.com answered ${res.status}`)
      const html = await res.text()
      state.lastCheck = Date.now()
      const latest = next ?? meta
      if (latest?.files && dplOf(html) === latest.dpl) return (state.status = next ? 'ready' : 'up-to-date')
      state.status = 'downloading'
      state.progress = null
      const candidate = await savePage(html, res)
      await download(html, candidate)
      next = candidate
      await writeJson('next.json', next)
      if (!meta?.files) await apply() // first run: nothing worth keeping yet
      return (state.status = next ? 'ready' : 'up-to-date')
    } catch (err) {
      state.error = String((err as Error).message ?? err)
      return (state.status = 'error')
    }
  }

  // protocol.handle('https') handler: bundle files from disk, everything else straight to the network.
  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (req.method !== 'GET' || !CACHED_HOSTS.has(url.hostname) || url.pathname.startsWith('/api/')) return forward(req)
    if (isPage(url)) {
      const cached = await pageResponse()
      if (cached) return cached
      const res = await forward(req) // first run: take the live page and make it the bundle
      if (!res.ok) return res
      const html = await res.text()
      meta = await savePage(html, res)
      await writeJson('meta.json', meta)
      setTimeout(check, FIRST_RUN_CHECK_AFTER_MS)
      return (await pageResponse()) ?? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    const hit = await readFile(url)
    if (hit) return fileResponse(hit)
    const res = await forward(req)
    if (res.status !== 200) return res
    const body = Buffer.from(await res.arrayBuffer())
    const type = res.headers.get('content-type') ?? 'application/octet-stream'
    await saveFile(url, body, type).catch(() => {})
    return fileResponse({ body, type })
  }

  async function init() {
    await fs.mkdir(files, { recursive: true })
    meta = await readJson<BundleMeta>('meta.json')
    next = await readJson<BundleMeta>('next.json')
    if (next) await apply() // a bundle downloaded last session takes effect on this start
    ses.protocol.handle('https', handle)
  }

  const info = (): BundleInfo => ({
    current: meta && { dpl: meta.dpl, fetchedAt: meta.fetchedAt, bytes: meta.bytes, files: meta.files ?? 0 },
    next: next && { dpl: next.dpl, fetchedAt: next.fetchedAt },
    ...state,
  })

  return { init, check, apply, info, hasUpdate: () => !!next, setSimulateOffline: (v: boolean) => (simulateOffline = v), dir }
}
