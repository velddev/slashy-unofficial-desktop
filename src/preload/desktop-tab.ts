// Settings > Desktop: an extra section in Slashy's settings modal. Built from the same markup, classes and theme
// tokens as Slashy's own sections (nav item div[data-perf=settings_section_*], h2 header, data-setting-id rows,
// role=switch toggles) so it reads as native. DOM only; the data and actions are in desktop.ts.
import type { BundleInfo, DesktopAction, DesktopInfo, UpdateState } from '../contracts.ts'
import { PAGE } from '../slashy.ts'
import { invoke, on } from './ipc.ts'

const SECTION = `[data-perf^="${PAGE.settingsSectionPrefix}"]`
const OURS = `[data-perf="${PAGE.settingsSectionPrefix}desktop"]`
const NAV_ITEMS = `${PAGE.settingsModal} nav ${SECTION}`
const CHECK_EVERY_MS = 500 // Slashy (re)renders the modal on its own schedule; (re)attach the nav item this often

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>'
const ITEM = 'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors '

const STYLE = `
  [data-desktop-active] ${SECTION}:not(${OURS}) { background: transparent !important; }
  [data-desktop-active] ${SECTION}:not(${OURS}) span { color: var(--foreground-secondary) !important; }
  [data-desktop-pane] > :not([data-desktop-panel]) { display: none !important; }
  [data-desktop-panel] .desk-btn { font: inherit; font-size: 13px; font-weight: 500; padding: 5px 12px; border: 0; border-radius: 8px; cursor: pointer;
    background: var(--border-default, #444); color: var(--foreground-strong, #ebebeb); white-space: nowrap; }
  [data-desktop-panel] .desk-btn:hover { background: var(--border-strong, #555); }
  [data-desktop-panel] .desk-btn:disabled { opacity: .5; cursor: default; }
  [data-desktop-panel] .desk-rows { display: flex; flex-direction: column; gap: 20px; margin-top: 20px; }`

// --- Markup helpers (Slashy's classes) ---

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`
const when = (t: number | null | undefined) => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never')

const row = (id: string, title: string, desc: string, control = '') => `
  <div class="flex justify-between items-start gap-6" data-setting-id="desktop-${id}">
    <div class="flex flex-col"><span class="text-[14px] leading-[20px] font-medium text-[var(--foreground)]">${esc(title)}</span>
    <span class="text-[12px] leading-[16px] font-normal text-[var(--settings-description-text)]">${desc}</span></div>${control}</div>`
const button = (action: DesktopAction, label: string, disabled = false) =>
  `<button type="button" class="desk-btn" data-action="${action}" ${disabled ? 'disabled' : ''}>${esc(label)}</button>`
const toggle = (action: DesktopAction, on: boolean, label: string) => `
  <button type="button" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-state="${on ? 'checked' : 'unchecked'}" data-action="${action}" data-value="${!on}"
    class="peer inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-[14px] p-[3px] transition-[background] duration-500 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 data-[state=checked]:bg-[var(--accent)] data-[state=unchecked]:bg-[var(--toggle-track)]">
    <span data-state="${on ? 'checked' : 'unchecked'}" class="pointer-events-none block h-4 w-4 rounded-full bg-[var(--toggle-thumb)] ring-0 transition-all duration-300 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"></span>
  </button>`
const section = (title: string) => `<div class="text-[16px] leading-[24px] font-semibold text-[var(--foreground)] mt-6 pb-2 -mb-2 border-b border-[var(--border)]">${esc(title)}</div>`

// --- The panel ---

function appRow(u: UpdateState, version: string) {
  const status: Record<UpdateState['status'], string> = {
    dev: 'running from source',
    checking: 'checking…',
    downloading: `downloading ${u.version ?? ''} ${u.percent != null ? `${u.percent}%` : ''}`,
    ready: `${u.version} ready, restart to install`,
    'up-to-date': 'up to date',
    error: `update check failed: ${u.error ?? ''}`,
    idle: 'checks every 4 hours',
  }
  const busy = u.status === 'dev' || u.status === 'checking' || u.status === 'downloading'
  const control = u.status === 'ready' ? button('install-app-update', 'Restart to update') : button('check-app-update', u.status === 'checking' ? 'Checking…' : 'Check for updates', busy)
  return row('app', 'Slashy for Windows', `Version ${esc(version)} · ${esc(status[u.status])}`, control)
}

function bundleRow(b: BundleInfo) {
  const busy = b.status === 'checking' || b.status === 'downloading'
  const status =
    b.status === 'downloading' && b.progress ? `downloading update (${b.progress.done}/${b.progress.total} files)`
    : b.next ? 'newer version ready (applies on next start, or now)'
    : b.status === 'error' ? `last check failed: ${esc(b.error)}`
    : b.status === 'checking' ? 'checking…'
    : `checked ${when(b.lastCheck)}`
  const desc = b.current
    ? `${esc(b.current.dpl.replace(/^dpl_/, '').slice(0, 10))} · downloaded ${when(b.current.fetchedAt)} · ${mb(b.current.bytes)}, ${b.current.files} files<br>Kept on this PC so Slashy opens instantly and works offline · ${status}`
    : `Not downloaded yet · ${status}`
  const control = b.next ? button('apply-bundle', 'Apply now') : button('check-bundle', busy ? 'Checking…' : 'Check now', busy)
  return row('bundle', 'Web app', desc, control)
}

function render(info: DesktopInfo) {
  const s = info.startup
  return `
    <div class="flex w-full border-b border-[var(--border)] pb-2"><h2 class="text-[17px] leading-[22px] font-semibold text-[var(--foreground)]">Desktop</h2></div>
    <div class="desk-rows">
      ${appRow(info.update, info.version)}
      ${bundleRow(info.bundle)}
      ${row('startup', 'Startup time', s ? `Inbox ready ${(s.ms / 1000).toFixed(2)}s after launch (${when(s.at)}, ${s.fromDisk ? 'from this PC' : 'from the network'})` : 'Measured on next launch')}
      ${section('General')}
      ${row('open-at-login', 'Open at sign-in', 'Start Slashy in the background when you sign in to Windows, so it opens instantly', toggle('open-at-login', info.openAtLogin, 'Open at sign-in'))}
      ${row('keep-running', 'Keep running when closed', 'Closing the window keeps Slashy in the tray, so new mail still notifies you', toggle('keep-running', info.keepRunning, 'Keep running when closed'))}
      ${row('mail-default', 'Default email app', info.mailDefault ? 'Email links open in Slashy' : 'Email links open in another app', info.mailDefault ? '' : button('set-mail-default', 'Set as default'))}
      ${row('zoom', 'Zoom', `${info.zoom}% · Ctrl + / Ctrl − to change, Ctrl 0 to reset`, info.zoom !== 100 ? button('reset-zoom', 'Reset') : '')}
    </div>`
}

type Panel = HTMLDivElement & { rendered?: string }

async function refresh(pane: Element) {
  let panel = pane.querySelector<Panel>('[data-desktop-panel]')
  if (!panel) {
    const created: Panel = document.createElement('div')
    created.dataset.desktopPanel = ''
    created.className = 'flex flex-col'
    created.addEventListener('click', async (e) => {
      const el = (e.target as Element).closest<HTMLButtonElement>('[data-action]')
      if (!el || el.disabled) return
      await invoke('desktop:action', el.dataset.action as DesktopAction, el.dataset.value === 'true')
      refresh(pane)
    })
    pane.append(created)
    panel = created
  }
  // Compare with what we last rendered (innerHTML comes back normalized), so unchanged state never rebuilds the DOM.
  const html = render(await invoke('desktop:info'))
  if (panel.rendered !== html) (panel.innerHTML = html), (panel.rendered = html)
}

export function desktopTab() {
  let wantDesktop = false
  on('open-settings', () => (wantDesktop = true))
  const style = document.createElement('style')
  style.textContent = STYLE

  setInterval(() => {
    const nav = document.querySelector(NAV_ITEMS)?.parentElement
    const pane = nav?.parentElement?.nextElementSibling
    if (!nav || !pane) return
    if (!style.isConnected) document.head.append(style)
    const setActive = (on: boolean) => {
      nav.toggleAttribute('data-desktop-active', on)
      pane.toggleAttribute('data-desktop-pane', on)
      if (!on) return pane.querySelector('[data-desktop-panel]')?.remove()
      pane.scrollTop = 0
      refresh(pane)
    }
    let item = nav.querySelector<HTMLElement>(OURS)
    if (!item) {
      item = document.createElement('div')
      item.tabIndex = 0
      item.dataset.perf = `${PAGE.settingsSectionPrefix}desktop`
      nav.append(item)
      item.addEventListener('click', () => setActive(true))
      item.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && setActive(true))
      // Any other section hands the pane back to Slashy.
      nav.addEventListener('click', (e) => !(e.target as Element).closest(OURS) && setActive(false), true)
    }
    const active = nav.hasAttribute('data-desktop-active')
    const tone = active ? 'foreground' : 'foreground-secondary'
    item.className = ITEM + (active ? 'bg-[var(--sidebar-item-bg-active)]' : 'bg-transparent hover:bg-[var(--sidebar-item-bg-hover)]')
    const inner = `<span class="w-4 h-4 flex items-center justify-center flex-shrink-0 text-[var(--${tone})]">${ICON}</span><span class="text-sm font-medium text-[var(--${tone})]">Desktop</span>`
    if (item.dataset.tone !== tone) (item.innerHTML = inner), (item.dataset.tone = tone)
    if (wantDesktop) {
      wantDesktop = false
      setActive(true)
    } else if (active) refresh(pane)
  }, CHECK_EVERY_MS)
}
