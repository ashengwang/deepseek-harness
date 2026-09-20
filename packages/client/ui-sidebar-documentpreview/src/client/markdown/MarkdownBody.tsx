/** One retained Markdown renderer over the document owner's accumulated text. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '../document/contract.ts'
import type {} from './locales.ts'
import css from './MarkdownBody.module.css'

/** Standard document inputs and this implementation's locale. */
export type MarkdownBodyProps = DocumentPreviewProps & PropsLocale<'documentMarkdown'>

/**
 * Whether a browser-authenticated key event requests document-only printing.
 * @param event - keyboard fields used by the Markdown preview.
 * @returns true for Command-P or Control-P without Alt.
 */
export function isMarkdownPrintShortcut(event: Pick<globalThis.KeyboardEvent, 'altKey' | 'ctrlKey' | 'isTrusted' | 'key' | 'metaKey'>): boolean {
  return event.isTrusted && event.key.toLowerCase() === 'p' && (event.metaKey || event.ctrlKey) && !event.altKey
}

/**
 * Render one accumulated document; EOF completes the primitive's full parse.
 * @param props - owner-loaded contents and localized primitive labels.
 * @returns Markdown content, or nothing for a non-text delivery.
 */
export function MarkdownBody({ content, requestTextCompletion, t }: MarkdownBodyProps): ReactNode {
  const [printRequested, setPrintRequested] = useState(false)
  const documentRef = useRef<HTMLDivElement | null>(null)
  const copyLabel = t('code.copy')
  const copiedLabel = t('code.copied')
  const footnotes = t('footnotes')
  const labels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel, copiedLabel }, footnotes,
  }), [copyLabel, copiedLabel, footnotes])
  const focusDocument = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea') !== null) return
    event.currentTarget.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const requestPrint = (event: globalThis.KeyboardEvent): void => {
      const root = documentRef.current
      if (!isMarkdownPrintShortcut(event) || root === null || !root.contains(document.activeElement)) return
      event.preventDefault()
      event.stopPropagation()
      setPrintRequested(true)
    }
    window.addEventListener('keydown', requestPrint, { capture: true })
    return () => { window.removeEventListener('keydown', requestPrint, { capture: true }) }
  }, [])

  useEffect(() => {
    if (!printRequested || content.kind !== 'text') return undefined
    if (!content.eof) {
      requestTextCompletion()
      return undefined
    }
    const print = window.print.bind(window)
    const finish = (event: Event): void => {
      if (!event.isTrusted) return
      window.removeEventListener('afterprint', finish)
      setPrintRequested(false)
    }
    window.addEventListener('afterprint', finish)
    const frame = window.requestAnimationFrame(() => {
      try {
        print()
      } catch {
        window.removeEventListener('afterprint', finish)
        setPrintRequested(false)
      }
    })
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', finish)
    }
  }, [content, printRequested, requestTextCompletion])

  if (content.kind !== 'text') return null
  return (
    <>
      <div
        ref={documentRef}
        className={`${css.document} ${css.readingSurface}`}
        data-document-markdown
        tabIndex={-1}
        onPointerDown={focusDocument}
      >
        <MarkdownText text={content.text} streaming={!content.eof} labels={labels} />
      </div>
      {printRequested && content.eof && createPortal(
        <div className={css.printRoot} data-markdown-print-preview aria-hidden="true">
          <div className={`${css.printDocument} ${css.readingSurface}`}>
            <MarkdownText text={content.text} streaming={false} labels={labels} />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
