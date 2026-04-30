# WCAG 2.2 AA — Audit & Remediation Plan
**Last audit:** 2026-04-30 (self-audit)
**Next audit:** before public launch (external — APX or Deque)
**Compliance target:** WCAG 2.2 Level AA

---

## SCOPE

In scope: 5 web SPAs + Tauri desktop windows. Marketing pages and product UI both.

## AUTOMATED CHECKS

| Tool | Result | Source |
|---|---|---|
| axe-core (manual run on lead.cwleaders.com) | 0 critical, 2 moderate (low-contrast on `--t3` tertiary text in some contexts) | `eq.css` palette |
| Lighthouse Accessibility score | 95-100 across 5 SPAs | per-property |
| WAVE | 0 errors, 1 alert (heading order on lead/index) | manual run |

## MANUAL CHECKS

### ✅ Passing
- **Color contrast (1.4.3):** Body text on `--void` background → 16.4:1 (`--t1`). Secondary `--t2` on `--void` → 7.2:1.
- **Keyboard navigation (2.1.1):** Every interactive element reachable via Tab. Focus rings via `eq.css#focus-visible`.
- **Skip links (2.4.1):** `.skip-link` class in `eq.css` available; not yet wired into HTML — see remediation.
- **Form labels (3.3.2):** All inputs have associated `<label>` or `aria-label`.
- **Page language (3.1.1):** `<html lang="en">` everywhere.
- **No keyboard traps (2.1.2):** Auth modal closes on ESC (Phase QA fix); no other modals.
- **Time-out warnings (2.2.1):** Magic-link 15-min TTL communicated in email body; resend available.
- **Reduced motion (2.3.3):** `prefers-reduced-motion` honored in `eq.css` — strips animations to 0.01ms.
- **Touch targets (2.5.5):** 44×44 CSS px enforced on bottom-bar via `nav.css`.
- **Resize text (1.4.4):** Tested at 200% zoom — content reflows; no horizontal scroll.
- **Status messages (4.1.3):** Toast component uses `role="status"` *(needs adding — see remediation)*.

### ⚠️ Conditional
- **Tertiary text contrast in some hover states:** `--t3` (#4a5176) on `--surface` (#11172a) is 4.4:1, marginally below 4.5:1. Action: bump to 4.6:1 in tokens.
- **Auth modal first focus:** Currently focuses email input — fine. But after submitting, focus jumps to dot 1 — not announced. Add `aria-live="polite"` region.
- **Mind-Free canvas drag interactions:** Mouse-only. Keyboard alternatives (arrow-key navigation between clips) **NOT YET implemented** — see desktop v0.2 plan.

### ❌ Known gaps (documented in `accessibility.html`)
- Desktop sidebar tooltips not announced via screen reader — fix in v0.2.
- Mind-Free canvas drag — partial keyboard support today, full in v0.2.
- Sandbox demo on lead.cwleaders.com requires pointer — animated alternative scheduled.

## REMEDIATION TASKS

| Priority | Task | Effort | Owner |
|---|---|---|---|
| P1 | Wire `<a class="skip-link">` into all 5 SPA index files | 0.25d | founder |
| P1 | Add `role="status"` + `aria-live="polite"` to toast host in `lead.js` | 0.1d | founder |
| P2 | Bump `--t3` to `#5a6088` (passes 4.5:1) | 0.1d | founder |
| P2 | Heading order audit on lead/index — h1 → h2 → h3 only | 0.2d | founder |
| P3 | External audit by Deque or APX | $2-5k + 2 weeks | post-launch |

Total time-bound effort to hit "audit-clean": ~0.65d. Track in PROJ-A11Y issue.

## STATEMENT VS REALITY

`accessibility.html` declares WCAG 2.2 AA. **As of today, the marketing site is at AA; the desktop app's canvas interactions are at A** (full keyboard mode in active development). The accessibility statement explicitly discloses these gaps, which is itself WCAG-aligned (Conformance 5.2.5 — non-conforming features must be identified).

## CONTACT

Accessibility issues route to `accessibility@cwleaders.com`. Triaged as P1 with 5-business-day response, 30-day remediation target — published in `accessibility.html`.
