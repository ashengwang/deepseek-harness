/** Complete HTML rendered in a script-enabled opaque iframe, without parent application access. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import { createHtmlDocument } from './bootstrap.ts'
import { packHtml } from './pack.ts'
import type { ReadHtmlRelative } from './pack.ts'
import { createReadHtmlRelative } from './read-relative.ts'
import type { ReadHtmlRelated } from './read-relative.ts'
import type {} from './locales.ts'
import css from './HtmlBody.module.css'

/** Standard document inputs plus this renderer's dictionary. */
export type HtmlBodyProps = DocumentPreviewProps & PropsLocale<'documentHtml'> & {
  /** Ordinary Remote callback bound by this renderer's Slot inject. */
  readonly readRelated: ReadHtmlRelated
}

type FrameInput = {
  readonly data: Uint8Array<ArrayBuffer>
  readonly readRelative: ReadHtmlRelative
}

type FrameState = FrameInput & {
  readonly token: string
  readonly url: string | undefined
  readonly printURL: string | undefined
}

interface PrintMessage {
  readonly type: 'dsh-html-preview-print-request' | 'dsh-html-preview-print-finished'
  readonly token: string
}

function printMessage(value: unknown): PrintMessage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const message = value as { type?: unknown; token?: unknown }
  if (message.type !== 'dsh-html-preview-print-request' && message.type !== 'dsh-html-preview-print-finished') return undefined
  if (typeof message.token !== 'string') return undefined
  return message as PrintMessage
}

/** One mounted file owns its root Blob; replacing content also replaces the browsing context. */
function HtmlFrame({ data, readRelative, t }: FrameInput & { t: HtmlBodyProps['t'] }): ReactNode {
  const [frame, setFrame] = useState<FrameState>()
  const [printing, setPrinting] = useState(false)
  const viewRef = useRef<HTMLIFrameElement>(null)
  const printRef = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    setPrinting(false)
    const controller = new AbortController()
    let url: string | undefined
    let printURL: string | undefined
    void (async () => {
      try {
        const bundle = await packHtml(data, readRelative, controller.signal)
        controller.signal.throwIfAborted()
        const token = randomUUID()
        const html = createHtmlDocument(bundle, { printToken: token, autoPrint: false })
        const printHtml = createHtmlDocument(bundle, { printToken: token, autoPrint: true })
        url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
        printURL = URL.createObjectURL(new Blob([printHtml], { type: 'text/html' }))
        setFrame({ data, readRelative, token, url, printURL })
      } catch {
        if (!controller.signal.aborted) {
          if (url !== undefined) {
            URL.revokeObjectURL(url)
            url = undefined
          }
          if (printURL !== undefined) {
            URL.revokeObjectURL(printURL)
            printURL = undefined
          }
          setFrame({ data, readRelative, token: randomUUID(), url: undefined, printURL: undefined })
        }
      }
    })()
    return () => {
      controller.abort()
      if (url !== undefined) URL.revokeObjectURL(url)
      if (printURL !== undefined) URL.revokeObjectURL(printURL)
    }
  }, [data, readRelative])

  useEffect(() => {
    if (frame === undefined) return
    const receive = (event: MessageEvent<unknown>): void => {
      const message = printMessage(event.data)
      if (message?.token !== frame.token) return
      if (message.type === 'dsh-html-preview-print-request' && event.source === viewRef.current?.contentWindow) {
        setPrinting(true)
      }
      if (message.type === 'dsh-html-preview-print-finished' && event.source === printRef.current?.contentWindow) {
        setPrinting(false)
      }
    }
    window.addEventListener('message', receive)
    return () => { window.removeEventListener('message', receive) }
  }, [frame])

  if (frame?.data !== data || frame.readRelative !== readRelative) {
    return <LoadingIndicator className={clsx(css.status, css.opening)} label={t('loading')} />
  }
  if (frame.url === undefined) return <p className={css.status} role="alert">{t('failed')}</p>
  return <>
    <iframe ref={viewRef} key={frame.url} className={css.frame} src={frame.url} sandbox="allow-scripts" title={t('frame')} data-html-preview />
    {printing && frame.printURL !== undefined && <iframe
      ref={printRef}
      className={css.printFrame}
      src={frame.printURL}
      sandbox="allow-scripts allow-modals"
      title={t('printFrame')}
      aria-hidden="true"
      data-html-print-preview
    />}
  </>
}

/**
 * Render complete HTML with the standard file and tab hooks.
 * @param props - document bytes, hooks, related-file reader and locale.
 * @returns an isolated HTML document, or nothing for text delivery.
 */
export function HtmlBody({ content, resourceAddress, readRelated, useTabInfo, t }: HtmlBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const readRelative = useMemo(
    () => createReadHtmlRelative(readRelated, resourceAddress, tab.signal),
    [readRelated, resourceAddress, tab.signal],
  )
  if (content.kind !== 'bytes') return null
  return <HtmlFrame key={resourceAddress} data={content.data} readRelative={readRelative} t={t} />
}
