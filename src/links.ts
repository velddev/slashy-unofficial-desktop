// Parsing for the links the app is launched with (mailto:, slashyemail://). No Electron here, so it's testable.
import { DEEP_LINK_PROTOCOL, ORIGIN } from './slashy.ts'
import type { MailtoDraft } from './slashy.ts'

export const isDeepLink = (arg: string) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`)
export const isMailto = (arg: string) => /^mailto:/i.test(arg)

// mailto:a@x.com,b@x.com?subject=Hi&CC=c@x.com -> the draft fields Slashy's onMailtoCompose expects (comma lists).
export function parseMailto(link: string): MailtoDraft {
  const url = new URL(link)
  const q: Record<string, string | undefined> = Object.fromEntries([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]))
  const to = [decodeURIComponent(url.pathname), q.to].filter(Boolean).join(',')
  return { to, subject: q.subject, body: q.body, cc: q.cc, bcc: q.bcc }
}

// slashyemail://... -> the slashy.com URL the main window should load, or null.
export function deepLinkTarget(link: string): string | null {
  const url = new URL(link)
  if (url.hostname === 'auth-callback') return `${ORIGIN}/${url.search}` // the web app picks token/custom_token up from the query
  if (url.hostname === 'open') {
    const target = new URL(url.searchParams.get('path') ?? '/', ORIGIN)
    return target.origin === ORIGIN ? target.href : null
  }
  return null
}
