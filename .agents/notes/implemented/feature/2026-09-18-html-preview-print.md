# Agent Note: HTML preview printing

Status: implemented

English | [中文](2026-09-18-html-preview-print.zh.md)

## Problem

The HTML document preview occupies an opaque sandboxed iframe. A browser-level print command targets the complete Harness shell, while calling `print()` inside the ordinary frame requires `allow-modals`. Granting that token permanently would let every preview script open JavaScript dialogs even when the user did not request printing.

## Decision

The ordinary HTML iframe retains exactly `sandbox="allow-scripts"`. Its fixed bootstrap captures browser-trusted Command-P and Control-P events before the displayed document runs and posts a capability-token-authenticated request to the owning `HtmlFrame`. Synthetic key events and requests from another window, frame, or token do not start printing.

The owner prepares a second Blob document from the same packed HTML and assets. It mounts that document only after an authenticated shortcut request, with `sandbox="allow-scripts allow-modals"`. The print bootstrap captures the native `window.print` function before the untrusted document runs, calls it after load, reports only a browser-trusted `afterprint`, and then the owner unmounts the print frame. Replacing or unmounting the preview revokes both Blob URLs.

This mechanism applies only while focus is inside an HTML preview. Markdown uses its own [same-document print copy](2026-09-18-markdown-preview-print.md); the remaining preview renderers do not print the surrounding Harness application and remain unsupported until they can supply a document-only representation.

## Alternatives considered

**Print the Electron window.** This prints the project sidebar, conversation, controls, and preview viewport together instead of the document.

**Add `allow-modals` to the ordinary preview.** This is smaller code, but it expands every script-enabled HTML preview's standing authority solely to support an occasional user action.

**Generate a PDF first.** A PDF export needs file ownership, save/open UX, cleanup, and a second user action to reach the system print dialog. It does not satisfy the direct shortcut.

## Consequences

The system print preview receives only the complete HTML document and its packed direct assets. A print request briefly runs a duplicate copy of that document, so its scripts can execute again. The print-only iframe holds modal authority only from the authenticated request through `afterprint`; the ordinary preview's sandbox remains unchanged. Unit coverage pins shortcut capture, token and source checks, temporary sandbox flags, native-print capture, completion cleanup, and Blob revocation.
