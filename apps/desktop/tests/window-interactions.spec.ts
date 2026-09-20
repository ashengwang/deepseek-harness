import { EventEmitter } from 'node:events'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { en, zh } from '../src/locale.ts'
import { desktopEditMenu, installDesktopWindowInteractions } from '../src/window-interactions.ts'

const electron = vi.hoisted(() => ({
  openExternal: vi.fn(async (_url: string) => {}),
  writeText: vi.fn(async (_value: string) => {}),
  showMessageBox: vi.fn(async () => {}),
  popup: vi.fn(),
  buildFromTemplate: vi.fn((_items: MenuItemConstructorOptions[]) => ({ popup: electron.popup })),
}))
vi.mock('electron', () => ({
  shell: { openExternal: electron.openExternal }, clipboard: { writeText: electron.writeText },
  dialog: { showMessageBox: electron.showMessageBox }, Menu: { buildFromTemplate: electron.buildFromTemplate },
}))

function fixture() {
  let currentURL = 'dsh-app://app/index.html'
  let destroyed = false
  let openWindow!: (details: { url: string }) => { action: string }
  const contents = Object.assign(new EventEmitter(), {
    getURL: () => currentURL,
    setWindowOpenHandler: (handler: typeof openWindow) => { openWindow = handler },
  })
  // Only the Electron window methods used by the real installer are substituted.
  const window = { webContents: contents, isDestroyed: () => destroyed } as unknown as BrowserWindow
  installDesktopWindowInteractions(window, zh)
  return {
    contents, window,
    open: (url: string) => openWindow({ url }),
    navigate(url: string, eventName = 'will-navigate') {
      const event = { preventDefault: vi.fn() }
      contents.emit(eventName, event, url)
      return event
    },
    source: (url: string) => { currentURL = url },
    destroy: () => { destroyed = true },
    context(params: Record<string, unknown> = {}) {
      contents.emit('context-menu', {}, {
        isEditable: false, selectionText: '', linkURL: '',
        editFlags: { canCopy: true, canCut: false, canPaste: true, canSelectAll: true }, ...params,
      })
    },
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('desktop native interactions', () => {
  it.each(['http://example.com/help', 'https://example.com/help?q=a#section'])('hands %s to the browser without a child window', (url) => {
    const app = fixture()
    expect(app.open(url)).toEqual({ action: 'deny' })
    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith(url)
  })

  it.each([
    'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,test', 'mailto:a@example.com',
    'vscode://file/test', 'dsh-resource://file/session/id/test', 'not a URL',
    'https://user:secret@example.com/', 'https://user@example.com/',
  ])('never sends %s to an external protocol handler', (url) => {
    const app = fixture()
    expect(app.open(url)).toEqual({ action: 'deny' })
    expect(app.navigate(url).preventDefault).toHaveBeenCalledOnce()
    expect(electron.openExternal).not.toHaveBeenCalled()
  })

  it.each(['data:text/html,startup', 'https://unowned.example/', 'not a URL'])('refuses browser handoff from %s', (source) => {
    const app = fixture()
    app.source(source)
    app.open('https://example.com/')
    app.context({ linkURL: 'https://example.com/' })
    expect(electron.openExternal).not.toHaveBeenCalled()
    expect(electron.buildFromTemplate).not.toHaveBeenCalled()
  })

  it('preserves owned navigation and blocks external redirects without launching the browser', () => {
    const app = fixture()
    expect(app.navigate('dsh-app://shell/startup.html').preventDefault).not.toHaveBeenCalled()
    expect(app.navigate('dsh-app://unowned/page').preventDefault).toHaveBeenCalledOnce()
    expect(app.navigate('https://example.com/', 'will-redirect').preventDefault).toHaveBeenCalledOnce()
    expect(electron.openExternal).not.toHaveBeenCalled()
  })

  it('offers native copying for selected reply text', () => {
    const app = fixture()
    app.context({ selectionText: 'reply text' })
    expect(electron.buildFromTemplate).toHaveBeenCalledExactlyOnceWith([{ role: 'copy', label: '复制', enabled: true }])
    expect(electron.popup).toHaveBeenCalledWith({ window: app.window })
  })

  it('uses renderer editing flags for editable fields', () => {
    fixture().context({ isEditable: true, editFlags: { canCopy: false, canCut: false, canPaste: true, canSelectAll: true } })
    expect(electron.buildFromTemplate).toHaveBeenCalledWith([
      { role: 'cut', label: '剪切', enabled: false }, { role: 'copy', label: '复制', enabled: false },
      { role: 'paste', label: '粘贴', enabled: true }, { role: 'selectAll', label: '全选', enabled: true },
    ])
  })

  it('opens or copies a validated link from the context menu', () => {
    const app = fixture()
    app.context({ selectionText: 'link', linkURL: 'https://example.com/help' })
    const items = electron.buildFromTemplate.mock.calls[0]![0]
    expect(items.map(item => item.label ?? item.type)).toEqual(['复制', 'separator', '在浏览器中打开链接', '复制链接地址'])
    items[2]!.click?.({} as never, app.window, {})
    items[3]!.click?.({} as never, app.window, {})
    expect(electron.openExternal).toHaveBeenCalledWith('https://example.com/help')
    expect(electron.writeText).toHaveBeenCalledWith('https://example.com/help')
  })

  it('has no empty context menu or executable-protocol link actions', () => {
    const app = fixture()
    app.context()
    app.context({ linkURL: 'file:///etc/passwd' })
    expect(electron.buildFromTemplate).not.toHaveBeenCalled()
  })

  it('allows user-requested webpage actions in preview frames of an owned window', () => {
    const app = fixture()
    app.context({ frameURL: 'about:srcdoc', linkURL: 'https://example.com/preview' })
    const items = electron.buildFromTemplate.mock.calls[0]![0]
    items[0]!.click?.({} as never, app.window, {})
    expect(electron.openExternal).toHaveBeenCalledWith('https://example.com/preview')
  })

  it('shows localized recovery advice without leaking an OS error destination', async () => {
    electron.openExternal.mockRejectedValueOnce(new Error('private query in OS failure'))
    const app = fixture()
    app.open('https://example.com/?private=value')
    await Promise.resolve()
    expect(electron.showMessageBox).toHaveBeenCalledWith(app.window, {
      type: 'error', title: zh.externalLinkFailedTitle, message: zh.externalLinkFailed,
    })
  })

  it('does not show a late handoff failure after the owning window closes', async () => {
    electron.openExternal.mockRejectedValueOnce(new Error('OS failure'))
    const app = fixture()
    app.open('https://example.com/')
    app.destroy()
    await Promise.resolve()
    expect(electron.showMessageBox).not.toHaveBeenCalled()
  })

  it('reports a clipboard failure without disclosing the destination', async () => {
    electron.writeText.mockRejectedValueOnce(new Error('private destination'))
    const app = fixture()
    app.context({ linkURL: 'https://example.com/?private=value' })
    electron.buildFromTemplate.mock.calls[0]![0][1]!.click?.({} as never, app.window, {})
    await Promise.resolve()
    expect(electron.showMessageBox).toHaveBeenCalledWith(app.window, {
      type: 'error', title: zh.copyLinkFailedTitle, message: zh.copyLinkFailed,
    })
  })

  it('does not show a late clipboard failure after the owning window closes', async () => {
    electron.writeText.mockRejectedValueOnce(new Error('clipboard unavailable'))
    const app = fixture()
    app.context({ linkURL: 'https://example.com/' })
    electron.buildFromTemplate.mock.calls[0]![0][1]!.click?.({} as never, app.window, {})
    app.destroy()
    await Promise.resolve()
    expect(electron.showMessageBox).not.toHaveBeenCalled()
  })

  it.each([['en', en], ['zh-CN', zh]] as const)('matches the %s native editing menu', async (locale, messages) => {
    const menu = desktopEditMenu(messages)
    const items = menu.submenu as MenuItemConstructorOptions[]
    const text = [menu.label, ...items.map(item => item.role === undefined ? '---' : `${item.role}: ${item.label}`)].join('\n') + '\n'
    await expect(text).toMatchFileSnapshot(`expected/edit-menu-${locale}.txt`)
  })
})
