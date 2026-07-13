# KaNun Monitoring — "Ink & Seal" Brand System

Live on kanunmonitoring.com since July 2026. Canonical reference for anyone (human
or AI) building KaNun Monitoring surfaces. The implementation source of truth is
`src/pages/inkseal.css` (all classes prefixed `ik-`, scoped under `.ik-page`).

## Concept
"Evidence-grade." The product's value is a document a judge trusts, so the brand IS
the document: ink, paper, sealing-wax red. Master line: **"Every visit. On the record."**

## Palette
- Ink `#161412` (text, dark sections) · Ink-2 `#26231F`
- Paper `#F2EDE3` (page bg) · Vellum `#E4DDCC` · Card `#FBF8F1`
- Sealing wax `#B5301A` (accent, CTAs, seals) · Wax deep `#8E2412` · Wax-on-dark `#E0553C`
- Muted on paper `#57534A` · Muted on ink `#A9A398`
- 5%-opacity SVG-noise grain over every page. One full-wax section per page max.

## Type
- Display: **Fraunces** 340/400/600 — UPPERCASE headlines, one lowercase *italic* word
  in wax, line-height ~0.92, up to clamp(54px, 10.5vw, 164px)
- Labels: **IBM Plex Mono** 10–12px, .14em tracking, UPPERCASE (kickers, forms, tickers)
- Body: **Inter**. Terse copy; index descriptions <= 12 words.

## Voice
- Sections numbered like a brief: "No. 01 — The Premise", "No. 03 — Exhibit A"
- Court-ready messaging order: outcome ("court-ready report in minutes, not
  evenings") -> mechanism ("formatted to the standard your court expects") -> proof
  ("built first to California's exacting Standard 5.20"). Never lead with 5.20.
- Attribution is team-based, never founder-named.
- Funnels: /apply = "Join Pilot 001" (admission framing) · /start = solo instant
  trial ("Work solo. File like a firm.") · /welcome = chooser ("Choose your door.")

## Signature components (see inkseal.css)
Ticker marquee · sticky paper nav · giant hero + 3-cell mono strip · hover-invert
index rows · rotated paper report card with wax seal + FILED stamp (the product
proof — use instead of screenshots) · full-wax creed section · ink math strip ·
door cards · underline-only forms with mono labels · split-panel auth shell
(`.ik-auth` restyles legacy `auth-*` classes) · ghosted SVG footer wordmark ·
IntersectionObserver reveals (respect prefers-reduced-motion).

## Pages on the system
`Landing.jsx` (/welcome) · `PilotApply.jsx` (/ and /apply) · `SoloSignup.jsx`
(/start) · `components/AuthShell.jsx` (login/join/forgot/reset). Fonts loaded in
root `index.html`. Terms/Privacy intentionally left as neutral legal pages.

## Don'ts
No emoji icons, rotating headline words, gradient blobs, glassmorphism, green
(that's other KaNun ventures), founder name in marketing copy, >40-word marketing
paragraphs, corner radii >3px, or generic SaaS icon-card grids. When extending to
in-app UI, apply tokens (palette/type) but keep data-dense screens on quieter
neutral surfaces — the full theatrical treatment is for marketing and auth pages.
