# Agent Note: Compact Markdown document preview

Status: implemented

English | [中文](2026-09-20-compact-markdown-document-preview.zh.md)

## Problem

The document preview rendered Markdown with the same generous vertical rhythm as conversational Markdown. Long operational documents therefore showed fewer rows per screen, headings sat far from their following content, and tables depended almost entirely on thin rules to separate adjacent values. Enlarging the right pane increased line length without adding a stable reading column. The shared Markdown renderer also serves chat messages, so changing its baseline would alter a separate reading context.

## Decision

The Markdown document body owns a document-only reading surface. It centres a column capped at 960px, uses the existing 14px content-size setting with a 21px default line height, and applies smaller, tiered gaps to headings, paragraphs, lists, code blocks, quotes, and rules. User content still wraps anywhere for long paths and identifiers.

Tables use 20px line height, 6px vertical and 10px horizontal cell padding, and theme-aware fills that distinguish headers from body cells. A cell keeps an 88px minimum width. The shared renderer's existing rule remains authoritative for table width: tables with fewer than four columns fill the reading column, while wider tables retain their natural width and horizontal scroll. The same reading-surface class is present on the temporary print document; print-specific rules may still reduce cell width and wrap wide tables to fit paper.

These overrides live in the document-preview package. The Cordis-free Markdown primitive and chat presentation keep their existing typography and spacing.

## Alternatives considered

**Change the shared Markdown stylesheet.** This would make chat replies denser even though the reported problem concerns file reading, and it would couple two contexts with different line-length and scanning needs.

**Reduce the global content font size.** A global preference changes chat, tools, source previews, and controls together, while the problem is the document's spacing and table treatment rather than glyph size alone.

**Compress only tables.** Denser cells improve comparison, but the document would still spend excessive height between headings, paragraphs, and lists.

## Consequences

Operational Markdown fits more content in the same pane and its tables expose row and column groups through spacing and surface contrast. Very wide tables still scroll on screen, so compactness does not discard values or force narrow columns. The keyless browser document-preview scenario measures the maximum column width, centring, text rhythm, cell padding, and theme fills before exercising the existing complete-document print path. This decision adds no density toggle; users who need larger text continue to use the existing content-size setting.
