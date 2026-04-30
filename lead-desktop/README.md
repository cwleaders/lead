# CW Leaders Studio — Desktop App

The free, lightweight desktop companion to the CW Leaders ecosystem.
**One install, four tools: Record · Send · Hire · Command.**

- 🪶 Tauri 2 + Rust core (no Electron bloat)
- 🎬 Native screen capture via ffmpeg (works on weak machines)
- 🤖 Local AI bundled (Whisper, CLIP, Tesseract) — runs free on your hardware
- 🔐 Local-first by design — recordings never leave your machine unless you choose
- ✅ Mac (universal), Windows (x86_64), Linux (AppImage + .deb)

## Quick links
- **[BUILD.md](./BUILD.md)** — full build instructions per platform
- **[src-tauri/src/](./src-tauri/src/)** — Rust modules (license, capture, recordings, updater, system)
- **[src/](./src/)** — Mind-Free webview UI

## What's in this directory

```
lead-desktop/
├── package.json                   ← Tauri CLI + dev scripts
├── BUILD.md                       ← per-platform build steps
├── src/                           ← Mind-Free shell UI (HTML / CSS / JS)
│   ├── index.html                 ← entry point
│   ├── style.css                  ← desktop-specific styles
│   ├── app.js                     ← Tauri command bridge
│   └── tokens.css                 ← shared design tokens
├── src-tauri/
│   ├── Cargo.toml                 ← Rust deps (sized for ≤12MB binary)
│   ├── tauri.conf.json            ← bundle settings + updater config
│   ├── capabilities/default.json  ← v2 permissions
│   └── src/
│       ├── main.rs                ← entry point
│       ├── lib.rs                 ← Tauri builder + plugin wiring
│       ├── license.rs             ← /license/validate + JWT cache
│       ├── capture.rs             ← ffmpeg subprocess (cross-platform)
│       ├── recordings.rs          ← list/open/delete local recordings
│       ├── system.rs              ← hardware capability probe
│       └── updater.rs             ← Tauri auto-update wrapper
├── ai-models/                     ← downloaded post-install (NOT committed)
└── .github/workflows/release.yml  ← CI: build + sign + upload to S3
```

## Hardware-aware mode selection

On first launch, Studio probes the user's hardware (CPU cores, RAM, OS) and picks a sensible default:

| Detected hardware | Mode | Default settings |
|---|---|---|
| < 4 GB RAM **or** < 4 cores | **Lite** | 24 fps · 720p · AI deferred to idle |
| 4-8 GB RAM, 4-7 cores | **Standard** | 30 fps · 1080p · AI on demand |
| 8+ GB RAM, 8+ cores | **Pro** | 60 fps · 1440p · AI always on |

This is a non-negotiable requirement: **the app runs on any modern computer**.

## License

Proprietary © 2026 CW Leaders. The bundled open-source dependencies (Tauri, ffmpeg, Rust crates) retain their original licenses — see `LICENSES.md` once generated.
