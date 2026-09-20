/** Native editing and restricted browser handoff for Desktop-owned documents. */

import { clipboard, dialog, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { DesktopMessages } from './locale.ts'

function webLink(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') return undefined
    return url.href
  } catch (error) {
    // URL parsing rejects malformed renderer-supplied destinations.
    if (error instanceof TypeError) return undefined
    throw error
  }
}

function ownedDocument(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'dsh-app:' && ['app', 'shell'].includes(url.hostname)
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}

/**
 * Build native roles so Electron owns editing actions and platform shortcuts.
 * @param messages - Shell-owned localized menu labels.
 * @returns Application Edit menu.
 */
export function desktopEditMenu(messages: DesktopMessages): MenuItemConstructorOptions {
  return {
    label: messages.editMenu,
    submenu: [
      { role: 'undo', label: messages.undo },
      { role: 'redo', label: messages.redo },
      { type: 'separator' },
      { role: 'cut', label: messages.cut },
      { role: 'copy', label: messages.copy },
      { role: 'paste', label: messages.paste },
      { role: 'pasteAndMatchStyle', label: messages.pasteAndMatchStyle },
      { type: 'separator' },
      { role: 'selectAll', label: messages.selectAll },
    ],
  }
}

/**
 * Attach native context menus and validated HTTP(S) handoff; never create a child window.
 * @param window - Sandboxed Desktop window owning the event listeners.
 * @param messages - Shell-owned localized menu and failure labels.
 */
export function installDesktopWindowInteractions(window: BrowserWindow, messages: DesktopMessages): void {
  const contents = window.webContents
  const openLink = (value: string): void => {
    if (!ownedDocument(contents.getURL())) return
    const url = webLink(value)
    if (url === undefined) return
    void shell.openExternal(url).catch(() => {
      // OS handoff errors can include the destination's private query; show only localized recovery advice.
      if (window.isDestroyed()) return
      void dialog.showMessageBox(window, {
        type: 'error', title: messages.externalLinkFailedTitle, message: messages.externalLinkFailed,
      }).catch((error: unknown) => { console.error(error) })
    })
  }
  contents.setWindowOpenHandler(({ url }) => {
    openLink(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (ownedDocument(url)) return
    event.preventDefault()
    openLink(url)
  })
  contents.on('will-redirect', (event, url) => {
    if (!ownedDocument(url)) event.preventDefault()
  })
  contents.on('context-menu', (_event, params) => {
    if (!ownedDocument(contents.getURL())) return
    const items: MenuItemConstructorOptions[] = []
    const flags = params.editFlags
    if (params.isEditable) items.push({ role: 'cut', label: messages.cut, enabled: flags.canCut })
    if (params.isEditable || params.selectionText !== '') {
      items.push({ role: 'copy', label: messages.copy, enabled: flags.canCopy })
    }
    if (params.isEditable) {
      items.push(
        { role: 'paste', label: messages.paste, enabled: flags.canPaste },
        { role: 'selectAll', label: messages.selectAll, enabled: flags.canSelectAll },
      )
    }
    const url = webLink(params.linkURL)
    if (url !== undefined) {
      if (items.length > 0) items.push({ type: 'separator' })
      items.push(
        { label: messages.openLinkInBrowser, click: () => { openLink(url) } },
        {
          label: messages.copyLinkAddress,
          click: () => {
            void clipboard.writeText(url).catch(() => {
              if (window.isDestroyed()) return
              void dialog.showMessageBox(window, {
                type: 'error', title: messages.copyLinkFailedTitle, message: messages.copyLinkFailed,
              }).catch((error: unknown) => { console.error(error) })
            })
          },
        },
      )
    }
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window })
  })
}
