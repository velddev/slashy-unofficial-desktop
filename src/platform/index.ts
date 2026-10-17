// Everything that differs between Windows and Linux: one module per OS (named after process.platform) behind the same
// interface. The rest of the app imports `platform` from here and never checks process.platform itself.
import type { NativeImage } from 'electron'
import { linux } from './linux.ts'
import { win32 } from './win32.ts'

export type Platform = {
  // Whether Slashy is the default mailto: handler.
  isMailDefault(): Promise<boolean>
  // Makes Slashy *available* for mailto: links and .eml files. Idempotent; runs on every packaged start.
  registerMailApp(): Promise<void>
  // Makes Slashy the default, or takes the user to where the OS lets them pick it.
  chooseMailDefault(): Promise<void>
  // The packaged app's tray icon (dev runs use build/icon.png).
  trayIcon(): Promise<NativeImage | string>
}

export const platform: Platform = process.platform === 'linux' ? linux : win32
