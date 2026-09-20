// @vitest-environment jsdom
/** HTML iframe ownership follows file identity and bytes, not locale or wrapping changes. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { HtmlBody } from '../src/client/html/HtmlBody.tsx'
import type { HtmlBodyProps } from '../src/client/html/HtmlBody.tsx'
import { en } from '../src/client/html/locales.ts'

const translations: ReadonlyMap<string, string> = new Map(Object.entries(en))
let createDescriptor: PropertyDescriptor | undefined
let revokeDescriptor: PropertyDescriptor | undefined
const create = vi.fn<(blob: Blob) => string>()
const revoke = vi.fn<(url: string) => void>()

beforeEach(() => {
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
    if (!(array instanceof Uint8Array)) throw new TypeError('expected Uint8Array')
    array.fill(0)
    return array
  })
  createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  create.mockReset().mockImplementation(() => `blob:https://preview.invalid/${create.mock.calls.length}`)
  revoke.mockReset()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
})

afterEach(() => {
  try { cleanup() } finally {
    if (createDescriptor === undefined) Reflect.deleteProperty(URL, 'createObjectURL')
    else Object.defineProperty(URL, 'createObjectURL', createDescriptor)
    if (revokeDescriptor === undefined) Reflect.deleteProperty(URL, 'revokeObjectURL')
    else Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor)
  }
})

function props(text = '<p>hello</p>'): HtmlBodyProps {
  const signal = new AbortController().signal
  return {
    resourceAddress: 'dsh-resource://file/session/html/index.html',
    content: { kind: 'bytes', data: utf8(text) },
    wrap: false,
    sessionId: 'html' as SessionId,
    useTabInfo: () => ({ tab: { signal } }),
    readRelated: vi.fn(),
    useResource: () => ({ value: undefined }),
    t: key => translations.get(key) ?? key,
  } as HtmlBodyProps
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)

describe('HtmlBody', () => {
  it('renders a Blob iframe with only scripts allowed, keeping it mounted for unrelated props', async () => {
    const initial = props()
    const view = render(<HtmlBody {...initial} />)
    const iframe = await screen.findByTitle(en.frame) as HTMLIFrameElement
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('src')).toBe('blob:https://preview.invalid/1')
    expect(create.mock.calls[0]?.[0].type).toBe('text/html')
    view.rerender(<HtmlBody {...initial} wrap />)
    expect(screen.getByTitle(en.frame)).toBe(iframe)
    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke).not.toHaveBeenCalled()
    view.unmount()
    expect(revoke.mock.calls.map(([url]) => url)).toEqual([
      'blob:https://preview.invalid/1', 'blob:https://preview.invalid/2',
    ])
  })

  it('mounts an allow-modals print copy only for a request from the current HTML frame', async () => {
    render(<HtmlBody {...props()} />)
    const iframe = await screen.findByTitle(en.frame) as HTMLIFrameElement
    const request = new MessageEvent('message', {
      data: { type: 'dsh-html-preview-print-request', token: '00000000-0000-4000-8000-000000000000' },
    })
    Object.defineProperty(request, 'source', { value: iframe.contentWindow })
    act(() => { window.dispatchEvent(request) })
    const printFrame = screen.getByTitle(en.printFrame)
    expect(printFrame.getAttribute('sandbox')).toBe('allow-scripts allow-modals')
    const finished = new MessageEvent('message', {
      data: { type: 'dsh-html-preview-print-finished', token: '00000000-0000-4000-8000-000000000000' },
    })
    Object.defineProperty(finished, 'source', { value: (printFrame as HTMLIFrameElement).contentWindow })
    act(() => { window.dispatchEvent(finished) })
    expect(screen.queryByTitle(en.printFrame)).toBeNull()
  })

  it('ignores print requests with the wrong frame or capability token', async () => {
    render(<HtmlBody {...props()} />)
    const iframe = await screen.findByTitle(en.frame) as HTMLIFrameElement
    const wrongToken = new MessageEvent('message', {
      data: { type: 'dsh-html-preview-print-request', token: 'wrong' },
    })
    Object.defineProperty(wrongToken, 'source', { value: iframe.contentWindow })
    act(() => { window.dispatchEvent(wrongToken) })
    const wrongFrame = new MessageEvent('message', {
      data: { type: 'dsh-html-preview-print-request', token: '00000000-0000-4000-8000-000000000000' },
    })
    Object.defineProperty(wrongFrame, 'source', { value: window })
    act(() => { window.dispatchEvent(wrongFrame) })
    expect(screen.queryByTitle(en.printFrame)).toBeNull()
  })

  it('destroys the old frame and revokes its Blob when bytes or source file change', async () => {
    const view = render(<HtmlBody {...props()} />)
    const first = await screen.findByTitle(en.frame)
    const changed = props('<p>changed</p>')
    view.rerender(<HtmlBody {...changed} />)
    expect(await screen.findByTitle(en.frame)).not.toBe(first)
    expect(first.isConnected).toBe(false)
    expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/1')
    expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/2')
    view.rerender(<HtmlBody {...changed} resourceAddress="dsh-resource://file/session/html/other.html" />)
    await screen.findByTitle(en.frame)
    expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/3')
    expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/4')
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/5')
    expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/6')
  })

  it('reports invalid bytes and Blob creation failures without leaving a previous frame running', async () => {
    const view = render(<HtmlBody {...props()} />)
    await screen.findByTitle(en.frame)
    view.rerender(<HtmlBody {...props()} content={{ kind: 'bytes', data: new Uint8Array([255]) }} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.failed)
    expect(screen.queryByTitle(en.frame)).toBeNull()
    expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/1')
    create.mockImplementationOnce(() => { throw new Error('Blob unavailable') })
    view.rerender(<HtmlBody {...props('different')} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.failed)
    create.mockImplementationOnce(() => 'blob:https://preview.invalid/partial')
    create.mockImplementationOnce(() => { throw new Error('Print Blob unavailable') })
    view.rerender(<HtmlBody {...props('different again')} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.failed)
    await waitFor(() => { expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/partial') })
  })

  it('does not create a document for a text-pages delivery', () => {
    render(<HtmlBody {...props()} content={{ kind: 'text', text: 'plain', pages: [], eof: true }} />)
    expect(create).not.toHaveBeenCalled()
    expect(screen.queryByTitle(en.frame)).toBeNull()
  })

  it('reads related bytes through the injected callback and cancels pending reads on unmount', async () => {
    const pending = Promise.withResolvers<never>()
    const bytes = vi.fn().mockReturnValue(pending.promise)
    const signal = new AbortController().signal
    const initial = {
      ...props('<script src="./app.js"></script>'),
      useTabInfo: () => ({ tab: { signal } }),
      readRelated: bytes,
    } as unknown as HtmlBodyProps
    const view = render(<HtmlBody {...initial} />)
    expect(bytes).toHaveBeenCalledOnce()
    expect(bytes).toHaveBeenCalledWith(initial.resourceAddress, './app.js', expect.any(AbortSignal))
    const readSignal = bytes.mock.calls[0]?.[2] as AbortSignal
    view.unmount()
    expect(readSignal.aborted).toBe(true)
    await act(async () => { pending.reject(new Error('cancelled')) })
    expect(create).not.toHaveBeenCalled()
  })

  it('packages the declared local script without waiting for metadata', async () => {
    const signal = new AbortController().signal
    const bytes = vi.fn().mockResolvedValue({
      ok: true,
      value: { absolutePath: '/workspace/app.js', data: btoa('window.ready=true'), version: 'v1', offset: 0, eof: true },
    })
    const useResource = vi.fn().mockReturnValue({ value: undefined })
    const initial = {
      ...props('<script src="./app.js"></script>'),
      useTabInfo: () => ({ tab: { signal } }),
      useResource,
      readRelated: bytes,
    } as unknown as HtmlBodyProps
    render(<HtmlBody {...initial} />)
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(en.loading)
    expect(screen.getByRole('status').hasAttribute('data-document-loading')).toBe(true)
    expect(create).not.toHaveBeenCalled()
    expect(await screen.findByTitle(en.frame)).toBeTruthy()
    expect(useResource).not.toHaveBeenCalled()
    expect(bytes).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('retains the iframe when only observed metadata changes around the stable injected callback', async () => {
    const signal = new AbortController().signal
    const bytes = vi.fn().mockResolvedValue({
      ok: true,
      value: { absolutePath: '/workspace/app.js', version: 'v1', bytes: 16, offset: 0, data: btoa('window.ready=1'), eof: true },
    })
    const useResource = vi.fn(() => ({ value: { version: 'v1' } }))
    const initial = {
      ...props('<script src="./app.js"></script>'), useTabInfo: () => ({ tab: { signal } }),
      useResource, readRelated: bytes,
    } as unknown as HtmlBodyProps
    const view = render(<HtmlBody {...initial} />)
    const iframe = await screen.findByTitle(en.frame)
    useResource.mockReturnValue({ value: { version: 'v2' } })
    view.rerender(<HtmlBody {...initial} />)
    expect(screen.getByTitle(en.frame)).toBe(iframe)
    expect(bytes).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke).not.toHaveBeenCalled()
  })
})
