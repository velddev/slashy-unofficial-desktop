// The main-process side of contracts.ts: answer page requests and send page events, both typed by the contract.
import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { requests } from './contracts.ts'
import type { Args, Channel, Events, Result } from './contracts.ts'
import { isSlashyUrl } from './slashy.ts'

type Handler<C extends Channel> = (e: IpcMainInvokeEvent, ...args: Args<C>) => Result<C> | Promise<Result<C>>
type Allow = (e: IpcMainInvokeEvent) => boolean

// The bridge is exposed to remote web content, so by default only frames actually on slashy.com get an answer.
const fromSlashy: Allow = (e) => isSlashyUrl(e.senderFrame?.url)

// Answers a page request. Calls from senders `allow` rejects, or that don't match the channel's contract, are dropped.
export function handle<C extends Channel>(channel: C, fn: Handler<C>, allow: Allow = fromSlashy) {
  ipcMain.handle(channel, (e, ...raw) => {
    if (!allow(e)) return undefined
    const parsed = requests[channel].args.safeParse(raw)
    if (!parsed.success) {
      console.warn(`[ipc] ${channel}: dropped a call that doesn't match its contract`, parsed.error.issues)
      return undefined
    }
    return fn(e, ...(parsed.data as Args<C>))
  })
}

export function send<E extends keyof Events>(wc: WebContents, event: E, ...payload: Events[E] extends undefined ? [] : [Events[E]]) {
  wc.send(event, ...payload)
}
