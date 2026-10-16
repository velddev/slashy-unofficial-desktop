// Where the profile lives, and the app's own settings (settings.json in it).
import { app } from 'electron'
import type { Rectangle } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { LastStartup } from './contracts.ts'

// The profile (login, mail cache) lives here whatever the app is called; renaming it once logged everyone out.
// Runs on import, before anything reads userData; import this module first. A --user-data-dir switch (QA) wins.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'slashy-windows'))

export interface Settings {
  zoom?: number
  mainBounds?: Rectangle
  mainMaximized?: boolean
  keepRunning?: boolean
  mailtoOptOut?: boolean
  mailtoPromptSeen?: boolean
  lastStartup?: LastStartup
}

const file = path.join(app.getPath('userData'), 'settings.json')

export const settings: Settings = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => ({}))

export function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch)
  fs.writeFile(file, JSON.stringify(settings)).catch(() => {})
}
