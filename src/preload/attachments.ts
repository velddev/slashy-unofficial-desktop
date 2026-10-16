// Received attachments. Slashy downloads an attachment into memory and, in a desktop shell, hands it to
// window.electronAPI.saveToDownloads (see SlashyBridge). .eml files open in the viewer straight from those bytes, so
// nothing is written to disk; everything else gets the same browser download Slashy would start without the hook.
// Clicking an .eml card (which does nothing in Slashy) presses its Download button, so it opens too.
import type { SlashyBridge } from '../slashy.ts'
import { PAGE } from '../slashy.ts'
import { invoke } from './ipc.ts'

const isEml = (filename: string | null | undefined) => /\.eml$/i.test(filename ?? '')

// Slashy's own fallback when there's no desktop hook: a blob URL and a hidden <a download>.
function browserDownload(filename: string, data: ArrayBuffer) {
  const url = URL.createObjectURL(new Blob([data]))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  setTimeout(() => (URL.revokeObjectURL(url), a.remove()), 1000)
}

// After saveToDownloads returns, Slashy always toasts "Saved to Downloads"; for an .eml we opened instead, that's
// untrue, so hide that one toast. React owns the element: it's hidden, not removed, and shown again afterwards.
function hideSavedToast() {
  const isSavedToast = (el: Element) => el.textContent?.trim() === PAGE.savedToast
  const observer = new MutationObserver(() => {
    const toast = [...document.querySelectorAll<HTMLElement>(PAGE.toast)].find(isSavedToast)
    if (!toast) return
    observer.disconnect()
    toast.style.display = 'none'
    setTimeout(() => (toast.style.display = ''), 4000) // after Slashy's toast duration
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  setTimeout(() => observer.disconnect(), 3000)
}

export const saveToDownloads: SlashyBridge['saveToDownloads'] = async (filename, data) => {
  if (isEml(filename)) {
    const opened = await invoke('eml:open', filename, new Uint8Array(data)).catch(() => false)
    if (opened) {
      hideSavedToast()
      return undefined
    }
  }
  browserDownload(filename, data) // also the fallback if the .eml couldn't be opened
  return undefined
}

export function openEmlCardsOnClick() {
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element
      const card = target.closest(PAGE.attachmentCard)
      const download = card?.querySelector<HTMLButtonElement>(PAGE.attachmentDownload)
      if (!card || !download || download.contains(target)) return
      if (isEml(card.querySelector(PAGE.attachmentName)?.getAttribute('title'))) download.click()
    },
    true,
  )
}
