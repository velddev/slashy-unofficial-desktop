// The pure logic behind links, the local bundle, the network pass-through and the page contracts. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assetRefs, forwardPlan, isPage } from './src/bundle.ts'
import { EML_MAX_BYTES, requests } from './src/contracts.ts'
import { deepLinkTarget, isDeepLink, isMailto, parseMailto } from './src/links.ts'

test('mailto: links become Slashy draft fields', () => {
  assert.deepEqual(parseMailto('mailto:ada@example.com,bob@example.com?subject=Hello%20there&CC=carol@example.com&body=Line%201'), {
    to: 'ada@example.com,bob@example.com',
    subject: 'Hello there',
    body: 'Line 1',
    cc: 'carol@example.com',
    bcc: undefined,
  })
  assert.equal(parseMailto('mailto:?to=only@example.com').to, 'only@example.com')
  assert.ok(isMailto('MAILTO:x@y.z') && !isMailto('https://x'))
})

test('deep links only ever load slashy.com', () => {
  assert.equal(deepLinkTarget('slashyemail://auth-callback?custom_token=abc'), 'https://www.slashy.com/?custom_token=abc')
  assert.equal(deepLinkTarget('slashyemail://open?path=%2Fpricing'), 'https://www.slashy.com/pricing')
  assert.equal(deepLinkTarget('slashyemail://open?path=%2F%2Fevil.example%2Fx'), null) // protocol-relative escape
  assert.equal(deepLinkTarget('slashyemail://open?path=https%3A%2F%2Fevil.example'), null)
  assert.equal(deepLinkTarget('slashyemail://something-else'), null)
  assert.ok(isDeepLink('slashyemail://open') && !isDeepLink('https://www.slashy.com'))
})

test('app routes get the app page, files and API calls do not', () => {
  for (const p of ['/', '/all-mail', '/t/me%40x.com/1a2b3c', '/login/auth']) assert.ok(isPage(new URL(`https://www.slashy.com${p}`)), p)
  for (const p of ['/assets/index-abc.js', '/favicon.svg', '/api/thing']) assert.ok(!isPage(new URL(`https://www.slashy.com${p}`)), p)
  assert.ok(!isPage(new URL('https://fonts.googleapis.com/css2')))
})

test('the bundle crawler finds chunks and fonts', () => {
  const js = 'import("./threads-CLT2KmG-.js");const m=["assets/client-BlVCuV0Q.js","assets/index-x.css"];'
  const css = '@font-face{src:url(https://fonts.gstatic.com/s/geist/v1/a.woff2) format("woff2")}'
  assert.deepEqual(assetRefs(js + css), [
    '/assets/threads-CLT2KmG-.js',
    '/assets/client-BlVCuV0Q.js',
    '/assets/index-x.css',
    'https://fonts.gstatic.com/s/geist/v1/a.woff2',
  ])
})

const request = (url: string, init?: RequestInit) => new Request(url, init)

test('same-origin requests keep cookies and get no extra Origin', () => {
  const { first, retry } = forwardPlan(request('https://www.slashy.com/api/x', { referrer: 'https://www.slashy.com/all-mail' }))
  assert.equal(first.headers.get('origin'), null)
  assert.equal(first.credentials, 'include')
  assert.equal(retry, null)
})

test('cross-origin calls carry the page origin (Firebase refuses Slashy\'s key without it)', () => {
  // Firebase sends no referrer at all; the origin must still be slashy.com.
  const post = forwardPlan(request('https://identitytoolkit.googleapis.com/v1/accounts:lookup', { method: 'POST', body: '{}', referrer: '' }))
  assert.equal(post.first.headers.get('origin'), 'https://www.slashy.com')
  assert.equal(post.first.credentials, 'omit') // Electron refuses Origin + cookies together
  assert.equal(post.retry, null) // never re-send a POST

  // A cross-origin GET gets one retry without Origin (Electron fails redirects that carry one).
  const get = forwardPlan(request('https://slashy.com/favicon-32x32.png', { referrer: 'https://www.slashy.com/' }))
  assert.equal(get.first.headers.get('origin'), 'https://www.slashy.com')
  assert.equal(get.first.headers.get('referer'), 'https://www.slashy.com/')
  assert.equal(get.retry!.headers.get('origin'), null)
  assert.equal(get.retry!.credentials, 'include')
})

test('contracts accept what Slashy actually sends, extra fields included', () => {
  // showNotification as Slashy's pusher handler calls it (icon/url are extra fields we don't use)
  const notify = requests['notify'].args.parse([
    { title: 'Ada', body: 'Lunch?', icon: '/DashTrans.svg', tag: 'thread-1', silent: false, navigation: { view: 'inbox', threadId: 't1', inboxId: 'i1' }, url: '/' },
  ])
  assert.equal(notify[0].title, 'Ada')
  assert.equal((notify[0] as Record<string, unknown>).icon, '/DashTrans.svg') // passed through untouched
  assert.ok(requests['popout'].args.safeParse([{ route: '/t/me/1', screenX: 10, screenY: 20 }]).success)
  assert.ok(requests['compose:popout'].args.safeParse([{ thread: { thread_id: 't1', inbox_id: 'i1', messages: [] }, draft: { subject: 'Re: x' } }]).success)
  assert.ok(requests['mailto:pending'].args.safeParse([]).success)
})

test('contracts refuse malformed calls from the page', () => {
  assert.ok(!requests['notify'].args.safeParse([{ body: 'no title' }]).success)
  assert.ok(!requests['open-external'].args.safeParse([{ url: 'https://x' }]).success)
  assert.ok(!requests['compose:popout'].args.safeParse([{ thread: {}, draft: {} }]).success) // no thread_id
  assert.ok(!requests['desktop:action'].args.safeParse(['format-disk', true]).success) // unknown action
  assert.ok(!requests['eml:save'].args.safeParse([-1]).success)
  assert.ok(!requests['mailto:set'].args.safeParse(['yes']).success)
})

test('.eml attachments from the page: bytes and a sane name, within the size limit', () => {
  const open = requests['eml:open'].args
  assert.ok(open.safeParse(['OSS: REMINDER 2/2026.eml', new Uint8Array([70, 114, 111, 109])]).success)
  assert.ok(!open.safeParse(['', new Uint8Array(1)]).success) // no name
  assert.ok(!open.safeParse(['x.eml', 'From: a@b.c']).success) // not bytes
  assert.ok(!open.safeParse(['x.eml', new Uint8Array(EML_MAX_BYTES + 1)]).success) // too large
})
