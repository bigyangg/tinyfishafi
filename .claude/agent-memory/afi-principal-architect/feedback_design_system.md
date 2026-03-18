---
name: AFI design system enforcement notes
description: Common violations found during audits and how to fix them
type: feedback
---

The AFI design system has non-negotiable rules. Common violations found during code review:

**Color visibility issues:**
- `#2a2a2a` and `#1e1e1e` text on `#050505`/`#060606` backgrounds are essentially invisible. Minimum readable text on dark AFI backgrounds: `#444` for secondary, `#555` for tertiary, `#333` for decorative/disabled only.
- `#0a0a0a` borders on `#050505` or `#060606` backgrounds are invisible. Minimum visible border: `#111`.

**Gradient rule:**
- No CSS `linear-gradient` or `radial-gradient` on backgrounds or decorative elements. Exception: `radial-gradient` as a subtle glow in a fixed/absolute positioned decorative overlay (opacity < 0.1) is acceptable.
- Text gradients via `WebkitBackgroundClip: "text"` are NOT permitted. Use solid `#0066FF` accent or white instead.

**Active nav indicator:**
- Use `#0066FF` (accent) as the active nav border, NOT white. White active indicators break hierarchy.

**Background hierarchy:**
- `#050505` — page background
- `#060606` — sidebar background (subtle separation)
- `#0A0A0A` — surface/cards
- `#0c0c0c` — elevated cards/modals

**Landing page scrolling:**
- Landing page root div must use `overflowX: "hidden", overflowY: "auto"` not `overflow: "hidden"` which prevents scrolling entirely.

**How to apply:** Before any frontend PR, scan for `#2a2a2a`, `#1e1e1e`, `linear-gradient` in text styles, and `overflow: "hidden"` on full-page containers.
