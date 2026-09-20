# Agent Note: Markdown preview printing

Status: implemented

English | [中文](2026-09-18-markdown-preview-print.zh.md)

## Problem

Markdown previews load long files as sequential text pages. Printing the application window would include the Harness navigation and conversation while omitting pages that the reader had not reached. Requiring users to scroll through the entire file before printing would make the shortcut unreliable for long documents.

## Decision

The Markdown renderer accepts browser-trusted Command-P and Control-P events while focus is inside its rendered document. Clicking static prose focuses the document without changing its visible layout. Synthetic key events do not start printing.

The document owner supplies `requestTextCompletion`, which requests the next text page only when no read is pending, the file has not reached `eof`, and the current read has not failed. A pending print request calls this operation after each accumulated-prefix update until the owner reports `eof`. A read failure stops automatic requests and leaves the ordinary retry control responsible for resuming the read.

Once the complete text is available, the renderer creates a hidden React portal under `document.body` and renders the same Markdown source with streaming disabled. Print media hides the Harness root and shows only this copy with page margins, wrapped code, bounded images, shrinkable wide tables, and page-break protection for code, tables, and quotations. The renderer calls the captured native `window.print` on the next animation frame and removes the copy after a browser-trusted `afterprint` event.

This feature is separate from [HTML preview printing](2026-09-18-html-preview-print.md), whose script-enabled sandbox requires a capability token and a temporary modal-enabled iframe.

## Alternatives considered

**Print the visible preview subtree.** The visible subtree contains only pages loaded so far and lives inside a scrolling application layout, so print output would depend on the reader's scroll history.

**Load every Markdown file eagerly.** This would remove pagination for ordinary reading and increase memory, parsing, and transfer costs even when the user never prints.

**Convert Markdown to PDF before printing.** This introduces a separate document generator and download lifecycle even though the browser already provides print pagination for the rendered document.

## Consequences

Markdown printing completes the same version-aware page sequence used by the reader and never requests a second whole-file API. The visible preview gains a programmatic focus target so the shortcut has a precise scope. The temporary copy duplicates rendering only while printing and does not appear on screen. Unit coverage fixes shortcut authentication and focus behavior; the browser snapshot loads one page by scrolling, loads the final page through printing, verifies that print media hides the Harness shell and fits a wide table within the printable copy, then confirms cleanup after `afterprint`.
