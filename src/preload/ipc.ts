// The page side of contracts.ts. Type-only imports: the schemas (and zod) stay in the main process, which validates.
import { ipcRenderer } from 'electron'
import type { Args, Channel, Events, Result } from '../contracts.ts'

export const invoke = <C extends Channel>(channel: C, ...args: Args<C>): Promise<Result<C>> => ipcRenderer.invoke(channel, ...args)

// Subscribes to a main-process event; returns the unsubscribe function (the shape Slashy's bridge callbacks expect).
export function on<E extends keyof Events>(event: E, cb: (payload: Events[E]) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: Events[E]) => cb(payload)
  ipcRenderer.on(event, listener)
  return () => ipcRenderer.removeListener(event, listener)
}
