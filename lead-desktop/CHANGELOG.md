# CW Leaders Studio — Desktop Changelog

## v0.1.1 — 2026-04-29 (Master pass)

### Hardening
- API client honors the new server-side rate limits (5 magic-link req / 15 min, 20 checkout / min, 10 hire app / hr) — degraded gracefully on HTTP 429 with toast + retry-after timer.
- All outbound HTTP calls now go through `fetchWithTimeout()` with a 12s ceiling.
- Sidebar 6th item ("Settings & License") wired to in-app license-status panel.
- Strict CSP-compatible: no inline `eval`, no remote `<script>` injection.
- Auto-update check throttled to once per app launch (was every focus).

### UI / accessibility
- Visual EQ pass: focus rings on every interactive element, prefers-reduced-motion honored, 4.5:1 contrast everywhere.
- Compliance footer with links to legal docs available from Help menu.

### Privacy
- `privacy.cwleaders.com/desktop-telemetry` opt-out toggle exposed in Settings.
- Crash reports redact filenames/URLs before submission.

### Known issues
- Sidebar tooltips not yet announced via screen reader (fix scheduled v0.2.0).
- Mind-Free canvas drag interactions need keyboard alternatives (in active development).

---

## v0.1.0 — 2026-04-22 (First public)

- Initial Mac DMG (3.4 MB) + Windows MSI + Linux AppImage builds.
- Local-first screen capture, Whisper transcription, CLIP scene detection.
- Magic-link authentication via lead.cwleaders.com.
- Stripe-backed in-app license purchase + activation.
